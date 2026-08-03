#!/usr/bin/env python3
"""
aidlc.py — the AI-DLC workflow controller.

Holds the gate state on disk and refuses operations that violate it. This exists because
a gate described in prose is a gate an agent will skip: it will read "do not implement
before G3", agree, and then implement. A gate that is a file the agent cannot fabricate
without leaving evidence is a gate that holds.

Every command is safe to re-run. Nothing here writes source code.

    aidlc init <slug> [--profile NAME]     scaffold a feature and its state file
    aidlc status                           current gate, blockers, next action
    aidlc check <gate>                     run gate preconditions, report, change nothing
    aidlc pass <gate> --by <name>          advance, only if check passes
    aidlc ready                            tickets whose dependencies are satisfied
    aidlc start <ticket> --by <name>       mark in_progress; refuses if gate or deps unmet
    aidlc done <ticket> --by <name>        mark done; refuses if checklist unticked
    aidlc lint-touches --repo <path>       every touches path must exist or be marked new
    aidlc audit                            the full approval trail
    aidlc reopen <gate> --by <name> --reason <text>   walk a gate back, on the record

Exit codes: 0 ok · 1 refused / precondition failed · 2 usage error.
Stdlib only.
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys

GATES = ["G0", "G1", "G2", "G3", "G4", "G5"]
GATE_TITLES = {
    "G0": "Discovery and intent",
    "G1": "Elaboration — assumptions and requirements",
    "G2": "Logical design",
    "G3": "Decomposition — units of work and ticket graph",
    "G4": "Construction complete",
    "G5": "Close",
}
STATE_FILE = ".aidlc-state.yaml"

REQUIRED_INTENT_SECTIONS = ["Problem", "Success signal", "Out of scope"]
REQUIRED_DESIGN_SECTIONS = ["Approach", "Alternatives rejected", "Error taxonomy", "ADR"]

SCAFFOLD = {
    "00-intent.md": "# Intent — {slug}\n\n## Problem\n\nTODO\n\n## Success signal\n\nTODO\n\n"
                    "## Out of scope\n\n- TODO\n\n## Constraints\n\nTODO\n",
    "01-assumptions.md": "# Assumption register\n\n"
                         "| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |\n"
                         "|----|-----------|-----------|----------|----------------------|--------|-----------|\n",
    "02-requirements.md": "# Requirements — {slug}\n\n## US-01 — TODO\n\n**AC-01** — TODO\n"
                          "```gherkin\nGiven TODO\nWhen TODO\nThen TODO\n```\n",
    "03-logical-design.md": "# Logical design — {slug}\n\n## Approach\n\nTODO\n\n"
                            "## Alternatives rejected\n\n| Option | Why not |\n|---|---|\n\n"
                            "## Contracts\n\nTODO\n\n## Error taxonomy\n\nTODO\n\n"
                            "## ADRs\n\n### ADR-01 — TODO\n**Status:** proposed\n",
}


# --------------------------------------------------------------------------- #
# tiny yaml-ish io (same dialect as uow_graph.py: scalars, inline + block lists)
# --------------------------------------------------------------------------- #


def read_text(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def now():
    return datetime.datetime.now().replace(microsecond=0).isoformat()


def load_state(feature_dir):
    path = os.path.join(feature_dir, STATE_FILE)
    if not os.path.isfile(path):
        return None
    state = {"history": []}
    entry = None
    for raw in read_text(path).splitlines():
        line = raw.rstrip()
        if not line.strip() or line.strip().startswith("#"):
            continue
        if line.startswith("  - gate:"):
            entry = {"gate": line.split(":", 1)[1].strip()}
            state["history"].append(entry)
        elif line.startswith("    ") and entry is not None and ":" in line:
            key, _, value = line.strip().partition(":")
            entry[key.strip()] = value.strip()
        elif line == "history:":
            continue
        elif ":" in line and not line.startswith(" "):
            key, _, value = line.partition(":")
            state[key.strip()] = value.strip()
    return state


def save_state(feature_dir, state):
    lines = [
        "# Managed by scripts/aidlc.py — do not edit by hand.",
        "# Editing this file to skip a gate defeats the point of having one.",
        f"feature: {state.get('feature', '')}",
        f"slug: {state.get('slug', '')}",
        f"profile: {state.get('profile', 'none')}",
        f"created: {state.get('created', now())}",
        f"current_gate: {state.get('current_gate', 'none')}",
        "history:",
    ]
    for entry in state.get("history", []):
        lines.append(f"  - gate: {entry.get('gate', '')}")
        for key in ("action", "at", "by", "evidence", "reason", "ticket"):
            if entry.get(key):
                lines.append(f"    {key}: {entry[key]}")
    path = os.path.join(feature_dir, STATE_FILE)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def gate_index(gate):
    return GATES.index(gate) if gate in GATES else -1


def passed(state, gate):
    return gate_index(state.get("current_gate", "none")) >= gate_index(gate)


# --------------------------------------------------------------------------- #
# artifact inspection
# --------------------------------------------------------------------------- #


def sections(path):
    return re.findall(r"^#{2,3}\s+(.+?)\s*$", read_text(path), re.M)


def has_sections(path, required):
    found = " | ".join(sections(path))
    return [r for r in required if r.lower() not in found.lower()]


def todo_count(path):
    return len(re.findall(r"\bTODO\b", read_text(path)))


def architecture_map(feature_dir):
    """The map is repo-level: .ai/architecture.md, a couple of levels up."""
    path = os.path.abspath(feature_dir)
    for _ in range(6):
        candidate = os.path.join(path, ".ai", "architecture.md")
        if os.path.isfile(candidate):
            return candidate
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    return None


def verified_by(path):
    match = re.search(r"^verified_by:\s*(\S.*)$", read_text(path), re.M)
    return match.group(1).strip() if match else ""


def assumption_rows(feature_dir):
    """Parse the register. Returns list of dicts with blocking/status/resolution."""
    rows = []
    for line in read_text(os.path.join(feature_dir, "01-assumptions.md")).splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 7 or not re.match(r"(?i)a-\d+", cells[0]):
            continue
        rows.append({
            "id": cells[0], "text": cells[1],
            "blocking": cells[3].lower() in {"yes", "true"},
            "blast": cells[4], "status": cells[5].lower(),
            "resolution": cells[6].strip(" —-"),
        })
    return rows


def ac_ids(feature_dir):
    text = read_text(os.path.join(feature_dir, "02-requirements.md"))
    return sorted(set(re.findall(r"\bAC-\d+\b", text)))


def adr_count(feature_dir):
    text = read_text(os.path.join(feature_dir, "03-logical-design.md"))
    return len(re.findall(r"^###\s+ADR-\d+", text, re.M))


def unresolved_adr(feature_dir):
    text = read_text(os.path.join(feature_dir, "03-logical-design.md"))
    return len(re.findall(r"^\*\*Status:\*\*\s*proposed", text, re.M))


def run_uow_graph(feature_dir, extra=()):
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uow_graph.py")
    if not os.path.isfile(script):
        return 127, "", "uow_graph.py not found next to aidlc.py"
    proc = subprocess.run(
        [sys.executable, script, feature_dir, *extra],
        capture_output=True, text=True,
    )
    return proc.returncode, proc.stdout, proc.stderr


def parse_frontmatter_files(feature_dir):
    """Reuse uow_graph's loader by import so the two never disagree."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    sys.dont_write_bytecode = True   # keep __pycache__ out of the repo
    try:
        import uow_graph
    except ImportError:
        return {}, {}
    uows, tickets, _, _ = uow_graph.load_plan(feature_dir)
    return uows, tickets


def checklist_state(path):
    text = read_text(path)
    return len(re.findall(r"^\s*-\s*\[x\]", text, re.M | re.I)), \
        len(re.findall(r"^\s*-\s*\[ \]", text, re.M))


# --------------------------------------------------------------------------- #
# gate checks — each returns (ok, [findings]) where a finding is (level, message)
# --------------------------------------------------------------------------- #


def check_g0(feature_dir):
    out = []
    amap = architecture_map(feature_dir)
    if not amap:
        out.append(("fail", "no .ai/architecture.md found — run the profile's discovery script"))
    else:
        who = verified_by(amap)
        if not who or who.startswith("#"):
            out.append(("fail", f"{os.path.relpath(amap)} has no verified_by — "
                                "a human must read the draft map and sign it"))
        else:
            out.append(("ok", f"architecture map verified by {who}"))

    intent = os.path.join(feature_dir, "00-intent.md")
    if not os.path.isfile(intent):
        out.append(("fail", "00-intent.md missing"))
    else:
        missing = has_sections(intent, REQUIRED_INTENT_SECTIONS)
        if missing:
            out.append(("fail", f"00-intent.md missing sections: {', '.join(missing)}"))
        todos = todo_count(intent)
        if todos:
            out.append(("fail", f"00-intent.md still has {todos} TODO placeholder(s)"))
        if not missing and not todos:
            out.append(("ok", "00-intent.md complete"))
    return not any(l == "fail" for l, _ in out), out


def check_g1(feature_dir):
    out = []
    rows = assumption_rows(feature_dir)
    if not rows:
        out.append(("fail", "01-assumptions.md has no assumption rows — if you truly assumed "
                            "nothing, say so explicitly with a row marked confirmed"))
    blocking_pending = [r for r in rows if r["blocking"] and r["status"] == "pending"]
    if blocking_pending:
        out.append(("fail", f"{len(blocking_pending)} blocking assumption(s) pending: "
                            + ", ".join(r["id"] for r in blocking_pending)))
    unjustified = [r for r in rows if r["status"] in {"confirmed", "rejected"} and not r["resolution"]]
    if unjustified:
        out.append(("fail", f"resolved with no resolution note: {', '.join(r['id'] for r in unjustified)} "
                            "— who confirmed it, and when?"))
    if rows and not blocking_pending and not unjustified:
        out.append(("ok", f"{len(rows)} assumptions, none blocking-and-pending"))

    acs = ac_ids(feature_dir)
    if not acs:
        out.append(("fail", "02-requirements.md has no AC-nn ids"))
    else:
        out.append(("ok", f"{len(acs)} acceptance criteria defined"))
    todos = todo_count(os.path.join(feature_dir, "02-requirements.md"))
    if todos:
        out.append(("fail", f"02-requirements.md still has {todos} TODO placeholder(s)"))
    return not any(l == "fail" for l, _ in out), out


def check_g2(feature_dir):
    out = []
    design = os.path.join(feature_dir, "03-logical-design.md")
    if not os.path.isfile(design):
        return False, [("fail", "03-logical-design.md missing")]
    missing = has_sections(design, REQUIRED_DESIGN_SECTIONS)
    if missing:
        out.append(("fail", f"missing sections: {', '.join(missing)}"))
    n = adr_count(feature_dir)
    if n == 0:
        out.append(("fail", "no ADR recorded — a design with no hard-to-reverse decision "
                            "is either trivial or under-examined"))
    else:
        out.append(("ok", f"{n} ADR(s) recorded"))
    pending = unresolved_adr(feature_dir)
    if pending:
        out.append(("fail", f"{pending} ADR(s) still marked proposed"))
    todos = todo_count(design)
    if todos:
        out.append(("fail", f"{todos} TODO placeholder(s) remain"))
    return not any(l == "fail" for l, _ in out), out


def check_g3(feature_dir):
    out = []
    code, stdout, stderr = run_uow_graph(feature_dir)
    if code == 127:
        return False, [("fail", stderr)]
    if code != 0:
        for line in (stderr or "").splitlines():
            if line.startswith("ERROR:"):
                out.append(("fail", line[6:].strip()))
        if not out:
            out.append(("fail", "uow_graph.py rejected the plan"))
        return False, out

    uows, tickets = parse_frontmatter_files(feature_dir)
    if not uows:
        return False, [("fail", "no units of work found")]
    out.append(("ok", f"graph valid: {len(uows)} UoW, {len(tickets)} tickets, no cycles"))

    for uid, uow in sorted(uows.items()):
        if "Demo script" not in " | ".join(sections(uow["_path"])):
            out.append(("fail", f"{uid} has no Demo script section — an undemoable slice "
                                "cannot be accepted at G4"))
    for tid, ticket in sorted(tickets.items()):
        ticked, unticked = checklist_state(ticket["_path"])
        if ticked + unticked == 0:
            out.append(("fail", f"{tid} has no done-when checklist"))
    generated = ["05-ticket-graph.md", "06-traceability.md", "registry.yaml"]
    missing = [g for g in generated if not os.path.isfile(os.path.join(feature_dir, g))]
    if missing:
        out.append(("fail", f"not generated yet: {', '.join(missing)} — run uow_graph.py --write"))
    return not any(l == "fail" for l, _ in out), out


def check_g4(feature_dir):
    out = []
    uows, tickets = parse_frontmatter_files(feature_dir)
    if not tickets:
        return False, [("fail", "no tickets found")]
    for tid, ticket in sorted(tickets.items()):
        if ticket.get("status") != "done":
            out.append(("fail", f"{tid} is {ticket.get('status', 'todo')}, not done"))
    for uid, uow in sorted(uows.items()):
        ticked, unticked = checklist_state(uow["_path"])
        if unticked:
            out.append(("fail", f"{uid} definition-of-done has {unticked} unticked item(s)"))
    if not any(l == "fail" for l, _ in out):
        out.append(("ok", f"all {len(tickets)} tickets done, all UoW checklists ticked"))
    return not any(l == "fail" for l, _ in out), out


def check_g5(feature_dir):
    out = []
    rows = assumption_rows(feature_dir)
    pending = [r for r in rows if r["status"] == "pending"]
    if pending:
        out.append(("fail", f"{len(pending)} assumption(s) still pending at close: "
                            + ", ".join(r["id"] for r in pending)
                            + " — record what turned out to be true"))
    if unresolved_adr(feature_dir):
        out.append(("fail", "ADRs still marked proposed"))
    code, _, _ = run_uow_graph(feature_dir)
    if code != 0:
        out.append(("fail", "uow_graph.py no longer validates — regenerate before closing"))
    if not any(l == "fail" for l, _ in out):
        out.append(("ok", "assumptions resolved, ADRs settled, graph valid"))
    return not any(l == "fail" for l, _ in out), out


CHECKS = {"G0": check_g0, "G1": check_g1, "G2": check_g2,
          "G3": check_g3, "G4": check_g4, "G5": check_g5}


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #


def resolve_dir(args):
    return os.path.abspath(args.dir or ".")


def require_state(feature_dir):
    state = load_state(feature_dir)
    if state is None:
        print(f"refused: no {STATE_FILE} in {feature_dir} — run `aidlc init <slug>` first",
              file=sys.stderr)
        sys.exit(1)
    return state


def cmd_init(args):
    feature_dir = os.path.abspath(args.dir or os.path.join(".ai", "features", args.slug))
    if load_state(feature_dir):
        print(f"already initialised: {feature_dir}")
        return 0
    os.makedirs(os.path.join(feature_dir, "04-units-of-work"), exist_ok=True)
    for name, body in SCAFFOLD.items():
        path = os.path.join(feature_dir, name)
        if not os.path.isfile(path):
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(body.format(slug=args.slug))
    save_state(feature_dir, {
        "feature": args.slug, "slug": args.slug, "profile": args.profile or "none",
        "created": now(), "current_gate": "none", "history": [],
    })
    print(f"initialised {feature_dir}")
    print(f"profile: {args.profile or 'none — set one with --profile'}")
    print("\nnext: complete 00-intent.md, verify the architecture map, then `aidlc check G0`")
    return 0


def cmd_status(args):
    feature_dir = resolve_dir(args)
    state = require_state(feature_dir)
    current = state.get("current_gate", "none")
    idx = gate_index(current)
    nxt = GATES[idx + 1] if idx + 1 < len(GATES) else None

    print(f"feature:  {state.get('slug')}")
    print(f"profile:  {state.get('profile')}")
    print(f"gate:     {current}" + (f" — {GATE_TITLES[current]}" if current in GATE_TITLES else ""))
    if nxt:
        print(f"next:     {nxt} — {GATE_TITLES[nxt]}")
    else:
        print("next:     none, feature closed")

    if passed(state, "G3"):
        uows, tickets = parse_frontmatter_files(feature_dir)
        done = sum(1 for t in tickets.values() if t.get("status") == "done")
        prog = sum(1 for t in tickets.values() if t.get("status") == "in_progress")
        print(f"tickets:  {done}/{len(tickets)} done, {prog} in progress")
    else:
        print("tickets:  construction locked until G3")

    if nxt:
        ok, findings = CHECKS[nxt](feature_dir)
        print(f"\n{nxt} precondition check: {'PASS' if ok else 'FAIL'}")
        for level, msg in findings:
            print(f"  {'·' if level == 'ok' else '✗'} {msg}")
        if ok:
            print(f"\nrun: aidlc pass {nxt} --by <your-name>")
    return 0


def cmd_check(args):
    feature_dir = resolve_dir(args)
    require_state(feature_dir)
    gate = args.gate.upper()
    if gate not in CHECKS:
        print(f"usage error: unknown gate {gate}", file=sys.stderr)
        return 2
    ok, findings = CHECKS[gate](feature_dir)
    print(f"{gate} — {GATE_TITLES[gate]}: {'PASS' if ok else 'FAIL'}")
    for level, msg in findings:
        print(f"  {'·' if level == 'ok' else '✗'} {msg}")
    return 0 if ok else 1


def cmd_pass(args):
    feature_dir = resolve_dir(args)
    state = require_state(feature_dir)
    gate = args.gate.upper()
    if gate not in GATES:
        print(f"usage error: unknown gate {gate}", file=sys.stderr)
        return 2
    if passed(state, gate):
        print(f"{gate} already passed")
        return 0
    idx = gate_index(gate)
    if idx > 0:
        prior = GATES[idx - 1]
        if not passed(state, prior):
            print(f"refused: {prior} has not passed — gates advance in order", file=sys.stderr)
            return 1
    ok, findings = CHECKS[gate](feature_dir)
    if not ok:
        print(f"refused: {gate} preconditions not met", file=sys.stderr)
        for level, msg in findings:
            if level == "fail":
                print(f"  ✗ {msg}", file=sys.stderr)
        return 1
    evidence = "; ".join(msg for level, msg in findings if level == "ok")[:220]
    state["current_gate"] = gate
    state.setdefault("history", []).append({
        "gate": gate, "action": "passed", "at": now(), "by": args.by,
        "evidence": evidence.replace(":", " -"),
    })
    save_state(feature_dir, state)
    print(f"{gate} passed, approved by {args.by}")
    nxt = GATES[idx + 1] if idx + 1 < len(GATES) else None
    if gate == "G3":
        print("construction unlocked — `aidlc ready` to see what can be picked up")
    elif nxt:
        print(f"next: {nxt} — {GATE_TITLES[nxt]}")
    return 0


def cmd_reopen(args):
    feature_dir = resolve_dir(args)
    state = require_state(feature_dir)
    gate = args.gate.upper()
    if not passed(state, gate):
        print(f"refused: {gate} has not passed, nothing to reopen", file=sys.stderr)
        return 1
    state["current_gate"] = GATES[gate_index(gate) - 1] if gate_index(gate) > 0 else "none"
    state.setdefault("history", []).append({
        "gate": gate, "action": "reopened", "at": now(), "by": args.by,
        "reason": args.reason.replace(":", " -"),
    })
    save_state(feature_dir, state)
    print(f"{gate} reopened by {args.by}; gate is now {state['current_gate']}")
    print("the reopening is on the record — that is the point")
    return 0


def cmd_ready(args):
    feature_dir = resolve_dir(args)
    state = require_state(feature_dir)
    if not passed(state, "G3"):
        print(f"refused: gate is {state.get('current_gate')}, construction requires G3",
              file=sys.stderr)
        ok, findings = CHECKS[GATES[gate_index(state.get('current_gate', 'none')) + 1]](feature_dir)
        for level, msg in findings:
            if level == "fail":
                print(f"  ✗ {msg}", file=sys.stderr)
        return 1
    _, tickets = parse_frontmatter_files(feature_dir)
    ready, blocked = [], []
    for tid, ticket in sorted(tickets.items()):
        if ticket.get("status") != "todo":
            continue
        deps = ticket.get("depends_on") or []
        deps = deps if isinstance(deps, list) else [deps]
        unmet = [d for d in deps if tickets.get(d, {}).get("status") != "done"]
        (blocked if unmet else ready).append((tid, ticket, unmet))
    if ready:
        print("ready:")
        for tid, t, _ in ready:
            print(f"  {tid}  [{t.get('layer')}] {t.get('title', '')}  ({t.get('estimate')})")
    else:
        print("nothing ready.")
    if blocked and args.verbose:
        print("\nblocked:")
        for tid, t, unmet in blocked:
            print(f"  {tid}  waiting on {', '.join(unmet)}")
    return 0


ALLOWED_FROM = {
    "in_progress": {"todo", "blocked", "in_progress"},
    "review": {"todo", "in_progress", "review"},
    "done": {"review", "done"},          # accept only from review
    "todo": {"review", "in_progress"},   # reject sends it back
}


def _transition(args, target):
    feature_dir = resolve_dir(args)
    state = require_state(feature_dir)
    if not passed(state, "G3"):
        print(f"refused: gate is {state.get('current_gate')}, construction requires G3",
              file=sys.stderr)
        return 1
    _, tickets = parse_frontmatter_files(feature_dir)
    tid = args.ticket
    if tid not in tickets:
        print(f"refused: no ticket {tid}", file=sys.stderr)
        return 1
    ticket = tickets[tid]

    if target == "in_progress":
        deps = ticket.get("depends_on") or []
        deps = deps if isinstance(deps, list) else [deps]
        unmet = [d for d in deps if tickets.get(d, {}).get("status") != "done"]
        if unmet:
            print(f"refused: {tid} depends on {', '.join(unmet)}, not done", file=sys.stderr)
            return 1
    current = ticket.get("status", "todo")
    bypass = getattr(args, "no_review", False)
    allowed = ALLOWED_FROM.get(target, set())
    if target == "done" and bypass:
        allowed = allowed | {"in_progress"}
    if current not in allowed:
        print(f"refused: {tid} is '{current}'; {target} requires one of "
              f"{sorted(allowed)}", file=sys.stderr)
        if target == "done" and current == "in_progress":
            print("       an implementer does not accept its own work — run `submit`, then "
                  "have a human `accept`. Use --no-review only if you are working solo.",
                  file=sys.stderr)
        return 1

    if target in {"review", "done"}:
        ticked, unticked = checklist_state(ticket["_path"])
        if unticked:
            print(f"refused: {tid} has {unticked} unticked done-when item(s) — "
                  "tick them in the ticket file, or say why they no longer apply",
                  file=sys.stderr)
            return 1

    text = read_text(ticket["_path"])
    new_text, n = re.subn(r"^status:\s*\S+\s*$", f"status: {target}", text, count=1, flags=re.M)
    if not n:
        print(f"refused: could not find a status line in {ticket['_path']}", file=sys.stderr)
        return 1
    with open(ticket["_path"], "w", encoding="utf-8") as fh:
        fh.write(new_text)

    entry = {"gate": "G4", "action": f"ticket {target}", "at": now(),
             "by": args.by, "ticket": tid}
    if getattr(args, "reason", None):
        entry["reason"] = args.reason.replace(":", " -")
    if target == "done" and bypass:
        entry["action"] = "ticket done (review bypassed)"
    state.setdefault("history", []).append(entry)
    save_state(feature_dir, state)
    print(f"{tid}: {current} → {target}")
    if target == "review":
        print("dependents stay blocked until a human accepts — review lag is visible "
              "as stalled parallelism, which is the intended pressure")
    if target == "done":
        run_uow_graph(feature_dir, ["--write"])
        print("regenerated graph, traceability and registry")
    return 0


def cmd_start(args):
    return _transition(args, "in_progress")


def cmd_submit(args):
    return _transition(args, "review")


def cmd_accept(args):
    return _transition(args, "done")


def cmd_reject(args):
    return _transition(args, "todo")


def cmd_done(args):
    return _transition(args, "done")


def cmd_lint_touches(args):
    feature_dir = resolve_dir(args)
    require_state(feature_dir)
    repo = os.path.abspath(args.repo)
    _, tickets = parse_frontmatter_files(feature_dir)
    problems = 0
    for tid, ticket in sorted(tickets.items()):
        paths = ticket.get("touches") or []
        paths = paths if isinstance(paths, list) else [paths]
        if not paths:
            print(f"✗ {tid}: no touches paths")
            problems += 1
            continue
        for entry in paths:
            path, _, note = entry.partition("#")
            path = path.strip()
            exists = os.path.exists(os.path.join(repo, path))
            declared_new = "new" in note.lower()
            if not exists and not declared_new:
                print(f"✗ {tid}: {path} does not exist and is not marked new")
                problems += 1
    if problems:
        print(f"\n{problems} problem(s) — a path that exists nowhere and is not marked new "
              "is fiction, and fiction in touches survives review")
        return 1
    print(f"all touches paths in {len(tickets)} tickets resolve or are declared new")
    return 0


def git_info(repo):
    def run(*cmd):
        try:
            out = subprocess.run(["git", "-C", repo, *cmd],
                                 capture_output=True, text=True, timeout=5)
            return out.stdout.strip() if out.returncode == 0 else ""
        except (OSError, subprocess.SubprocessError):
            return ""
    sha = run("rev-parse", "--short", "HEAD")
    return {
        "sha": sha,
        "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
        "tracked": bool(sha) and bool(run("ls-files", ".ai")),
        "dirty": bool(run("status", "--porcelain", ".ai")),
    }


def _critical_hours(feature_dir):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    sys.dont_write_bytecode = True
    try:
        import uow_graph
        _, tickets, _, _ = uow_graph.load_plan(feature_dir)
        _, hours = uow_graph.critical_path(tickets)
        return hours
    except Exception:
        return 0.0


def cmd_snapshot(args):
    """Emit one self-contained JSON snapshot of this feature.

    Transport-agnostic on purpose: write it to a synced folder, rsync it, POST it. The
    collector ingests a directory of these, so the choice of pipe is yours and can change
    without touching the tool.

    The `history` block matters most when .ai/ is not committed to git. In that case this
    snapshot is the only path by which the approval trail leaves the machine, so the
    collector must append history rather than replace it.
    """
    feature_dir = resolve_dir(args)
    state = require_state(feature_dir)
    repo_root = os.path.abspath(args.repo or os.path.join(feature_dir, "..", "..", ".."))

    sys.dont_write_bytecode = True
    uows, tickets = parse_frontmatter_files(feature_dir)
    reg_path = os.path.join(feature_dir, "registry.yaml")

    def as_list_local(v):
        if v is None:
            return []
        return v if isinstance(v, list) else ([v] if v else [])

    status_of = {t: m.get("status", "todo") for t, m in tickets.items()}
    slug = state.get("slug") or os.path.basename(feature_dir)

    payload = {
        "schema": 1,
        "source": {
            "host": os.uname().nodename if hasattr(os, "uname") else "unknown",
            "repo_path": repo_root,
            "repo_label": args.label or os.path.basename(repo_root),
        },
        "git": git_info(repo_root),
        "feature": {
            "slug": slug,
            "profile": state.get("profile", "none"),
            "gate": state.get("current_gate", "none"),
            "created": state.get("created", ""),
            "registry_present": os.path.isfile(reg_path),
        },
        "uow": [{
            "id": u.get("id"), "title": u.get("title", ""),
            "status": u.get("status", "todo"), "risk": u.get("risk", ""),
            "duration": u.get("duration", ""),
            "depends_on": as_list_local(u.get("depends_on")),
            "verifies": as_list_local(u.get("verifies")),
        } for u in sorted(uows.values(), key=lambda x: x.get("id", ""))],
        "ticket": [{
            "id": t.get("id"), "uow": t.get("uow", ""), "title": t.get("title", ""),
            "layer": t.get("layer", ""), "type": t.get("type", ""),
            "estimate": t.get("estimate", ""), "status": t.get("status", "todo"),
            "depends_on": as_list_local(t.get("depends_on")),
            "unmet_deps": sum(1 for d in as_list_local(t.get("depends_on"))
                              if status_of.get(d) != "done"),
            "verifies": as_list_local(t.get("verifies")),
            "touches": as_list_local(t.get("touches")),
        } for t in sorted(tickets.values(), key=lambda x: x.get("id", ""))],
        "totals": {"critical_path_hours": _critical_hours(feature_dir)},
        "assumption": assumption_rows(feature_dir),
        "history": state.get("history", []),
    }

    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    payload["content_hash"] = hashlib.sha256(canonical.encode()).hexdigest()[:16]
    payload["captured_at"] = now()

    name = f"{payload['source']['repo_label']}__{slug}.json"
    if args.to:
        os.makedirs(args.to, exist_ok=True)
        out_path = os.path.join(args.to, name)
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
        warn = ""
        if not payload["git"]["tracked"]:
            warn = ("\n  note: .ai/ is not tracked by git, so this snapshot is the only copy "
                    "of the approval trail leaving this machine — back the collector up")
        elif payload["git"]["dirty"]:
            warn = "\n  note: .ai/ has uncommitted changes; the snapshot reflects the working tree"
        print(f"wrote {out_path}  ({payload['content_hash']}){warn}")
    else:
        json.dump(payload, sys.stdout, indent=2)
        print()
    return 0


def cmd_audit(args):
    feature_dir = resolve_dir(args)
    state = require_state(feature_dir)
    print(f"# Audit trail — {state.get('slug')}")
    print(f"created {state.get('created')}, profile {state.get('profile')}, "
          f"gate {state.get('current_gate')}\n")
    history = state.get("history", [])
    if not history:
        print("(nothing recorded yet)")
        return 0
    for entry in history:
        line = f"{entry.get('at', '?')}  {entry.get('gate', '?'):3}  " \
               f"{entry.get('action', '?'):16}  by {entry.get('by', '?')}"
        if entry.get("ticket"):
            line += f"  [{entry['ticket']}]"
        print(line)
        if entry.get("reason"):
            print(f"{'':38}reason: {entry['reason']}")
    return 0


# --------------------------------------------------------------------------- #


def main():
    ap = argparse.ArgumentParser(description="AI-DLC workflow controller.")
    ap.add_argument("-d", "--dir", help="feature directory (default: cwd)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init"); p.add_argument("slug"); p.add_argument("--profile"); p.set_defaults(fn=cmd_init)
    p = sub.add_parser("status"); p.set_defaults(fn=cmd_status)
    p = sub.add_parser("check"); p.add_argument("gate"); p.set_defaults(fn=cmd_check)
    p = sub.add_parser("pass"); p.add_argument("gate"); p.add_argument("--by", required=True); p.set_defaults(fn=cmd_pass)
    p = sub.add_parser("reopen"); p.add_argument("gate"); p.add_argument("--by", required=True)
    p.add_argument("--reason", required=True); p.set_defaults(fn=cmd_reopen)
    p = sub.add_parser("ready"); p.add_argument("-v", "--verbose", action="store_true"); p.set_defaults(fn=cmd_ready)
    p = sub.add_parser("start"); p.add_argument("ticket"); p.add_argument("--by", required=True); p.set_defaults(fn=cmd_start)
    p = sub.add_parser("submit", help="implementer hands off for review")
    p.add_argument("ticket"); p.add_argument("--by", required=True); p.set_defaults(fn=cmd_submit)
    p = sub.add_parser("accept", help="reviewer accepts; only from review")
    p.add_argument("ticket"); p.add_argument("--by", required=True); p.set_defaults(fn=cmd_accept)
    p = sub.add_parser("reject", help="reviewer sends it back")
    p.add_argument("ticket"); p.add_argument("--by", required=True)
    p.add_argument("--reason", required=True); p.set_defaults(fn=cmd_reject)
    p = sub.add_parser("done", help="solo shortcut; use submit/accept when a reviewer exists")
    p.add_argument("ticket"); p.add_argument("--by", required=True)
    p.add_argument("--no-review", action="store_true",
                   help="required to skip review; the bypass is recorded in the audit trail")
    p.set_defaults(fn=cmd_done)
    p = sub.add_parser("lint-touches"); p.add_argument("--repo", required=True); p.set_defaults(fn=cmd_lint_touches)
    p = sub.add_parser("snapshot", help="emit a portable JSON snapshot for the collector")
    p.add_argument("--to", help="directory to write into; omit to print to stdout")
    p.add_argument("--repo", help="repo root (default: three levels above the feature dir)")
    p.add_argument("--label", help="repo label used in the report")
    p.set_defaults(fn=cmd_snapshot)
    p = sub.add_parser("audit"); p.set_defaults(fn=cmd_audit)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # piping into head/less closes stdout early; not an error worth a traceback
        try:
            sys.stdout.close()
        finally:
            os._exit(0)
