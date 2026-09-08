#!/usr/bin/env python3
"""
verify.py — browser verification for an AI-DLC feature plan.

Resolves, at runtime, which of three rungs this project is on, and only ever blocks a gate
on the third:

    not applicable   no `verify:` block in .ai/aidlc.yaml — nothing runs, nothing is written
    skipped          configured, but the credentials its recipe needs are absent — exit 0
    capable          configured and credentialed — full run, evidence required

The ladder exists because this package is installed globally and will meet projects with no
login, no staging environment, and no credentials on this machine. A verification tool that
fails loudly in those cases gets disabled, and a disabled gate is worse than an absent one.

    verify.py <feature-dir> --doctor        which rung; changes nothing
    verify.py <feature-dir>                 run; screenshots into evidence/
    verify.py <feature-dir> --write         run, then generate 08-evidence.md
    verify.py <feature-dir> --env local     restrict to one environment
    verify.py <feature-dir> --manual-login  headed; you log in, the session is saved

Exit codes: 0 ok · 1 failed / config error · 2 usage error.
Stdlib only, deliberately: the browser half lives in scripts/runner/run.py and is invoked as a
subprocess, so a machine with no Playwright can still resolve the ladder and read the evidence.
"""

import argparse
import datetime
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile

__version__ = "0.2.0"
RULESET = 5          # tracks ai-dlc-core's uow_graph.RULESET; bump together

SPEC_FILE = "07-verification.md"
EVIDENCE_DOC = "08-evidence.md"
EVIDENCE_DIR = "evidence"
RUN_JSON = "run.json"
DEFAULT_TIMEOUT_MS = 30000

RECIPES = {"none", "form", "clerk-hosted", "storage-state"}
NONE_TOKENS = {"", "—", "–", "-", "n/a", "none"}

RUNG_NOT_APPLICABLE = "not applicable"
RUNG_SKIPPED = "skipped"
RUNG_CAPABLE = "capable"
RUNG_CONFIG_ERROR = "config error"


def read_text(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()


# --------------------------------------------------------------------------- #
# tiny YAML subset — mappings, block/inline lists, inline maps, scalars
#
# Deliberately not a real parser, for the same reason core's frontmatter reader isn't: the
# schema is fixed and documented, and a dependency-free script can run on a machine that has
# never installed anything. Unknown keys are ignored so a newer config degrades instead of
# crashing.
# --------------------------------------------------------------------------- #

_MAP_ITEM_RE = re.compile(r"^[A-Za-z_][\w.-]*\s*:(\s|$)")


def _strip_comment(line):
    if line.lstrip().startswith("#"):
        return ""
    return line.split("  #")[0].rstrip()


def _parse_scalar(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    low = value.lower()
    if low in {"true", "yes"}:
        return True
    if low in {"false", "no"}:
        return False
    if low in {"null", "~"}:
        return None
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)
    return value


def _split_commas(text):
    out, buf, quote = [], [], None
    for ch in text:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch
            buf.append(ch)
            continue
        if ch == ",":
            out.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    out.append("".join(buf))
    return [p.strip() for p in out]


def _parse_inline(value):
    value = value.strip()
    if value.startswith("{") and value.endswith("}"):
        out = {}
        for pair in _split_commas(value[1:-1]):
            key, sep, val = pair.partition(":")
            if sep and key.strip():
                out[key.strip().strip("'\"")] = _parse_scalar(val)
        return out
    if value.startswith("[") and value.endswith("]"):
        return [_parse_scalar(p) for p in _split_commas(value[1:-1]) if p.strip()]
    return _parse_scalar(value)


def _parse_map(lines, i, indent):
    out, n = {}, len(lines)
    while i < n:
        ind, text = lines[i]
        if ind < indent:
            break
        if ind > indent:
            i += 1
            continue
        if text.startswith("- "):
            break
        key, sep, rest = text.partition(":")
        if not sep:
            i += 1
            continue
        key, rest = key.strip().strip("'\""), rest.strip()
        if rest == "":
            i += 1
            if i < n and lines[i][0] > indent:
                out[key], i = _parse_block(lines, i, lines[i][0])
            else:
                out[key] = None
        else:
            out[key] = _parse_inline(rest)
            i += 1
    return out, i


def _parse_seq(lines, i, indent):
    out, n = [], len(lines)
    while i < n:
        ind, text = lines[i]
        if ind < indent or not text.startswith("- "):
            if ind > indent:
                i += 1
                continue
            break
        body = text[2:].strip()
        i += 1
        if body == "":
            if i < n and lines[i][0] > indent:
                value, i = _parse_block(lines, i, lines[i][0])
            else:
                value = None
            out.append(value)
        elif body.startswith("{") or body.startswith("["):
            out.append(_parse_inline(body))
        elif _MAP_ITEM_RE.match(body):
            cont = []
            while i < n and lines[i][0] > indent:
                cont.append(lines[i])
                i += 1
            body_indent = cont[0][0] if cont else indent + 2
            value, _ = _parse_map([(body_indent, body)] + cont, 0, body_indent)
            out.append(value)
        else:
            out.append(_parse_scalar(body))
    return out, i


def _parse_block(lines, i, indent):
    if lines[i][1].startswith("- "):
        return _parse_seq(lines, i, indent)
    return _parse_map(lines, i, indent)


def parse_yaml(text):
    lines = []
    for raw in text.splitlines():
        line = _strip_comment(raw.replace("\t", "    "))
        if not line.strip():
            continue
        lines.append((len(line) - len(line.lstrip(" ")), line.strip()))
    if not lines:
        return {}
    value, _ = _parse_block(lines, 0, lines[0][0])
    return value if isinstance(value, dict) else {}


def split_frontmatter(text):
    if not text.startswith("---"):
        return "", text
    end = text.find("\n---", 3)
    if end == -1:
        return "", text
    return text[3:end], text[end + 4:]


# --------------------------------------------------------------------------- #
# project resolution
# --------------------------------------------------------------------------- #


def find_ai_dir(start):
    """Nearest .ai/aidlc.yaml walking up, same convention as uow_graph.find_config."""
    path = os.path.abspath(start)
    for _ in range(8):
        candidate = os.path.join(path, ".ai", "aidlc.yaml")
        if os.path.isfile(candidate):
            return os.path.dirname(candidate)
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    return None


def load_credentials(ai_dir):
    creds = {}
    for line in read_text(os.path.join(ai_dir, "credentials.env")).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        creds[key.strip()] = value
    return creds


def credential(creds, key):
    """File first, process environment second — the fallback is what makes CI work."""
    value = creds.get(key, "")
    if not value:
        value = os.environ.get(key, "")
    return value.strip()


VAR_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def interpolate(value, creds, missing):
    if isinstance(value, str):
        def sub(match):
            resolved = credential(creds, match.group(1))
            if not resolved:
                missing.add(match.group(1))
                return match.group(0)
            return resolved
        return VAR_RE.sub(sub, value)
    if isinstance(value, dict):
        return {k: interpolate(v, creds, missing) for k, v in value.items()}
    if isinstance(value, list):
        return [interpolate(v, creds, missing) for v in value]
    return value


WARMUP_ATTEMPT_CEILING = 5


def read_warmup(label, raw, errors):
    """Warm-up is "wait until the environment exists", not a retry of a verdict.

    A cold ALB, a container that boots on first request, a lazily-opened pool — these make the
    first request slow or fail, and calling that flaky mislabels it. The ceiling on `attempts`
    is what keeps the two apart: an environment that needs six probes is broken, not cold, and
    a retry budget that large would start hiding real regressions.
    """
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        errors.append(f"{label}: warmup must be a mapping")
        return {}
    out = {}
    if "path" in raw:
        out["path"] = str(raw["path"])
        if not out["path"].startswith("/"):
            errors.append(f"{label}: warmup.path {out['path']!r} must start with /")
    if "attempts" in raw:
        try:
            attempts = int(raw["attempts"])
        except (TypeError, ValueError):
            errors.append(f"{label}: warmup.attempts must be a whole number")
            attempts = 1
        if attempts < 0:
            errors.append(f"{label}: warmup.attempts cannot be negative")
        elif attempts > WARMUP_ATTEMPT_CEILING:
            errors.append(
                f"{label}: warmup.attempts {attempts} exceeds the {WARMUP_ATTEMPT_CEILING} "
                "ceiling — warm-up absorbs a cold start, it does not retry a flaky assertion. "
                "An environment that needs that many probes is broken, not cold; raise "
                "warmup.timeout_ms instead, or fix the environment."
            )
        out["attempts"] = attempts
    if "timeout_ms" in raw:
        try:
            timeout = int(raw["timeout_ms"])
        except (TypeError, ValueError):
            errors.append(f"{label}: warmup.timeout_ms must be a whole number of milliseconds")
            timeout = 0
        if timeout <= 0:
            errors.append(f"{label}: warmup.timeout_ms must be positive")
        out["timeout_ms"] = timeout
    return out


def effective_warmup(global_warmup, env_warmup, default_timeout):
    merged = {**(global_warmup or {}), **(env_warmup or {})}
    return {
        "path": merged.get("path", "/"),
        "attempts": int(merged.get("attempts", 1)),
        "timeout_ms": int(merged.get("timeout_ms", default_timeout)),
    }


def merge_auth(base, override):
    out = dict(base or {})
    for key, value in (override or {}).items():
        if key in {"selectors", "ready_when"} and isinstance(value, dict) \
                and isinstance(out.get(key), dict):
            merged = dict(out[key])
            merged.update(value)
            out[key] = merged
        else:
            out[key] = value
    return out


def env_prefix(name, auth):
    raw = auth.get("credentials_prefix") or name
    return re.sub(r"[^A-Z0-9]+", "_", str(raw).upper()).strip("_")


def git_info(repo_root):
    def run(*cmd):
        try:
            proc = subprocess.run(["git", "-C", repo_root, *cmd],
                                  capture_output=True, text=True, timeout=5)
            return proc.stdout.strip() if proc.returncode == 0 else ""
        except (OSError, subprocess.SubprocessError):
            return ""
    return {
        "commit": run("rev-parse", "--short", "HEAD"),
        "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
        "dirty": bool(run("status", "--porcelain")),
    }


def ruleset_warning(ai_dir):
    match = re.search(r"^ruleset:\s*(\d+)", read_text(os.path.join(ai_dir, "aidlc.yaml")), re.M)
    if not match:
        return None
    pinned = int(match.group(1))
    if pinned == RULESET:
        return None
    return (f"plan pins ruleset {pinned}, aidlc_verify implements {RULESET} — "
            "the two move together; check ai-dlc-core before trusting this run")


# --------------------------------------------------------------------------- #
# 07-verification.md
# --------------------------------------------------------------------------- #


def _cell(text):
    return text.strip().strip("`").strip()


def _is_none(text):
    return _cell(text).lower() in NONE_TOKENS


def parse_interaction(raw):
    actions, errors = [], []
    if _is_none(raw):
        return actions, errors
    for part in _cell(raw).split(";"):
        part = _cell(part)
        if not part:
            continue
        match = re.match(r"(?i)^fill\s+(.+?)\s*=\s*(.+)$", part)
        if match:
            actions.append({"verb": "fill", "selector": match.group(1).strip(),
                            "value": match.group(2).strip().strip("'\"")})
            continue
        match = re.match(r"(?i)^(click|wait|scroll)\s+(.+)$", part)
        if match:
            actions.append({"verb": match.group(1).lower(), "selector": match.group(2).strip()})
            continue
        errors.append(f"unparseable interaction {part!r} — the verbs are click, fill, wait, scroll")
    return actions, errors


def parse_asserts(raw):
    asserts, errors = [], []
    if _is_none(raw):
        return asserts, errors
    for part in _cell(raw).split(";"):
        part = _cell(part)
        if not part:
            continue
        match = re.match(r"(?i)^count\s+(.+?)\s*=\s*(\d+)$", part)
        if match:
            asserts.append({"kind": "count", "selector": match.group(1).strip(),
                            "value": int(match.group(2))})
            continue
        match = re.match(r"(?i)^no-text\s*=\s*(.+)$", part)
        if match:
            asserts.append({"kind": "no-text", "value": match.group(1).strip().strip("'\"")})
            continue
        match = re.match(r"(?i)^text\s*=\s*(.+)$", part)
        if match:
            asserts.append({"kind": "text", "value": match.group(1).strip().strip("'\"")})
            continue
        errors.append(f"unparseable assertion {part!r} — the forms are "
                      "text=<v>, no-text=<v>, count <sel> = n")
    return asserts, errors


def load_spec(feature_dir):
    """Parse 07-verification.md. Returns (spec_or_None, errors, warnings)."""
    path = os.path.join(feature_dir, SPEC_FILE)
    if not os.path.isfile(path):
        return None, [], []

    front, body = split_frontmatter(read_text(path))
    meta = parse_yaml(front)
    errors, warnings, steps, seen = [], [], [], set()

    for line in body.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [c for c in line.strip().strip("|").split("|")]
        if len(cells) < 5 or not re.fullmatch(r"(?i)s\d+", _cell(cells[0])):
            continue
        sid = _cell(cells[0]).upper()
        if sid in seen:
            errors.append(f"{SPEC_FILE}: duplicate step id {sid}")
            continue
        seen.add(sid)
        actions, action_errors = parse_interaction(cells[3])
        asserts, assert_errors = parse_asserts(cells[5] if len(cells) > 5 else "")
        errors += [f"{SPEC_FILE} {sid}: {e}" for e in action_errors + assert_errors]
        verifies = [v.strip().upper() for v in re.split(r"[,\s]+", _cell(cells[4])) if v.strip()]
        step = {
            "id": sid,
            "title": _cell(cells[1]),
            "path": _cell(cells[2]),
            "actions": actions,
            "asserts": asserts,
            "verifies": [v for v in verifies if v not in {"—", "-"}],
        }
        if not step["path"].startswith("/"):
            errors.append(f"{SPEC_FILE} {sid}: path {step['path']!r} must start with /")
        if not asserts:
            warnings.append(f"{sid} has no Assert — it can only prove the page loaded, "
                            "not that the feature is right")
        steps.append(step)

    if not steps:
        errors.append(f"{SPEC_FILE} has no step rows — the table needs ids matching S<n> "
                      "in the first column")

    def as_list(value):
        if value is None:
            return []
        return value if isinstance(value, list) else [value]

    spec = {
        "path": path,
        "feature": meta.get("feature", ""),
        "environments": [str(v) for v in as_list(meta.get("environments"))],
        "viewports": [str(v) for v in as_list(meta.get("viewports"))],
        "steps": steps,
    }
    return spec, errors, warnings


def requirement_acs(feature_dir):
    text = read_text(os.path.join(feature_dir, "02-requirements.md"))
    return set(re.findall(r"\bAC-\d+\b", text))


def feature_title(feature_dir):
    for name in ("00-intent.md", SPEC_FILE):
        match = re.search(r"^#\s+(.+?)\s*$", read_text(os.path.join(feature_dir, name)), re.M)
        if match:
            return re.sub(r"^(Intent|Verification)\s*[—-]\s*", "", match.group(1)).strip()
    return os.path.basename(os.path.abspath(feature_dir))


# --------------------------------------------------------------------------- #
# the ladder
# --------------------------------------------------------------------------- #


def resolve(feature_dir):
    """Resolve the rung and everything a run would need. Reads only; never writes."""
    feature_dir = os.path.abspath(feature_dir)
    out = {
        "feature_dir": feature_dir,
        "slug": os.path.basename(feature_dir),
        "rung": RUNG_NOT_APPLICABLE,
        "reason": "",
        "errors": [],
        "warnings": [],
        "environments": [],
        "viewports": [],
        "failure_signals": [],
        "console_errors": False,
        "timeout_ms": DEFAULT_TIMEOUT_MS,
        "warmup": {},
        "spec": None,
        "ai_dir": None,
        "repo_root": None,
    }

    ai_dir = find_ai_dir(feature_dir)
    if not ai_dir:
        out["reason"] = "no .ai/aidlc.yaml above this feature — not an AI-DLC project"
        return out
    out["ai_dir"] = ai_dir
    out["repo_root"] = os.path.dirname(ai_dir)

    config = parse_yaml(read_text(os.path.join(ai_dir, "aidlc.yaml")))
    block = config.get("verify")
    if not isinstance(block, dict) or not block:
        out["reason"] = "no `verify:` block in .ai/aidlc.yaml — this project has not opted in"
        return out

    warn = ruleset_warning(ai_dir)
    if warn:
        out["warnings"].append(warn)

    creds = load_credentials(ai_dir)
    out["timeout_ms"] = int(block.get("timeout_ms") or DEFAULT_TIMEOUT_MS)
    out["warmup"] = read_warmup("verify.warmup", block.get("warmup"), out["errors"])

    # failure signals: selector maps, plus the bare `console_errors` token
    for signal in (block.get("failure_signals") or []):
        if isinstance(signal, dict) and signal.get("selector"):
            out["failure_signals"].append({
                "selector": str(signal["selector"]),
                "message": str(signal.get("message") or "failure signal matched"),
            })
        elif str(signal).strip() == "console_errors":
            out["console_errors"] = True
        else:
            out["errors"].append(f"unrecognised failure_signal {signal!r}")

    # viewports
    viewports = block.get("viewports") or {}
    if not isinstance(viewports, dict) or not viewports:
        out["errors"].append("verify.viewports is empty — declare at least one")
        viewports = {}
    for name, spec in viewports.items():
        spec = spec if isinstance(spec, dict) else {}
        if not spec.get("width") or not spec.get("height"):
            out["errors"].append(f"viewport {name}: width and height are both required")
            continue
        out["viewports"].append({
            "name": name,
            "width": int(spec["width"]),
            "height": int(spec["height"]),
            "isMobile": bool(spec.get("isMobile", False)),
            "deviceScaleFactor": float(spec.get("deviceScaleFactor", 1) or 1),
        })

    # environments
    global_auth = block.get("auth") if isinstance(block.get("auth"), dict) else {}
    environments = block.get("environments") or {}
    if not isinstance(environments, dict) or not environments:
        out["errors"].append("verify.environments is empty — declare at least one")
        environments = {}

    auth_dir = os.path.join(ai_dir, ".auth")
    for name, raw in environments.items():
        raw = raw if isinstance(raw, dict) else {}
        enabled = bool(raw.get("enabled", True))
        required = bool(raw.get("required", False))
        if required and not enabled:
            out["errors"].append(
                f"environment {name} is required and disabled — that is a contradiction the "
                "tool will not resolve for you"
            )
        missing_vars = set()
        url = interpolate(str(raw.get("url") or ""), creds, missing_vars)
        auth = merge_auth(global_auth, raw.get("auth") if isinstance(raw.get("auth"), dict) else {})
        recipe = str(auth.get("recipe") or "none")
        if recipe not in RECIPES:
            out["errors"].append(
                f"environment {name}: unknown auth recipe {recipe!r} — one of {sorted(RECIPES)}"
            )
        if not url:
            out["errors"].append(f"environment {name}: no url")

        prefix = env_prefix(name, auth)
        values, missing_keys = {}, sorted(missing_vars)
        state_file = os.path.join(auth_dir, f"{name}.json")

        if recipe in {"form", "clerk-hosted"}:
            user = ""
            for suffix in ("EMAIL", "USER", "USERNAME"):
                user = user or credential(creds, f"{prefix}_{suffix}")
            password = credential(creds, f"{prefix}_PASSWORD")
            if not user:
                missing_keys.append(f"{prefix}_EMAIL")
            if not password:
                missing_keys.append(f"{prefix}_PASSWORD")
            values = {"user": user, "password": password,
                      "totp_secret": credential(creds, f"{prefix}_TOTP_SECRET")}
        elif recipe == "storage-state":
            if not os.path.isfile(state_file):
                missing_keys.append(os.path.join(".ai", ".auth", f"{name}.json"))

        out["environments"].append({
            "name": name,
            "url": url,
            "enabled": enabled,
            "required": required,
            "writes": bool(raw.get("writes", True)),
            "auth": auth,
            "recipe": recipe,
            "prefix": prefix,
            "state_file": state_file,
            "credentials": values,          # never printed, never serialised to disk
            "missing": missing_keys,
            "ready": not missing_keys,
            "warmup": read_warmup(f"environment {name}", raw.get("warmup"), out["errors"]),
        })

    spec, spec_errors, spec_warnings = load_spec(feature_dir)
    out["spec"] = spec
    out["warnings"] += spec_warnings
    out["errors"] += spec_errors

    known_envs = {e["name"] for e in out["environments"]}
    known_viewports = {v["name"] for v in out["viewports"]}
    if spec:
        for name in spec["environments"]:
            if name not in known_envs:
                out["errors"].append(
                    f"{SPEC_FILE} declares environment {name!r}, which .ai/aidlc.yaml does not define"
                )
        for name in spec["viewports"]:
            if name not in known_viewports:
                out["errors"].append(
                    f"{SPEC_FILE} declares viewport {name!r}, which .ai/aidlc.yaml does not define"
                )
        acs = requirement_acs(feature_dir)
        if acs:
            for step in spec["steps"]:
                for ac in step["verifies"]:
                    if ac not in acs:
                        out["warnings"].append(
                            f"{step['id']} verifies {ac}, which is not in 02-requirements.md"
                        )

    if out["errors"]:
        out["rung"] = RUNG_CONFIG_ERROR
        out["reason"] = "the configuration contradicts itself; fix it rather than working around it"
        return out

    gating = [e for e in out["environments"] if e["enabled"] and e["required"]]
    if spec and spec["environments"]:
        gating = [e for e in gating if e["name"] in spec["environments"]]
    if not gating:
        gating = [e for e in out["environments"] if e["enabled"]]

    unready = [e for e in gating if not e["ready"]]
    if unready:
        names = ", ".join(e["name"] for e in unready)
        recipes = ", ".join(sorted({e["recipe"] for e in unready}))
        out["rung"] = RUNG_SKIPPED
        out["reason"] = f"no credentials configured for {names} (auth.recipe: {recipes})"
        return out

    out["rung"] = RUNG_CAPABLE
    out["reason"] = "configured and credentialed"
    return out


def select(resolution, env_filter, viewport_filter):
    """Narrow to what this invocation should run. Returns (envs, viewports, errors)."""
    spec = resolution["spec"]
    envs = [e for e in resolution["environments"] if e["enabled"]]
    viewports = list(resolution["viewports"])
    errors = []

    if spec and spec["environments"]:
        envs = [e for e in envs if e["name"] in spec["environments"]]
    if spec and spec["viewports"]:
        viewports = [v for v in viewports if v["name"] in spec["viewports"]]

    if env_filter:
        known = {e["name"] for e in resolution["environments"]}
        for name in env_filter:
            if name not in known:
                errors.append(f"unknown environment {name!r} — configured: {', '.join(sorted(known))}")
        envs = [e for e in envs if e["name"] in set(env_filter)]
    if viewport_filter:
        known = {v["name"] for v in resolution["viewports"]}
        for name in viewport_filter:
            if name not in known:
                errors.append(f"unknown viewport {name!r} — configured: {', '.join(sorted(known))}")
        viewports = [v for v in viewports if v["name"] in set(viewport_filter)]

    if not envs and not errors:
        errors.append("nothing to run — every configured environment was filtered out")
    if not viewports and not errors:
        errors.append("nothing to run — every configured viewport was filtered out")
    return envs, viewports, errors


# --------------------------------------------------------------------------- #
# the runner
# --------------------------------------------------------------------------- #


def runner_dir():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "runner")


def runner_python():
    """The interpreter that has Playwright. Defaults to this one; a venv can override it.

    Keeping the browser dependency in a *separate process* rather than importing it here is
    what keeps verify.py stdlib-only: a machine with no Playwright can still resolve the
    ladder, read run.json and generate 08-evidence.md.
    """
    return os.environ.get("AIDLC_VERIFY_PYTHON") or sys.executable


def runner_state():
    """(ok, message). A missing runner is a machine problem, not a project one."""
    interpreter = runner_python()
    if not os.path.isfile(interpreter) and not shutil.which(interpreter):
        return False, f"AIDLC_VERIFY_PYTHON points at {interpreter}, which is not an interpreter"
    probe = subprocess.run(
        [interpreter, "-c",
         "import importlib.metadata as m, playwright.sync_api; print(m.version('playwright'))"],
        capture_output=True, text=True,
    )
    if probe.returncode != 0:
        return False, (f"playwright is not installed for {interpreter} — run: "
                       f"{interpreter} -m pip install playwright && "
                       f"{interpreter} -m playwright install chromium "
                       "(or point AIDLC_VERIFY_PYTHON at a venv that has it)")
    return True, f"playwright {probe.stdout.strip()} · {interpreter}"


def build_plan(resolution, envs, viewports, mode):
    spec = resolution["spec"]
    git = git_info(resolution["repo_root"] or ".")
    return {
        "schema": 1,
        "tool": f"aidlc_verify {__version__}",
        "ruleset": RULESET,
        "mode": mode,
        "feature": resolution["slug"],
        "out_dir": os.path.join(resolution["feature_dir"], EVIDENCE_DIR),
        "auth_dir": os.path.join(resolution["ai_dir"], ".auth"),
        "timeout_ms": resolution["timeout_ms"],
        "warmup": resolution["warmup"],
        "failure_signals": resolution["failure_signals"],
        "console_errors": resolution["console_errors"],
        "meta": {
            "commit": git["commit"],
            "branch": git["branch"],
            "dirty": git["dirty"],
            "generated_by": f"aidlc_verify {__version__}",
        },
        "environments": [{
            "name": e["name"],
            "url": e["url"].rstrip("/"),
            "required": e["required"],
            "writes": e["writes"],
            "recipe": e["recipe"],
            "auth": {k: v for k, v in e["auth"].items() if k != "credentials_prefix"},
            "warmup": e["warmup"],
            "state_file": e["state_file"],
            # credentials travel over stdin and are never written to disk
            "credentials": {} if mode == "manual-login" else e["credentials"],
        } for e in envs],
        "viewports": viewports,
        "steps": spec["steps"] if spec else [],
    }


def invoke_runner(plan, extra_args=()):
    """Run the browser half. The plan goes over stdin so credentials never touch disk.

    manual-login is the exception: stdin has to stay free for the human's Enter, so the
    plan goes to a 0600 temp file — and that mode reads no credentials at all.
    """
    script = os.path.join(runner_dir(), "run.py")
    interpreter = runner_python()
    payload = json.dumps(plan)
    if plan["mode"] == "manual-login":
        handle, path = tempfile.mkstemp(prefix="aidlc-verify-", suffix=".json")
        try:
            os.fchmod(handle, stat.S_IRUSR | stat.S_IWUSR)
            with os.fdopen(handle, "w", encoding="utf-8") as fh:
                fh.write(payload)
            return subprocess.run([interpreter, script, "--plan", path, *extra_args]).returncode
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
    proc = subprocess.run([interpreter, script, "--plan-stdin", *extra_args],
                          input=payload, text=True)
    return proc.returncode


def load_run(feature_dir):
    path = os.path.join(feature_dir, EVIDENCE_DIR, RUN_JSON)
    if not os.path.isfile(path):
        return None
    try:
        return json.loads(read_text(path))
    except ValueError:
        return None


# --------------------------------------------------------------------------- #
# generated artifacts
# --------------------------------------------------------------------------- #


def _duration(ms):
    ms = ms or 0
    return f"{ms}ms" if ms < 1000 else f"{ms / 1000:.1f}s"


def coverage_table(run):
    """AC → {env → [viewport, ...]} for the viewports where the step passed."""
    steps = {s["id"]: s for s in run.get("steps", [])}
    table = {}
    for result in run.get("results", []):
        step = steps.get(result["step"], {})
        for ac in step.get("verifies", []):
            entry = table.setdefault(ac, {"steps": set(), "envs": {}})
            entry["steps"].add(result["step"])
            if result.get("verdict") == "pass":
                entry["envs"].setdefault(result["env"], set()).add(result["viewport"])
    return table


def render_evidence_doc(run, title, feature_dir):
    counts = run.get("counts", {})
    envs = [e["name"] for e in run.get("environments", [])]
    viewports = [v["name"] for v in run.get("viewports", [])]
    status = run.get("status", "unknown")

    out = [
        f"<!-- GENERATED by {run.get('tool', 'aidlc_verify')} — do not edit; "
        "re-run verify.py --write -->",
        f"# Evidence — {title}",
        "",
        f"status: {status} · {counts.get('pass', 0)}/{counts.get('total', 0)} steps · "
        f"{len(envs)} environment(s) × {len(viewports)} viewport(s)",
        f"commit: {run.get('commit') or 'unknown'}"
        f"{' (working tree dirty)' if run.get('dirty') else ''} · "
        f"{run.get('browser', 'unknown')} · {run.get('finished_at', '')}",
        "",
        "## Environments",
        "",
        "| Env | Gates | Warm-up | Login |",
        "|---|---|---|---|",
    ]
    for env in run.get("environments", []):
        warm = env.get("warmup") or {}
        if warm.get("message") == "disabled":
            warm_cell = "off"
        elif warm.get("ok", True):
            warm_cell = _duration(warm.get("duration_ms"))
            if warm.get("attempts", 1) > 1:
                warm_cell += f" · {warm['attempts']} attempts"
        else:
            warm_cell = "**unreachable**"
        out.append(f"| {env['name']} | {'yes' if env.get('required') else 'no'} | "
                   f"{warm_cell} | {env.get('login', '?')} |")
    out += [
        "",
        "Warm-up is one unjudged request per environment, taken before any verdict, so a cold "
        "start is visible here rather than mislabelled as a flaky step.",
        "",
        "## Runs",
        "",
        "| Env | Viewport | Step | Verdict | Duration | Notes |",
        "|---|---|---|---|---|---|",
    ]
    for result in run.get("results", []):
        notes = "; ".join(result.get("messages", [])) or "—"
        out.append(
            f"| {result['env']} | {result['viewport']} | {result['step']} | "
            f"{result.get('verdict', '?')} | {_duration(result.get('duration_ms'))} | "
            f"{notes.replace('|', '/')} |"
        )

    broken = [e for e in run.get("environments", []) if e.get("login") == "failed"]
    if broken:
        out += ["", "## Environment failures", ""]
        for env in broken:
            reachable = (env.get("warmup") or {}).get("ok", True)
            label = "login failed" if reachable else "unreachable"
            out.append(f"- **{env['name']}** ({label}) — {env.get('message', '')}")

    table = coverage_table(run)
    out += ["", "## Coverage", "", "| AC | Steps | " + " | ".join(envs) + " |",
            "|---|---|" + "---|" * len(envs)]
    for ac in sorted(table):
        entry = table[ac]
        cells = []
        for env in envs:
            got = sorted(entry["envs"].get(env, []))
            cells.append(", ".join(got) if got else "—")
        out.append(f"| {ac} | {', '.join(sorted(entry['steps']))} | " + " | ".join(cells) + " |")
    if not table:
        out.append("| — | — |" + " — |" * len(envs))

    out += ["", "## PR draft", "", render_pr_draft(run, title)]
    return "\n".join(out) + "\n"


def verified_acs(run):
    """ACs with at least one passing step and no failing one — the only ones a PR may claim."""
    steps = {s["id"]: s for s in run.get("steps", [])}
    passed, failed = set(), set()
    for result in run.get("results", []):
        for ac in steps.get(result["step"], {}).get("verifies", []):
            (passed if result.get("verdict") == "pass" else failed).add(ac)
    return sorted(passed - failed)


def render_pr_draft(run, title):
    counts = run.get("counts", {})
    acs = verified_acs(run)
    envs = run.get("environments", [])
    viewports = run.get("viewports", [])
    browser = run.get("browser", "browser")
    commit = run.get("commit") or "unknown"
    ticket = run.get("ticket") or "<TICKET>"

    failures = [r for r in run.get("results", []) if r.get("verdict") != "pass"]
    login_failures = [e for e in envs if e.get("login") == "failed"]

    lines = [
        f"## {ticket} — {title}",
        "",
        "- <what changed, in the reviewer's terms>",
        "- <the one thing worth knowing that the diff does not show>",
    ]
    if acs:
        lines.append("- " + " · ".join(acs) + " verified")
    lines.append("")

    env_names = " + ".join(e["name"] for e in envs)
    shots = " · ".join(f"{v['name']} {v['width']}" for v in viewports)
    if failures or login_failures:
        detail = []
        for result in failures[:4]:
            note = "; ".join(result.get("messages", [])) or "failed"
            detail.append(f"{result['step']} failed on {result['env']} ({note})")
        for env in login_failures:
            detail.append(f"{env['name']} login failed ({env.get('message', '')})")
        lines.append(
            f"**Verification** · {counts.get('pass', 0)}/{counts.get('total', 0)} passed · "
            + " · ".join(detail)
        )
    else:
        lines.append(f"**Verified** · {env_names} · {shots} · {browser} · `{commit}`")
    lines.append("")
    for env in envs:
        if run.get("contact_sheets", {}).get(env["name"]):
            lines.append(f"<!-- DROP contact-sheet-{env['name']}.png HERE -->")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #


def print_doctor(resolution, args):
    slug = resolution["slug"]
    ok_runner, runner_message = runner_state()
    print(f"verify — {slug}")
    print(f"rung:     {resolution['rung']}")
    print(f"reason:   {resolution['reason']}")
    if resolution["ai_dir"]:
        print(f"config:   {os.path.join(resolution['ai_dir'], 'aidlc.yaml')}")
    if resolution["rung"] == RUNG_CAPABLE:
        print(f"runner:   {runner_message}")

    if resolution["rung"] == RUNG_NOT_APPLICABLE:
        # Nothing below was resolved — printing an empty spec section here would read as
        # "07-verification.md is missing" on a project that simply never opted in.
        print("\nnext:  nothing. Do not write a verification section into uow.md; G4 stays "
              "the human demo.")
        return 0

    if resolution["environments"]:
        print("\nenvironments")
        for env in resolution["environments"]:
            if not env["enabled"]:
                state = "never run (enabled: false)"
            elif env["ready"]:
                state = "credentials present"
            else:
                state = "missing " + ", ".join(env["missing"])
            flags = "required" if env["required"] else "optional"
            if not env["writes"]:
                flags += ", read-only"
            print(f"  {env['name']:<16} {flags:<20} {env['url'] or '—':<38} "
                  f"{env['recipe']:<14} {state}")
            warm = effective_warmup(resolution["warmup"], env["warmup"],
                                    resolution["timeout_ms"])
            if warm != effective_warmup({}, {}, resolution["timeout_ms"]):
                print(f"  {'':<16} warm-up {warm['attempts']}× {warm['timeout_ms'] / 1000:g}s "
                      f"at {warm['path']} — absorbed before any verdict is taken")

    if resolution["viewports"]:
        print("\nviewports")
        for viewport in resolution["viewports"]:
            mobile = " (mobile UA + touch)" if viewport["isMobile"] else ""
            print(f"  {viewport['name']:<16} {viewport['width']}×{viewport['height']}{mobile}")

    spec = resolution["spec"]
    print("\nspec")
    if spec:
        print(f"  {SPEC_FILE}: {len(spec['steps'])} step(s), "
              f"environments {spec['environments'] or '(all)'}, "
              f"viewports {spec['viewports'] or '(all)'}")
        no_assert = [s["id"] for s in spec["steps"] if not s["asserts"]]
        if no_assert:
            print(f"  no Assert on: {', '.join(no_assert)}")
    else:
        print(f"  {SPEC_FILE}: not written yet")

    for warning in resolution["warnings"]:
        print(f"warn:  {warning}")
    for error in resolution["errors"]:
        print(f"ERROR: {error}", file=sys.stderr)

    print()
    if resolution["rung"] == RUNG_NOT_APPLICABLE:
        print("next:  nothing. Do not write a verification section into uow.md; G4 stays "
              "the human demo.")
    elif resolution["rung"] == RUNG_CONFIG_ERROR:
        print("next:  fix the errors above. Do not let a config error degrade into a skip.")
    elif resolution["rung"] == RUNG_SKIPPED:
        print("next:  nothing. Do not write a verification section into uow.md, and do not "
              "prompt for credentials.")
    elif not ok_runner:
        print(f"next:  {runner_message}")
    elif not spec:
        print(f"next:  write {SPEC_FILE} from references/templates.md, then re-run --doctor")
    else:
        print("next:  add the Verification evidence block from references/templates.md to "
              "uow.md, then run:")
        print(f"       verify.py {os.path.relpath(resolution['feature_dir'])} --write")
    return 1 if resolution["rung"] == RUNG_CONFIG_ERROR else 0


def summarise(run):
    counts = run.get("counts", {})
    print(f"\n{run.get('status', '?')} — {counts.get('pass', 0)}/{counts.get('total', 0)} steps "
          f"· {run.get('browser', '')} · commit {run.get('commit') or 'unknown'}")
    for env in run.get("environments", []):
        warm = env.get("warmup") or {}
        # Only worth a line when the warm-up *succeeded* slowly — when it failed, the ✗ below
        # is the whole story and "not counted in any verdict" would read as an excuse.
        if warm.get("ok") and (warm.get("attempts", 0) > 1 or warm.get("duration_ms", 0) >= 5000):
            print(f"  · {env['name']}: warm-up {_duration(warm.get('duration_ms'))} over "
                  f"{warm['attempts']} attempt(s) — not counted in any verdict")
        if env.get("login") == "failed":
            reachable = warm.get("ok", True)
            print(f"  ✗ {env['name']}: {'login failed' if reachable else 'unreachable'} — "
                  f"{env.get('message', '')}")
    for result in run.get("results", []):
        if result.get("verdict") != "pass":
            note = "; ".join(result.get("messages", [])) or "failed"
            print(f"  ✗ {result['env']}/{result['viewport']}/{result['step']}: {note}")


def run_failed(run):
    """Only a required environment can fail the run."""
    required = {e["name"] for e in run.get("environments", []) if e.get("required")}
    if any(e.get("login") == "failed" and e["name"] in required
           for e in run.get("environments", [])):
        return True
    return any(r.get("verdict") != "pass" and r["env"] in required
               for r in run.get("results", []))


def generate(resolution, run):
    feature_dir = resolution["feature_dir"]
    title = feature_title(feature_dir)

    doc_path = os.path.join(feature_dir, EVIDENCE_DOC)
    with open(doc_path, "w", encoding="utf-8") as fh:
        fh.write(render_evidence_doc(run, title, feature_dir))
    print(f"wrote {doc_path}")


def cmd_run(resolution, args):
    envs, viewports, errors = select(resolution, args.env, args.viewport)
    for error in errors:
        print(f"usage error: {error}", file=sys.stderr)
    if errors:
        return 2

    mode = "manual-login" if args.manual_login else "run"
    ok_runner, runner_message = runner_state()
    if not ok_runner:
        print(f"refused: browser runner {runner_message}", file=sys.stderr)
        return 1

    if mode == "run" and not resolution["spec"]:
        print(f"refused: {SPEC_FILE} is missing — write it from references/templates.md",
              file=sys.stderr)
        return 1

    for warning in resolution["warnings"]:
        print(f"warn:  {warning}")

    plan = build_plan(resolution, envs, viewports, mode)
    code = invoke_runner(plan)

    if mode == "manual-login":
        return code

    run = load_run(resolution["feature_dir"])
    if run is None:
        print("refused: the runner produced no run.json — nothing was verified", file=sys.stderr)
        return 1

    summarise(run)
    if args.write:
        generate(resolution, run)
    return 1 if run_failed(run) else 0


def main():
    parser = argparse.ArgumentParser(
        description="Browser verification for an AI-DLC feature plan.")
    parser.add_argument("feature_dir", nargs="?", help="path to .ai/features/<slug>")
    parser.add_argument("--doctor", action="store_true",
                        help="report which rung this project is on; changes nothing")
    parser.add_argument("--write", action="store_true",
                        help="after the run, generate 08-evidence.md")
    parser.add_argument("--env", action="append", help="restrict to one environment (repeatable)")
    parser.add_argument("--viewport", action="append", help="restrict to one viewport (repeatable)")
    parser.add_argument("--manual-login", action="store_true",
                        help="headed browser; you authenticate by hand and the session is saved")
    parser.add_argument("--json", action="store_true", help="machine-readable resolution")
    parser.add_argument("--version", action="version",
                        version=f"aidlc_verify {__version__} (ruleset {RULESET})")
    args = parser.parse_args()

    if not args.feature_dir:
        parser.error("feature_dir is required")
    if not os.path.isdir(args.feature_dir):
        print(f"usage error: {args.feature_dir} is not a directory", file=sys.stderr)
        return 2

    resolution = resolve(args.feature_dir)

    if args.json:
        payload = {
            "rung": resolution["rung"],
            "reason": resolution["reason"],
            "errors": resolution["errors"],
            "warnings": resolution["warnings"],
            "environments": [{k: e[k] for k in
                              ("name", "url", "enabled", "required", "writes", "recipe",
                               "missing", "ready")}
                             for e in resolution["environments"]],
            "viewports": resolution["viewports"],
            "steps": [s["id"] for s in (resolution["spec"] or {}).get("steps", [])],
        }
        json.dump(payload, sys.stdout, indent=2)
        print()
        return 1 if resolution["rung"] == RUNG_CONFIG_ERROR else 0

    if args.doctor:
        return print_doctor(resolution, args)

    if resolution["rung"] == RUNG_NOT_APPLICABLE:
        print(f"verify: not applicable — {resolution['reason']}")
        return 0
    if resolution["rung"] == RUNG_CONFIG_ERROR:
        for error in resolution["errors"]:
            print(f"ERROR: {error}", file=sys.stderr)
        print("refused: fix .ai/aidlc.yaml — a config error must not degrade into a skip",
              file=sys.stderr)
        return 1
    if resolution["rung"] == RUNG_SKIPPED and not args.manual_login:
        print(f"verify: skipped — {resolution['reason']}")
        return 0

    return cmd_run(resolution, args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        sys.exit(1)
    except BrokenPipeError:
        try:
            sys.stdout.close()
        finally:
            os._exit(0)
