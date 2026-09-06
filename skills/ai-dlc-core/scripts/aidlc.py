#!/usr/bin/env python3
"""
aidlc.py — the AI-DLC workflow controller.

Holds the gate state on disk and refuses operations that violate it. This exists because
a gate described in prose is a gate an agent will skip: it will read "do not implement
before G3", agree, and then implement. A gate that is a file the agent cannot fabricate
without leaving evidence is a gate that holds.

Every command is safe to re-run. Nothing here writes source code.

The trail lives in `history.jsonl`, append-only and declared `merge=union`, so two
checkouts that both approve something merge without a conflict and without losing
either entry. `.aidlc-state.yaml` is a *view* folded from that trail — if a merge
damages it, `aidlc reconcile` rebuilds it. Mutating commands take an exclusive lock on
the feature directory for the whole read-check-write.

    aidlc init <name> [--profile NAME]     scaffold .ai/features/YYYYMMDDNN-<name>
    aidlc status                           current gate, blockers, next action
    aidlc check <gate>                     run gate preconditions, report, change nothing
    aidlc pass <gate> --by <name>          advance, only if check passes
    aidlc ready                            tickets whose dependencies are satisfied
    aidlc start <ticket> --by <name>       mark in_progress; refuses if gate or deps unmet
    aidlc done <ticket> --by <name>        mark done; refuses if checklist unticked
    aidlc lint-touches --repo <path>       every touches path must exist or be marked new
    aidlc audit                            the full approval trail
    aidlc reconcile                        rebuild the state file from history.jsonl
    aidlc reopen <gate> --by <name> --reason <text>   walk a gate back, on the record

Exit codes: 0 ok · 1 refused / precondition failed · 2 usage error.
Stdlib only.
"""

import argparse
import contextlib
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time

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
HISTORY_FILE = "history.jsonl"          # the record; STATE_FILE is a view of it
LOCK_FILE = ".aidlc-state.lock"
GITATTRIBUTES = ".gitattributes"
GITIGNORE = ".gitignore"
LOCK_TIMEOUT = 30.0
DATE_FORMAT = "%Y%m%d"
SEQUENCE_CEILING = 99                   # two digits; the 100th feature in one day is a smell
# Feature directories are YYYYMMDDNN-<name>. The optional pair is read but never
# written: directories created before the sequence existed still parse as dated.
DATED_DIR_RE = re.compile(r"^(\d{8}(?:\d{2})?)-(.+)$")

REQUIRED_INTENT_SECTIONS = ["Problem", "Success signal", "Out of scope"]
REQUIRED_DESIGN_SECTIONS = ["Approach", "Alternatives rejected", "Error taxonomy", "ADR"]

SCAFFOLD = {
    "00-intent.md": "# Intent — {feature}\n\n## Problem\n\nTODO\n\n## Success signal\n\nTODO\n\n"
                    "## Out of scope\n\n- TODO\n\n## Constraints\n\nTODO\n",
    "01-assumptions.md": "# Assumption register\n\n"
                         "| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |\n"
                         "|----|-----------|-----------|----------|----------------------|--------|-----------|\n",
    "02-requirements.md": "# Requirements — {feature}\n\n## US-01 — TODO\n\n**AC-01** — TODO\n"
                          "```gherkin\nGiven TODO\nWhen TODO\nThen TODO\n```\n",
    "03-logical-design.md": "# Logical design — {feature}\n\n## Approach\n\nTODO\n\n"
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


# --------------------------------------------------------------------------- #
# feature directory naming: YYYYMMDDNN-<name>
# --------------------------------------------------------------------------- #


def today_date():
    return datetime.date.today().strftime(DATE_FORMAT)


def split_dated(name):
    """`2026082501-refund` -> `("2026082501", "refund")`; `refund` -> `(None, "refund")`."""
    m = DATED_DIR_RE.match(name)
    return (m.group(1), m.group(2)) if m else (None, name)


def next_sequence(root, date):
    """
    The next two-digit slot for `date`, counting every feature opened that day.

    It is a per-day counter rather than a global one, so the number stays short and
    the directory still reads as a date. Taking max+1 rather than count+1 means a
    deleted or renamed feature never hands its slot to a second plan — the numbers
    are identity, and a reused one would point two histories at one name.
    """
    used = []
    try:
        entries = os.listdir(root)
    except OSError:
        entries = []
    for entry in entries:
        stamp = split_dated(entry)[0]
        if stamp and len(stamp) == 10 and stamp[:8] == date \
                and os.path.isdir(os.path.join(root, entry)):
            used.append(int(stamp[8:]))
    seq = max(used, default=0) + 1
    if seq > SEQUENCE_CEILING:
        print(f"refused: {date} already holds {SEQUENCE_CEILING} features — "
              "a day that opens a hundred plans is not a numbering problem",
              file=sys.stderr)
        sys.exit(1)
    return seq


def feature_dir_name(root, name, stamp=None):
    """
    A feature directory is named `YYYYMMDDNN-<name>`.

    The date is when planning started and the pair after it is that day's sequence.
    Both are identity rather than decoration: features get replanned, names get
    reused, and two plans that share a name must not share a directory — the second
    would inherit the first's trail and its gate. A name already carrying a full
    ten-digit stamp keeps it, so `init` stays re-runnable; a bare date gets the
    day's next slot.
    """
    existing, bare = split_dated(name)
    stamp = stamp or existing or today_date()
    if len(stamp) == 8:
        stamp = f"{stamp}{next_sequence(root, stamp):02d}"
    return f"{stamp}-{bare}"


def clean_feature_name(raw):
    """Refuse a name that would not survive being a directory, rather than mangling it."""
    name = (raw or "").strip()
    if not name or name.startswith(".") or "/" in name or os.sep in name:
        print(f'refused: "{raw}" is not a usable feature name — it becomes a directory',
              file=sys.stderr)
        sys.exit(2)
    return name


def clean_stamp(raw):
    """`YYYYMMDD` takes the day's next slot; `YYYYMMDDNN` pins one, for backfilling."""
    if raw is None:
        return None
    text = raw.strip()
    date, seq = text[:8], text[8:]
    try:
        datetime.datetime.strptime(date, DATE_FORMAT)
        if seq and not (len(seq) == 2 and seq.isdigit() and int(seq) > 0):
            raise ValueError(seq)
    except ValueError:
        print(f'refused: --date "{raw}" is not a YYYYMMDD date or a YYYYMMDDNN stamp',
              file=sys.stderr)
        sys.exit(2)
    return text


def existing_feature_dirs(root, name):
    """
    Directories already holding this feature, whatever date they carry.

    Undated ones match too: a plan created before this convention keeps its folder
    instead of being forked into a dated twin on the next `init`. Oldest first, with
    undated ahead of everything dated, so the caller taking the last one gets the
    most recently opened plan rather than whichever name happens to sort highest.
    """
    bare = split_dated(clean_feature_name(name))[1]
    try:
        entries = os.listdir(root)
    except OSError:
        return []
    found = [e for e in entries
             if split_dated(e)[1] == bare and os.path.isdir(os.path.join(root, e))]
    found.sort(key=lambda e: (split_dated(e)[0] or "", e))
    return [os.path.join(root, e) for e in found]


def load_state(feature_dir):
    path = os.path.join(feature_dir, STATE_FILE)
    trail = read_history(feature_dir)
    if not os.path.isfile(path) and not trail:
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
    if not os.path.isfile(path):
        # the trail survived without its view — recover the identity fields
        state.setdefault("feature", "")
        state.setdefault("slug", os.path.basename(os.path.abspath(feature_dir)))
        state.setdefault("profile", "none")
        state.setdefault("created", "")
    if trail:
        # A union merge can leave STATE_FILE conflicted or stale while the trail is
        # complete, so the trail wins whenever it exists. `aidlc reconcile` rewrites
        # the view from it.
        state["history"] = trail
        state["current_gate"] = fold_gate(trail)
    return state


def save_state(feature_dir, state):
    lines = [
        "# Managed by scripts/aidlc.py — do not edit by hand.",
        "# Editing this file to skip a gate defeats the point of having one.",
        f"feature: {state.get('feature', '')}",
        f"slug: {state.get('slug', '')}",
        f"profile: {state.get('profile', 'none')}",
        f"created: {state.get('created', now())}",
    ]
    # Written only when the plan actually carries one. Defaulting here would stamp every
    # existing plan the first time any command touched it, quietly re-judging work that
    # was authored and closed under the old rules — the exact thing the stamp prevents.
    if state.get("ruleset"):
        lines.append(f"ruleset: {state['ruleset']}")
    lines += [
        f"current_gate: {state.get('current_gate', 'none')}",
        "history:",
    ]
    for entry in state.get("history", []):
        lines.append(f"  - gate: {entry.get('gate', '')}")
        for key in ("action", "at", "by", "evidence", "reason", "ticket"):
            if entry.get(key):
                lines.append(f"    {key}: {entry[key]}")
    write_atomic(os.path.join(feature_dir, STATE_FILE), "\n".join(lines) + "\n")


# --------------------------------------------------------------------------- #
# concurrency: one writer per feature, and writes that survive a crash
# --------------------------------------------------------------------------- #

try:
    import fcntl
except ImportError:                      # non-POSIX: degrade to atomic writes only
    fcntl = None


@contextlib.contextmanager
def feature_lock(feature_dir, timeout=LOCK_TIMEOUT):
    """
    Serialise read-modify-write on one feature.

    Every mutating command reads the state, evaluates preconditions against a dozen
    files, then rewrites the state. Without a lock two concurrent `pass`/`accept` calls
    interleave and one loses its history entry — and the history is the product. The
    lock is held across the *whole* read-check-write, not just the write, because the
    check is what the approval claims to be based on: preconditions that passed and
    then stopped being true before the entry was written make the trail lie.
    """
    if fcntl is None:
        yield
        return
    os.makedirs(feature_dir, exist_ok=True)
    with open(os.path.join(feature_dir, LOCK_FILE), "a+", encoding="utf-8") as fh:
        deadline = time.monotonic() + timeout
        while True:
            try:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    print(f"refused: another aidlc process holds {feature_dir} "
                          f"(waited {timeout:.0f}s)", file=sys.stderr)
                    sys.exit(1)
                time.sleep(0.05)
        try:
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def write_atomic(path, text):
    """
    Write to a sibling temp file, fsync, then rename over the target.

    `open(path, "w")` truncates before it writes: a crash in that window leaves the only
    durable copy of an approval trail empty. os.replace() is atomic on POSIX, so a
    concurrent reader — the console polls these files — sees the old file or the new
    one, never a half-written one.
    """
    directory = os.path.dirname(os.path.abspath(path)) or "."
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".aidlc-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


# --------------------------------------------------------------------------- #
# the append-only trail
# --------------------------------------------------------------------------- #

# Identity of one event. `ts` is in here because `at` only resolves to the second: two
# runs of a fast command inside the same second would otherwise hash identically and
# `read_history`'s dedupe would silently drop one. That also settles the older latent
# case of two people approving the same gate in the same second — `fold_gate` wants both.
HISTORY_KEYS = ("gate", "action", "at", "ts", "by", "evidence", "reason", "ticket",
                "command", "exit", "digest", "duration_ms", "from")


def entry_id(entry):
    """A stable id for one event, so two checkouts recognise it as the same event."""
    canonical = json.dumps({k: entry.get(k, "") for k in HISTORY_KEYS},
                           sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]


def stamp_entry(entry):
    """Give an event the two fields the trail needs: a precise clock and an id."""
    entry = dict(entry)
    entry.setdefault("at", now())
    entry.setdefault("ts", datetime.datetime.now().isoformat(timespec="microseconds"))
    entry["id"] = entry_id(entry)
    return entry


def _append_rule(path, rule, comment):
    existing = read_text(path)
    if rule in existing:
        return
    with open(path, "a", encoding="utf-8") as fh:
        if existing and not existing.endswith("\n"):
            fh.write("\n")
        fh.write(f"# {comment}\n{rule}\n")


def ensure_union_merge(feature_dir):
    """
    Tell git how to treat the two files this script owns, from inside the feature
    directory rather than the repo root — which keeps the promise never to write outside
    the directory it was pointed at.

    `merge=union` is built into git and needs no configuration, but a repo that never
    sees the line gets a conflict on every concurrent approval, which is the failure the
    trail exists to remove. The lock is machine-local and belongs to nobody's history.
    """
    _append_rule(os.path.join(feature_dir, GITATTRIBUTES),
                 f"{HISTORY_FILE} merge=union",
                 f"{HISTORY_FILE} only ever grows — merge both sides, never choose.")
    _append_rule(os.path.join(feature_dir, GITIGNORE),
                 LOCK_FILE,
                 "machine-local write lock; never part of the plan")


def append_history(feature_dir, entry):
    """One line, one event, O_APPEND — the only write in this file that never rewrites."""
    ensure_union_merge(feature_dir)
    with open(os.path.join(feature_dir, HISTORY_FILE), "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, sort_keys=True, ensure_ascii=False) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def read_history(feature_dir):
    """
    Parse the trail into a deterministic order.

    A union merge interleaves both sides' lines in whatever order git produced, so line
    order carries no meaning. Sorting by (ts, id) replays identically in every checkout:
    microseconds order same-machine events exactly, and the id breaks cross-machine ties
    the same way everywhere. A torn line costs one event, never the file.
    """
    entries = []
    for line in read_text(os.path.join(feature_dir, HISTORY_FILE)).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict) and entry.get("gate"):
            entries.append(entry)
    seen, unique = set(), []
    for entry in entries:
        key = entry.get("id") or entry_id(entry)
        if key in seen:
            continue                     # the same event reached this checkout twice
        seen.add(key)
        unique.append(entry)
    unique.sort(key=lambda e: (e.get("ts") or e.get("at") or "", e.get("id") or ""))
    return unique


def normalise_actor(name):
    """
    One actor, however the name was typed.

    `--by` is free text, so the same person arrives as "Akenzy", "akenzy" and " Akenzy ".
    Identity is the casefolded name with its whitespace collapsed, because comparing raw
    strings would let a stray space defeat the separation the reviewer check enforces —
    and an actor who has to retype their own name differently to get past a refusal has
    been told the rule is decorative.
    """
    return " ".join((name or "").split()).casefold()


def last_ticket_event(history, ticket, action):
    """
    The most recent entry for one ticket and one action, or None.

    `read_history` already returns the trail in the one deterministic order every checkout
    agrees on, so the answer is the last match rather than a re-sort here. A second
    ordering rule in this file is a second thing that can disagree with the record.
    """
    for entry in reversed(history):
        if entry.get("ticket") == ticket and entry.get("action") == action:
            return entry
    return None


def fold_gate(history):
    """
    Replay the trail into a current gate.

    Two people passing the same gate on two machines is a real double approval, not a
    conflict to resolve: both entries stay, and the fold is unchanged by the second.
    """
    gate = "none"
    for entry in history:
        action, target = entry.get("action", ""), entry.get("gate", "")
        if target not in GATES:
            continue
        if action == "passed":
            if gate_index(target) > gate_index(gate):
                gate = target
        elif action == "reopened":
            idx = gate_index(target)
            gate = GATES[idx - 1] if idx > 0 else "none"
    return gate


def backfill_history(feature_dir, state):
    """Move a plan authored before the trail existed into it, once."""
    if os.path.isfile(os.path.join(feature_dir, HISTORY_FILE)):
        return
    for i, entry in enumerate(state.get("history", [])):
        stamped = dict(entry)
        # keep the recorded chronology; the index only orders events inside one second
        stamped.setdefault("ts", f"{entry.get('at', now())}.{i:06d}")
        append_history(feature_dir, stamp_entry(stamped))


def record(feature_dir, state, entry):
    """
    Append one event, then refresh the derived view.

    Callers do not set `current_gate` themselves — it is folded from the trail, so the
    file and the record cannot drift.
    """
    backfill_history(feature_dir, state)
    append_history(feature_dir, stamp_entry(entry))
    state["history"] = read_history(feature_dir)
    state["current_gate"] = fold_gate(state["history"])
    save_state(feature_dir, state)


def record_evidence(feature_dir, state, ticket, actor, command, result):
    """
    Put one verification run on the trail.

    Goes through `record` like everything else, so the view never drifts from the record —
    including when the run failed and the transition that asked for it is about to be
    refused. A run recorded only on success would throw away the most useful artifact of
    a bad run, which is the same reason the companion package screenshots red steps.

    `fold_gate` needs no branch for this: the entry carries gate G4 but an action that is
    neither `passed` nor `reopened`, so it falls through and changes no gate.
    """
    entry = {
        "gate": "G4", "action": "evidence", "ticket": ticket, "by": actor,
        "command": command, "exit": result.get("exit"),
        "digest": result.get("digest"), "duration_ms": result.get("duration_ms"),
    }
    if result.get("error"):
        entry["reason"] = result["error"].replace(":", " -")
    if result.get("tail"):
        entry["tail"] = result["tail"]        # for a human; deliberately not part of the id
    record(feature_dir, state, entry)
    return entry


def evidence_runs(feature_dir, ticket=None):
    """Recorded runs, oldest first, optionally for one ticket."""
    return [e for e in read_history(feature_dir)
            if e.get("action") == "evidence" and (ticket is None or e.get("ticket") == ticket)]


def passing_run(feature_dir, ticket):
    """The most recent passing run for a ticket, or None. One definition, used by G4."""
    for entry in reversed(evidence_runs(feature_dir, ticket)):
        if entry.get("exit") == 0:
            return entry
    return None


LEGACY_RULESET = 4     # what a plan with no stamp was authored under, by definition


def tool_ruleset():
    """The ruleset this tool implements, read from `uow_graph` — never a second literal."""
    graph = sibling("uow_graph")
    return getattr(graph, "RULESET", LEGACY_RULESET) if graph else LEGACY_RULESET


def plan_ruleset(state):
    """
    The rules this plan is judged under.

    An absent stamp means 4, and that default is the compatibility guarantee rather than a
    fallback: every plan that exists anywhere today predates the stamp, so reading absence
    as "the newest rules" would break all of them at once.
    """
    try:
        return int(str(state.get("ruleset", "")).strip() or LEGACY_RULESET)
    except ValueError:
        return LEGACY_RULESET


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


def sibling(name):
    """
    Import a module that ships beside this one, or None.

    The scripts are siblings by contract — `uow_graph.py` for the plan, `evidence.py` for
    running a command — and importing them beats reimplementing them, because two copies
    of a parser are two things that can disagree about what a ticket says.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    sys.dont_write_bytecode = True   # keep __pycache__ out of the repo
    try:
        return __import__(name)
    except ImportError:
        return None


def parse_frontmatter_files(feature_dir):
    """Reuse uow_graph's loader by import so the two never disagree."""
    uow_graph = sibling("uow_graph")
    if uow_graph is None:
        return {}, {}
    uows, tickets, _, _ = uow_graph.load_plan(feature_dir)
    return uows, tickets


def as_list(value):
    return value if isinstance(value, list) else ([] if not value else [value])


def resolve_verification(feature_dir, ticket):
    """
    What to run for this ticket, and why not, when there is nothing.

    Returns `(command, config, note)`. `command` is None whenever nothing should run, and
    `note` says which of the three reasons applies — not configured, a broken config, or a
    ticket with nothing to verify. Callers must tell those apart: a typo in the config
    that reads as "not configured" silently stops a repo verifying anything.
    """
    uow_graph = sibling("uow_graph")
    if uow_graph is None or not hasattr(uow_graph, "load_evidence_config"):
        return None, None, "unconfigured"
    cfg = uow_graph.load_evidence_config(feature_dir)
    if cfg is None:
        return None, None, "unconfigured"
    if cfg.get("error"):
        return None, cfg, "config error"
    command = cfg["command"]
    if "{tests}" in command:
        tests = as_list(ticket.get("tests"))
        if not tests:
            return None, cfg, "no tests"
        command = command.replace("{tests}", " ".join(str(t) for t in tests))
    return command, cfg, "ready"


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
    out.extend(check_g4_evidence(feature_dir, tickets))
    if not any(l == "fail" for l, _ in out):
        out.append(("ok", f"all {len(tickets)} tickets done, all UoW checklists ticked"))
    return not any(l == "fail" for l, _ in out), out


def check_g4_evidence(feature_dir, tickets):
    """
    The ruleset-5 half of G4: a done ticket must point at a run that actually passed.

    Two separate conditions have to hold before this can fail anything, and collapsing
    them would punish a repo for upgrading:

    * the **plan** was authored at ruleset 5 or later — an older plan is judged by the
      rules it was written against, and only gets a hint;
    * the **repo** opted in with an `evidence:` block — one that never configured
      verification has nothing to produce and is not behind on anything.

    A ticket whose command resolves to nothing (no `tests:`, and a command that wants
    them) is reported rather than failed. There is nothing it could have run, and a gate
    that fails on that teaches people to write a fake `tests:` entry.
    """
    ruleset = plan_ruleset(load_state(feature_dir) or {})
    if ruleset < 5:
        return [("ok", f"plan authored under ruleset {ruleset} — judged by those rules; "
                       f"this tool implements {tool_ruleset()}. Plans created from now on "
                       "carry a verification requirement at G4")]

    graph = sibling("uow_graph")
    cfg = graph.load_evidence_config(feature_dir) if graph and hasattr(
        graph, "load_evidence_config") else None
    if cfg is None:
        return [("ok", "no `evidence:` block in .ai/aidlc.yaml — verification is not "
                       "configured for this repo, so G4 asks for none")]
    if cfg.get("error"):
        return [("fail", cfg["error"])]

    findings, missing, nothing_to_run = [], [], []
    for tid, ticket in sorted(tickets.items()):
        if ticket.get("status") != "done":
            continue        # already reported as not done; do not say it twice
        command, _, note = resolve_verification(feature_dir, ticket)
        if note != "ready":
            nothing_to_run.append(tid)
        elif not passing_run(feature_dir, tid):
            missing.append(tid)
    if missing:
        findings.append(("fail", "no passing verification run on record for: "
                                 + ", ".join(missing)
                                 + " — run `aidlc evidence <ticket>` to see what happened"))
    if nothing_to_run:
        findings.append(("ok", f"{len(nothing_to_run)} ticket(s) declare no `tests:`, so "
                               f"nothing was run for them: {', '.join(nothing_to_run)}"))
    if not missing and not nothing_to_run:
        findings.append(("ok", "every done ticket has a passing verification run"))
    return findings


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


def init_target_dir(args):
    """
    Where `init` writes: `.ai/features/YYYYMMDDNN-<name>`, unless `-d` names a path.

    The lock is taken on this path before the command runs, so both callers have to
    reach the same answer — and taking the lock *creates* the directory, which moves
    the next free sequence. Resolving once and remembering it is what keeps the second
    call from reading its own footprint and minting a second slot.
    """
    cached = getattr(args, "resolved_dir", None)
    if cached:
        return cached
    args.resolved_dir = _resolve_init_dir(args)
    return args.resolved_dir


def _resolve_init_dir(args):
    if args.dir:
        return os.path.abspath(args.dir)
    name = clean_feature_name(args.slug)
    stamp = clean_stamp(getattr(args, "date", None))
    root = os.path.join(".ai", "features")
    if not stamp:
        # Re-running `init` a week later must reopen the feature, not fork it.
        existing = existing_feature_dirs(root, name)
        if existing:
            return os.path.abspath(existing[-1])
    return os.path.abspath(os.path.join(root, feature_dir_name(root, name, stamp)))


def command_dir(args):
    """Where a command will write. `init` derives its own path from the name."""
    if getattr(args, "slug", None) is not None:
        return init_target_dir(args)
    return os.path.abspath(args.dir or ".")


def require_state(feature_dir):
    state = load_state(feature_dir)
    if state is None:
        print(f"refused: no {STATE_FILE} in {feature_dir} — run `aidlc init <slug>` first",
              file=sys.stderr)
        sys.exit(1)
    return state


def cmd_init(args):
    feature_dir = init_target_dir(args)
    # The directory name is the identity everywhere afterwards — the state file, the
    # registry key, the console's URLs — so read it off disk rather than off the
    # argument, which may have arrived undated or through `-d`.
    slug = os.path.basename(feature_dir)
    stamp, feature = split_dated(slug)
    if load_state(feature_dir):
        print(f"already initialised: {feature_dir}")
        return 0
    os.makedirs(os.path.join(feature_dir, "04-units-of-work"), exist_ok=True)
    for name, body in SCAFFOLD.items():
        path = os.path.join(feature_dir, name)
        if not os.path.isfile(path):
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(body.format(slug=slug, feature=feature))
    ensure_union_merge(feature_dir)
    save_state(feature_dir, {
        "feature": feature, "slug": slug, "profile": args.profile or "none",
        "created": now(), "ruleset": tool_ruleset(), "current_gate": "none", "history": [],
    })
    print(f"initialised {feature_dir}")
    if not stamp:
        print(f"note: {slug} carries no YYYYMMDDNN- prefix — kept as given, "
              "new features are dated")
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
        fl, rows = flow_rows(feature_dir)
        if fl:
            hours = aging_threshold(feature_dir)
            old_rows, stuck = fl.aging(rows, hours), fl.blocked(rows)
            if old_rows or stuck:
                parts = []
                if old_rows:
                    parts.append(f"{len(old_rows)} aging past {hours}h "
                                 f"({', '.join(r['ticket'] for r in old_rows)})")
                if stuck:
                    parts.append(f"{len(stuck)} blocked "
                                 f"({', '.join(r['ticket'] for r in stuck)})")
                print("stalled:  " + "; ".join(parts) + " — `aidlc flow` for the detail")
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
    record(feature_dir, state, {
        "gate": gate, "action": "passed", "by": args.by,
        "evidence": evidence.replace(":", " -"),
    })
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
    record(feature_dir, state, {
        "gate": gate, "action": "reopened", "by": args.by,
        "reason": args.reason.replace(":", " -"),
    })
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
    "blocked": {"todo", "in_progress", "review"},
}
# `unblock` is deliberately absent: it restores whatever state the block interrupted,
# read off the block event itself, so it needs no rule of its own and can never demote a
# ticket that was already in review down to todo.


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

    # Separation of duties. `SKILL.md` claimed this rule for a long time before anything
    # enforced it, and the data to enforce it was already being written: `submit` appends
    # the submitting actor to the trail. Read it back rather than trusting the claim.
    if target == "done" and not bypass:
        submitted = last_ticket_event(read_history(feature_dir), tid, "ticket review")
        # No submit event means nobody to conflict with — a ticket moved to review before
        # this check existed, or by hand. Refusing there would strand every in-flight
        # ticket in every repo on the day this ships.
        if submitted and normalise_actor(submitted.get("by")) == normalise_actor(args.by):
            print(f"refused: {tid} was submitted by {submitted.get('by')} — an implementer "
                  f"does not accept its own work", file=sys.stderr)
            print("       have a second actor run `accept`, or use `done --no-review` if "
                  "you are working solo. The bypass is recorded.", file=sys.stderr)
            return 1

    if target in {"review", "done"}:
        ticked, unticked = checklist_state(ticket["_path"])
        if unticked:
            print(f"refused: {tid} has {unticked} unticked done-when item(s) — "
                  "tick them in the ticket file, or say why they no longer apply",
                  file=sys.stderr)
            return 1

    # Verification. It runs on the way into `review` and on the way into `done`, but only
    # while the ticket has no passing run yet — so `submit` runs it, a solo
    # `done --no-review` runs it too, and an `accept` after a green submit does not pay for
    # a second execution of the same suite.
    if target in {"review", "done"} and not passing_run(feature_dir, tid):
        command, cfg, note = resolve_verification(feature_dir, ticket)
        if note == "config error":
            print(f"refused: {cfg['error']}", file=sys.stderr)
            return 1
        if note == "unconfigured":
            print("verification not configured for this repo — no `evidence:` block in "
                  ".ai/aidlc.yaml, so nothing ran")
        elif note == "no tests":
            print(f"warning: {tid} declares no `tests:`, so its command resolves to nothing "
                  "— there is no run to record", file=sys.stderr)
        else:
            ev = sibling("evidence")
            if ev is None:
                print("refused: evidence.py is missing from beside aidlc.py", file=sys.stderr)
                return 1
            print(f"verifying {tid}: {command}")
            result = ev.run(command, cfg["timeout"], cfg["output_ceiling"])
            # Record before deciding. A run that only reaches the trail when it passes
            # throws away the most useful artifact of a bad run.
            record_evidence(feature_dir, state, tid, args.by, command, result)
            if not ev.passed(result):
                detail = result.get("error") or f"exit {result.get('exit')}"
                print(f"refused: verification failed for {tid} — {detail}", file=sys.stderr)
                print(f"       the run is on the record: `aidlc evidence {tid}`",
                      file=sys.stderr)
                return 1
            print(f"verified: exit 0 in {result['duration_ms'] / 1000:.1f}s")

    text = read_text(ticket["_path"])
    new_text, n = re.subn(r"^status:\s*\S+\s*$", f"status: {target}", text, count=1, flags=re.M)
    if not n:
        print(f"refused: could not find a status line in {ticket['_path']}", file=sys.stderr)
        return 1
    write_atomic(ticket["_path"], new_text)

    entry = {"gate": "G4", "action": f"ticket {target}", "by": args.by, "ticket": tid}
    if target == "blocked":
        # What to come back to. Restoring to a fixed state would silently demote a ticket
        # that was already in review, and nobody would notice until its dependents moved.
        entry["from"] = current
    if getattr(args, "reason", None):
        entry["reason"] = args.reason.replace(":", " -")
    if target == "done" and bypass:
        entry["action"] = "ticket done (review bypassed)"
    record(feature_dir, state, entry)
    print(f"{tid}: {current} → {target}")
    if target == "review":
        print("dependents stay blocked until a human accepts — review lag is visible "
              "as stalled parallelism, which is the intended pressure")
    if target == "done":
        run_uow_graph(feature_dir, ["--write"])
        print("regenerated graph, traceability and registry")
    return 0


def open_block(feature_dir, tid):
    """
    The block this ticket is still sitting in, or None.

    Pairs blocks with unblocks rather than trusting the status line, because a ticket
    hand-edited to `blocked` has no block event — and that is exactly the case `unblock`
    must refuse rather than guess its way out of.
    """
    pending = None
    for entry in read_history(feature_dir):
        if entry.get("ticket") != tid:
            continue
        if entry.get("action") == "ticket blocked":
            pending = entry
        elif entry.get("action") == "ticket unblocked":
            pending = None
    return pending


def cmd_block(args):
    return _transition(args, "blocked")


def cmd_unblock(args):
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

    block = open_block(feature_dir, tid)
    if not block:
        print(f"refused: {tid} has no open block on the record — nothing to restore",
              file=sys.stderr)
        print("       a ticket edited to `status: blocked` by hand never went through "
              "`aidlc block`, so the state it came from was never written down",
              file=sys.stderr)
        return 1

    restored = block.get("from") or "todo"
    ticket = tickets[tid]
    text = read_text(ticket["_path"])
    new_text, n = re.subn(r"^status:\s*\S+\s*$", f"status: {restored}", text,
                          count=1, flags=re.M)
    if not n:
        print(f"refused: could not find a status line in {ticket['_path']}", file=sys.stderr)
        return 1
    write_atomic(ticket["_path"], new_text)
    record(feature_dir, state, {"gate": "G4", "action": "ticket unblocked", "by": args.by,
                                "ticket": tid, "from": restored,
                                "reason": (block.get("reason") or "")[:120]})
    print(f"{tid}: blocked → {restored}  (was blocked: {block.get('reason', '?')})")
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


AGING_DEFAULT_HOURS = 48


def flow_rows(feature_dir):
    """(flow module, rows) folded from the trail, or (None, []) if flow.py is missing."""
    fl, graph = sibling("flow"), sibling("uow_graph")
    if fl is None:
        return None, []
    _, tickets = parse_frontmatter_files(feature_dir)
    estimates = {tid: graph.parse_estimate(t.get("estimate")) for tid, t in tickets.items()} \
        if graph else {}
    return fl, fl.feature_rows(read_history(feature_dir), estimates)


def aging_threshold(feature_dir, override=None):
    """The flag beats the repo's config, which beats the default."""
    if override:
        return override
    graph = sibling("uow_graph")
    cfg = graph.load_evidence_config(feature_dir) if graph and hasattr(
        graph, "load_evidence_config") else None
    if cfg and not cfg.get("error"):
        return cfg.get("aging_hours", AGING_DEFAULT_HOURS)
    return AGING_DEFAULT_HOURS


def cmd_flow(args):
    feature_dir = resolve_dir(args)
    state = require_state(feature_dir)
    if not passed(state, "G3"):
        print(f"gate is {state.get('current_gate')} — there are no tickets to measure yet")
        return 0
    fl, rows = flow_rows(feature_dir)
    if fl is None:
        print("refused: flow.py is missing from beside aidlc.py", file=sys.stderr)
        return 1
    hours = aging_threshold(feature_dir, getattr(args, "aging_hours", None))

    print(f"{'ticket':12} {'status':12} {'cycle':>8} {'review':>8} {'blocked':>8} "
          f"{'est':>7} {'bias':>8}")
    print("-" * 68)
    for row in rows:
        print(f"{row['ticket']:12} {row['status']:12} "
              f"{fl.fmt_hours(row['cycle_hours']):>8} {fl.fmt_hours(row['review_hours']):>8} "
              f"{fl.fmt_hours(row['blocked_hours']):>8} "
              f"{fl.fmt_hours(row['estimate_hours']):>7} {fl.fmt_hours(row['bias_hours']):>8}")

    total = fl.totals(rows)
    print(f"\nmedian cycle {fl.fmt_hours(total['median_cycle_hours'])} · "
          f"median review lag {fl.fmt_hours(total['median_review_hours'])} · "
          f"blocked {fl.fmt_hours(total['blocked_hours'])}")
    print(f"estimated {fl.fmt_hours(total['estimate_hours'])} · "
          f"actual {fl.fmt_hours(total['actual_hours'])} · "
          f"bias {fl.fmt_hours(total['bias_hours'])}")
    print(f"measured {total['measured']}/{total['tickets']} tickets"
          + (f", {total['unknown']} could not be measured" if total["unknown"] else ""))

    old = fl.aging(rows, hours)
    stuck = fl.blocked(rows)
    if old:
        print(f"\naging past {hours}h: "
              + ", ".join(f"{r['ticket']} ({fl.fmt_hours(r['aging_hours'])})" for r in old))
    if stuck:
        print("blocked: " + ", ".join(r["ticket"] for r in stuck))
    # Said once, where the numbers are: these are properties of tickets, not of people.
    print("\nPer ticket and per feature. Not a measure of anyone who worked on them.")
    return 0


def cmd_evidence(args):
    feature_dir = resolve_dir(args)
    require_state(feature_dir)
    runs = evidence_runs(feature_dir, args.ticket)
    if not runs:
        target = args.ticket or "this feature"
        print(f"no recorded verification runs for {target}")
        return 0
    for entry in reversed(runs):                      # newest first
        code = entry.get("exit")
        verdict = "pass" if code == 0 else "FAIL"
        ms = entry.get("duration_ms")
        took = f"{ms / 1000:.1f}s" if isinstance(ms, int) else "?"
        print(f"{entry.get('at')}  {entry.get('ticket')}  {verdict}  "
              f"exit={code if code is not None else '-'}  {took}  by {entry.get('by')}")
        print(f"    $ {entry.get('command')}")
        if entry.get("reason"):
            print(f"    ! {entry['reason']}")
        # The tail is the defect report. Printing it for a passing run is noise; withholding
        # it for a failing one means going and reading the trail by hand.
        if code != 0 and entry.get("tail"):
            for line in entry["tail"].rstrip().splitlines()[-20:]:
                print(f"    | {line}")
        print()
    return 0


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


def cmd_reconcile(args):
    """Rebuild the derived state file from the trail — the fix for a merge conflict."""
    feature_dir = resolve_dir(args)
    state = require_state(feature_dir)
    backfill_history(feature_dir, state)
    trail = read_history(feature_dir)
    state["history"] = trail
    state["current_gate"] = fold_gate(trail)
    save_state(feature_dir, state)
    print(f"{STATE_FILE} rebuilt from {len(trail)} trail entries — gate is "
          f"{state['current_gate']}")
    passes = {}
    for entry in trail:
        if entry.get("action") == "passed":
            passes.setdefault(entry.get("gate"), []).append(entry.get("by", "?"))
    for gate, approvers in sorted(passes.items()):
        if len(approvers) > 1:
            print(f"note: {gate} was passed {len(approvers)} times "
                  f"({', '.join(approvers)}) — both are on the record, on purpose")
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

    p = sub.add_parser("init", help="scaffold .ai/features/YYYYMMDDNN-<name>")
    p.add_argument("slug", metavar="name", help="feature name; the date prefix is added for you")
    p.add_argument("--profile")
    p.add_argument("--date", metavar="YYYYMMDD[NN]",
                   help="date prefix (default: today); add NN to pin the day's slot")
    p.set_defaults(fn=cmd_init, mutates=True)
    p = sub.add_parser("status"); p.set_defaults(fn=cmd_status)
    p = sub.add_parser("check"); p.add_argument("gate"); p.set_defaults(fn=cmd_check)
    p = sub.add_parser("pass"); p.add_argument("gate"); p.add_argument("--by", required=True); p.set_defaults(fn=cmd_pass, mutates=True)
    p = sub.add_parser("reopen"); p.add_argument("gate"); p.add_argument("--by", required=True)
    p.add_argument("--reason", required=True); p.set_defaults(fn=cmd_reopen, mutates=True)
    p = sub.add_parser("ready"); p.add_argument("-v", "--verbose", action="store_true"); p.set_defaults(fn=cmd_ready)
    p = sub.add_parser("start"); p.add_argument("ticket"); p.add_argument("--by", required=True); p.set_defaults(fn=cmd_start, mutates=True)
    p = sub.add_parser("submit", help="implementer hands off for review")
    p.add_argument("ticket"); p.add_argument("--by", required=True)
    p.set_defaults(fn=cmd_submit, mutates=True)
    p = sub.add_parser("accept", help="reviewer accepts; only from review")
    p.add_argument("ticket"); p.add_argument("--by", required=True)
    p.set_defaults(fn=cmd_accept, mutates=True)
    p = sub.add_parser("reject", help="reviewer sends it back")
    p.add_argument("ticket"); p.add_argument("--by", required=True)
    p.add_argument("--reason", required=True); p.set_defaults(fn=cmd_reject, mutates=True)
    p = sub.add_parser("done", help="solo shortcut; use submit/accept when a reviewer exists")
    p.add_argument("ticket"); p.add_argument("--by", required=True)
    p.add_argument("--no-review", action="store_true",
                   help="required to skip review; the bypass is recorded in the audit trail")
    p.set_defaults(fn=cmd_done, mutates=True)
    p = sub.add_parser("flow", help="cycle time, review lag, blocked time, estimate bias")
    p.add_argument("--aging-hours", type=int,
                   help="in-progress threshold; defaults to evidence.aging_hours, then 48")
    p.set_defaults(fn=cmd_flow)
    p = sub.add_parser("block", help="park a ticket that is waiting on something")
    p.add_argument("ticket"); p.add_argument("--by", required=True)
    p.add_argument("--reason", required=True); p.set_defaults(fn=cmd_block, mutates=True)
    p = sub.add_parser("unblock", help="restore the state the block interrupted")
    p.add_argument("ticket"); p.add_argument("--by", required=True)
    p.set_defaults(fn=cmd_unblock, mutates=True)
    p = sub.add_parser("evidence", help="recorded verification runs, newest first")
    p.add_argument("ticket", nargs="?", help="one ticket; omit for the whole feature")
    p.set_defaults(fn=cmd_evidence)
    p = sub.add_parser("lint-touches"); p.add_argument("--repo", required=True); p.set_defaults(fn=cmd_lint_touches)
    p = sub.add_parser("snapshot", help="emit a portable JSON snapshot for the collector")
    p.add_argument("--to", help="directory to write into; omit to print to stdout")
    p.add_argument("--repo", help="repo root (default: three levels above the feature dir)")
    p.add_argument("--label", help="repo label used in the report")
    p.set_defaults(fn=cmd_snapshot)
    p = sub.add_parser("audit"); p.set_defaults(fn=cmd_audit)
    p = sub.add_parser("reconcile", help="rebuild the state file from history.jsonl")
    p.set_defaults(fn=cmd_reconcile, mutates=True)

    args = ap.parse_args()
    if not getattr(args, "mutates", False):
        return args.fn(args)
    # One writer per feature, held across the whole read-check-write. See feature_lock.
    with feature_lock(command_dir(args)):
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
