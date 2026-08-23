#!/usr/bin/env python3
"""
evidence_check.py — turn a ticked verification checkbox back into a checkable claim.

`uow.md` carries four checkboxes that core enforces at G4, and core can only count them: it
cannot tell a ticked box from a true one. This script closes that gap. It reads `run.json`
and the UoW frontmatter and confirms that

    · every AC in the UoW's `verifies:` has a **passing** screenshot
    · at every required environment × every viewport the feature declared
    · that the screenshot file actually exists on disk
    · that no step failed in a required environment
    · that the recorded commit sha matches HEAD

A run that never happened, or happened on a rung where verification does not apply, reports
N/A and exits 0 — never a failure. Only a *contradicted* claim fails.

    evidence_check.py <feature-dir>
    evidence_check.py <feature-dir> --uow UOW-01-course-list
    evidence_check.py <feature-dir> --json

Exit codes: 0 ok or not applicable · 1 the evidence does not support the claim · 2 usage error.
Stdlib only. Must sit beside verify.py — it imports the resolver so the two can never
disagree about which environments are required.
"""

import argparse
import glob
import json
import os
import subprocess
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import verify
except ImportError:  # pragma: no cover - only reachable if the sibling is missing
    print("error: verify.py must sit beside evidence_check.py", file=sys.stderr)
    sys.exit(2)


def core_scripts_dir():
    """Find ai-dlc-core/scripts so the UoW frontmatter is read by core's own parser."""
    candidates = []
    override = os.environ.get("AIDLC_CORE")
    if override:
        candidates += [os.path.join(override, "scripts"), override]
    here = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.normpath(os.path.join(here, "..", "..", "ai-dlc-core", "scripts")))
    candidates.append(os.path.expanduser("~/.claude/skills/ai-dlc-core/scripts"))
    for path in candidates:
        if os.path.isfile(os.path.join(path, "uow_graph.py")):
            return path
    return None


def load_uows(feature_dir):
    """Return ({uow_id: {'verifies': [...], 'path': ...}}, note).

    Core's parser is used whenever it can be found. The fallback reads only `id` and
    `verifies` — a much narrower contract than the full frontmatter schema, chosen so that a
    machine with no core checkout can still audit evidence somebody else produced.
    """
    core = core_scripts_dir()
    if core:
        if core not in sys.path:
            sys.path.insert(0, core)
        try:
            import uow_graph
            uows, _, _, _ = uow_graph.load_plan(feature_dir)
            return ({uid: {"verifies": uow_graph.as_list(meta.get("verifies")),
                           "path": meta.get("_path", "")}
                     for uid, meta in uows.items()},
                    None)
        except Exception:
            pass

    out = {}
    for path in sorted(glob.glob(os.path.join(feature_dir, "04-units-of-work", "*", "uow.md"))):
        front, _ = verify.split_frontmatter(verify.read_text(path))
        meta = verify.parse_yaml(front)
        uid = str(meta.get("id") or os.path.basename(os.path.dirname(path)))
        raw = meta.get("verifies")
        values = raw if isinstance(raw, list) else ([raw] if raw else [])
        out[uid] = {"verifies": [str(v) for v in values], "path": path}
    return out, ("ai-dlc-core not found — UoW frontmatter read with the reduced parser; "
                 "set AIDLC_CORE to the core checkout for the full one")


def head_commit(repo_root):
    try:
        proc = subprocess.run(["git", "-C", repo_root, "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True, timeout=5)
        return proc.stdout.strip() if proc.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def check(feature_dir, only_uow=None):
    """Returns (status, findings) where status is ok | failed | not_applicable."""
    findings = []
    resolution = verify.resolve(feature_dir)

    if resolution["rung"] == verify.RUNG_NOT_APPLICABLE:
        return "not_applicable", [("na", f"verification not applicable — {resolution['reason']}")]
    if resolution["rung"] == verify.RUNG_CONFIG_ERROR:
        return "failed", [("fail", e) for e in resolution["errors"]]
    if resolution["rung"] == verify.RUNG_SKIPPED:
        return "not_applicable", [("na", f"verification skipped — {resolution['reason']}")]

    run = verify.load_run(feature_dir)
    if run is None:
        return "failed", [("fail", "no evidence/run.json — the boxes claim a run that never "
                                   "happened; run verify.py --write")]

    spec = resolution["spec"]
    if not spec:
        return "failed", [("fail", f"{verify.SPEC_FILE} is missing, but a run exists — "
                                   "the evidence cannot be traced back to a declared step")]

    # which environments and viewports the claim covers
    required = [e["name"] for e in resolution["environments"]
                if e["enabled"] and e["required"]
                and (not spec["environments"] or e["name"] in spec["environments"])]
    viewports = [v["name"] for v in resolution["viewports"]
                 if not spec["viewports"] or v["name"] in spec["viewports"]]
    if not required:
        findings.append(("warn", "no required environment applies to this feature — evidence "
                                 "is recorded but gates nothing"))
    ran_envs = {e["name"] for e in run.get("environments", [])}
    for name in required:
        if name not in ran_envs:
            findings.append(("fail", f"required environment {name} was never run"))

    # commit
    commit = run.get("commit") or ""
    head = head_commit(resolution["repo_root"] or feature_dir)
    if not commit:
        findings.append(("fail", "run.json records no commit — the evidence cannot be tied "
                                 "to a revision"))
    elif head and commit != head:
        findings.append(("fail", f"evidence was captured at {commit}, HEAD is {head} — "
                                 "re-run verify.py --write against the code being merged"))
    elif head:
        findings.append(("ok", f"evidence matches HEAD ({head})"))
    if run.get("dirty"):
        findings.append(("warn", "the working tree was dirty when the evidence was captured"))

    # logins and step verdicts
    for env in run.get("environments", []):
        warm = env.get("warmup") or {}
        if warm.get("ok") and (warm.get("attempts", 0) > 1
                               or warm.get("duration_ms", 0) >= 5000):
            findings.append(("warn", f"{env['name']}: warm-up took "
                                     f"{verify._duration(warm.get('duration_ms'))} over "
                                     f"{warm['attempts']} attempt(s) — the environment is "
                                     "slow to come up, which is worth fixing but did not "
                                     "affect any verdict"))
        if env.get("login") == "failed" and env["name"] in required:
            label = "login failed" if warm.get("ok", True) else "never became reachable"
            findings.append(("fail", f"{env['name']}: {label} — {env.get('message', '')}"))

    results = run.get("results", [])
    evidence_root = os.path.join(feature_dir, verify.EVIDENCE_DIR)
    for result in results:
        if result["env"] not in required:
            continue
        if result.get("verdict") != "pass":
            note = "; ".join(result.get("messages", [])) or "failed"
            findings.append(("fail", f"{result['env']}/{result['viewport']}/{result['step']}: "
                                     f"{note}"))
            continue
        shot = result.get("screenshot") or ""
        if not shot or not os.path.isfile(os.path.join(evidence_root, shot)):
            findings.append(("fail", f"{result['env']}/{result['viewport']}/{result['step']} "
                                     "claims pass but its screenshot is missing from disk"))

    # AC coverage, as claimed by the UoW rather than by the step table
    uows, note = load_uows(feature_dir)
    if note:
        findings.append(("warn", note))
    if only_uow:
        if only_uow not in uows:
            return "failed", [("fail", f"no unit of work {only_uow}")]
        uows = {only_uow: uows[only_uow]}

    claimed = sorted({ac for meta in uows.values() for ac in meta["verifies"]})
    not_verified_here = _not_verified_here(feature_dir)
    passing = {}
    steps = {s["id"]: s for s in run.get("steps", [])}
    for result in results:
        if result.get("verdict") != "pass":
            continue
        for ac in steps.get(result["step"], {}).get("verifies", []):
            passing.setdefault(ac, set()).add((result["env"], result["viewport"]))

    for ac in claimed:
        if ac in not_verified_here:
            findings.append(("ok", f"{ac} declared out of browser scope in "
                                   f"'## Not verified here'"))
            continue
        gaps = [f"{env}/{viewport}" for env in required for viewport in viewports
                if (env, viewport) not in passing.get(ac, set())]
        if gaps:
            findings.append(("fail", f"{ac} has no passing evidence at {', '.join(gaps)}"))
    in_scope = [ac for ac in claimed if ac not in not_verified_here]
    covered = [ac for ac in in_scope
               if not [1 for env in required for viewport in viewports
                       if (env, viewport) not in passing.get(ac, set())]]
    if claimed and not any(level == "fail" for level, _ in findings):
        out_of_scope = len(claimed) - len(in_scope)
        findings.append(("ok", f"{len(covered)}/{len(in_scope)} acceptance criteria evidenced "
                               f"at {len(required)} environment(s) × {len(viewports)} viewport(s)"
                               + (f", {out_of_scope} out of browser scope" if out_of_scope else "")))
    if not claimed:
        findings.append(("warn", "no UoW declares `verifies:` — there is nothing to check "
                                 "the evidence against"))

    status = "failed" if any(level == "fail" for level, _ in findings) else "ok"
    return status, findings


def _not_verified_here(feature_dir):
    """AC ids the spec explicitly says are covered somewhere other than a screenshot."""
    import re
    text = verify.read_text(os.path.join(feature_dir, verify.SPEC_FILE))
    match = re.search(r"^##\s+Not verified here\s*$(.*?)(?=^##\s|\Z)", text, re.M | re.S)
    return set(re.findall(r"\bAC-\d+\b", match.group(1))) if match else set()


def main():
    parser = argparse.ArgumentParser(
        description="Validate that ticked verification checkboxes are supported by evidence.")
    parser.add_argument("feature_dir", help="path to .ai/features/<slug>")
    parser.add_argument("--uow", help="check one unit of work instead of all of them")
    parser.add_argument("--json", action="store_true", help="machine-readable findings")
    parser.add_argument("--version", action="version",
                        version=f"aidlc_verify {verify.__version__} (ruleset {verify.RULESET})")
    args = parser.parse_args()

    if not os.path.isdir(args.feature_dir):
        print(f"usage error: {args.feature_dir} is not a directory", file=sys.stderr)
        return 2

    status, findings = check(args.feature_dir, args.uow)

    if args.json:
        json.dump({"status": status,
                   "findings": [{"level": level, "message": message}
                                for level, message in findings]}, sys.stdout, indent=2)
        print()
        return 1 if status == "failed" else 0

    label = {"ok": "PASS", "failed": "FAIL", "not_applicable": "N/A"}[status]
    print(f"evidence check — {os.path.basename(os.path.abspath(args.feature_dir))}: {label}")
    for level, message in findings:
        marker = {"ok": "·", "fail": "✗", "warn": "!", "na": "·"}[level]
        print(f"  {marker} {message}")
    if status == "failed":
        print("\nDo not tick the Verification evidence boxes in uow.md while this fails — "
              "a ticked box that this script contradicts is the exact failure the package "
              "exists to prevent.")
    return 1 if status == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
