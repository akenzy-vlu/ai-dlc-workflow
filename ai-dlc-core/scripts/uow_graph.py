#!/usr/bin/env python3
"""
uow_graph.py — validate and generate the Unit-of-Work / ticket graph for an AI-DLC
feature plan.

Reads:
    <feature>/02-requirements.md                  (AC ids, for coverage)
    <feature>/01-assumptions.md                   (blocking + pending count)
    <feature>/04-units-of-work/UOW-*/uow.md
    <feature>/04-units-of-work/UOW-*/tickets/T-*.md

Writes (only with --write):
    <feature>/05-ticket-graph.md
    <feature>/06-traceability.md
    <feature>/registry.yaml

Stdlib only. Exit code 1 if any validation error is found.

Usage:
    python uow_graph.py .ai/features/course-registration
    python uow_graph.py .ai/features/course-registration --write
    python uow_graph.py .ai/features/course-registration --ready
"""

import argparse
import os
import re
import sys
from collections import defaultdict, deque

# The layer vocabulary is the only stack-specific thing in this script. Flutter uses
# presentation/data/domain; a NestJS DDD service uses application/domain/infra; an infra
# repo might use module/chart/policy. Override it per repo in .ai/aidlc.yaml:
#     layers: [domain, application, infra, api, test]
__version__ = "0.4.0"
RULESET = 4          # bump whenever a change can make a previously-valid plan fail

DEFAULT_LAYERS = {"domain", "data", "presentation", "infra", "test"}
VALID_TYPES = {"feature", "refactor", "spike", "test", "chore"}
VALID_STATUS = {"todo", "in_progress", "blocked", "review", "done"}
VALID_RISK = {"low", "medium", "high"}
HOURS_PER_DAY = 8
TICKET_HOUR_CEILING = 4
# A UoW is bounded by how long it takes to *finish*, not by how much work it contains.
# Two tickets that can run in parallel do not make a slice twice as long.
UOW_ELAPSED_CEILING = 2 * HOURS_PER_DAY

# --------------------------------------------------------------------------- #
# minimal frontmatter parser
# --------------------------------------------------------------------------- #


def parse_frontmatter(path):
    """Return (dict, error_or_None). Handles scalars, inline lists, block lists."""
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        return {}, f"cannot read: {exc}"

    if not text.startswith("---"):
        return {}, "missing YAML frontmatter (file must start with ---)"

    end = text.find("\n---", 3)
    if end == -1:
        return {}, "unterminated frontmatter block"

    block = text[3:end]
    data = {}
    current_list_key = None

    for raw in block.splitlines():
        # Strip trailing comments from scalars only. List items keep theirs: the `touches`
        # convention uses `# new` to declare a path that does not exist yet, and stripping
        # it here would make lint-touches reject every correctly-annotated new path.
        stripped_comment = raw.split("  #")[0].rstrip()
        is_list_item = raw.startswith((" ", "\t")) and raw.strip().startswith("- ")
        line = raw.rstrip() if is_list_item else stripped_comment
        if not line.strip() or line.strip().startswith("#"):
            continue

        if is_list_item:
            if current_list_key:
                data[current_list_key].append(line.strip()[2:].strip().strip("'\""))
            continue

        if ":" not in line:
            continue

        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()

        if value == "":
            current_list_key = key
            data[key] = []
            continue

        current_list_key = None
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            data[key] = [v.strip().strip("'\"") for v in inner.split(",") if v.strip()]
        else:
            data[key] = value.strip("'\"")

    return data, None


def as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value] if value else []


def parse_estimate(value):
    """'3h' -> 3.0, '30m' -> 0.5, '1d' -> 8.0, '2' -> 2.0. None if unparseable."""
    if not value:
        return None
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*([hmd]?)\s*", str(value), re.I)
    if not match:
        return None
    amount, unit = float(match.group(1)), match.group(2).lower()
    return {"m": amount / 60, "d": amount * HOURS_PER_DAY}.get(unit, amount)


def fmt_hours(hours):
    if hours is None:
        return "?"
    if hours >= HOURS_PER_DAY:
        return f"{hours / HOURS_PER_DAY:.1f}d"
    return f"{hours:g}h"


# --------------------------------------------------------------------------- #
# loading
# --------------------------------------------------------------------------- #


def load_plan(root):
    errors, warnings = [], []
    uows, tickets = {}, {}

    uow_root = os.path.join(root, "04-units-of-work")
    if not os.path.isdir(uow_root):
        errors.append(f"missing directory: {uow_root}")
        return uows, tickets, errors, warnings

    for entry in sorted(os.listdir(uow_root)):
        uow_dir = os.path.join(uow_root, entry)
        if not os.path.isdir(uow_dir):
            continue

        uow_file = os.path.join(uow_dir, "uow.md")
        if not os.path.isfile(uow_file):
            errors.append(f"{entry}/ has no uow.md")
            continue

        meta, err = parse_frontmatter(uow_file)
        if err:
            errors.append(f"{entry}/uow.md: {err}")
            continue

        uid = meta.get("id")
        if not uid:
            errors.append(f"{entry}/uow.md: frontmatter has no 'id'")
            continue
        if uid in uows:
            errors.append(f"duplicate UoW id {uid}")
            continue

        meta["_path"] = uow_file
        meta["_dir"] = uow_dir
        uows[uid] = meta

        ticket_dir = os.path.join(uow_dir, "tickets")
        if not os.path.isdir(ticket_dir):
            warnings.append(f"{uid} has no tickets/ directory")
            continue

        for fname in sorted(os.listdir(ticket_dir)):
            if not fname.endswith(".md"):
                continue
            tpath = os.path.join(ticket_dir, fname)
            tmeta, terr = parse_frontmatter(tpath)
            if terr:
                errors.append(f"{fname}: {terr}")
                continue
            tid = tmeta.get("id")
            if not tid:
                errors.append(f"{fname}: frontmatter has no 'id'")
                continue
            if tid in tickets:
                errors.append(f"duplicate ticket id {tid}")
                continue
            tmeta["_path"] = tpath
            tmeta.setdefault("uow", uid)
            if tmeta["uow"] != uid:
                warnings.append(f"{tid} sits in {uid} but declares uow: {tmeta['uow']}")
            tickets[tid] = tmeta

    return uows, tickets, errors, warnings


def find_config(feature_root):
    """Nearest .ai/aidlc.yaml walking up from the feature dir."""
    path = os.path.abspath(feature_root)
    for _ in range(6):
        candidate = os.path.join(path, ".ai", "aidlc.yaml")
        if os.path.isfile(candidate):
            return candidate
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    return None


def check_ruleset(feature_root):
    """Refuse to judge a plan under rules it was not written against.

    Centralising the tool means one upgrade can invalidate plans in every repo at once.
    A repo therefore pins the ruleset it was authored under, and a mismatch is an explicit
    migration decision rather than a morning of mysterious failures.
    """
    cfg = find_config(feature_root)
    if not cfg:
        return []
    match = re.search(r"^ruleset:\s*(\d+)", read_text(cfg), re.M)
    if not match:
        return [f"{os.path.relpath(cfg)} has no `ruleset:` pin — add `ruleset: {RULESET}` "
                "so a future tool upgrade cannot silently change the verdict"]
    pinned = int(match.group(1))
    if pinned == RULESET:
        return []
    if pinned < RULESET:
        return [f"plan was authored under ruleset {pinned}, tool enforces {RULESET} — "
                f"review the changes, then bump the pin to {RULESET}"]
    return [f"plan requires ruleset {pinned} but this tool only implements {RULESET} — "
            "upgrade the tool"]


def load_layers(feature_root):
    """Walk up from the feature dir looking for .ai/aidlc.yaml with a `layers:` key."""
    path = os.path.abspath(feature_root)
    for _ in range(6):
        candidate = os.path.join(path, ".ai", "aidlc.yaml")
        if os.path.isfile(candidate):
            text = read_text(candidate)
            inline = re.search(r"^layers:\s*\[(.+)\]\s*$", text, re.M)
            if inline:
                return {v.strip().strip("'\"") for v in inline.group(1).split(",") if v.strip()}
            block = re.search(r"^layers:\s*$((?:\n\s+-\s*\S+)+)", text, re.M)
            if block:
                return {m.strip().strip("'\"") for m in re.findall(r"-\s*(\S+)", block.group(1))}
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    return set(DEFAULT_LAYERS)


def read_text(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def load_ids(path, pattern):
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    seen, out = set(), []
    for match in re.finditer(pattern, text):
        if match.group(0) not in seen:
            seen.add(match.group(0))
            out.append(match.group(0))
    return out


def count_open_blocking_assumptions(path):
    """Rows in the register table that are blocking and still pending."""
    if not os.path.isfile(path):
        return None
    count = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if not line.lstrip().startswith("|"):
                continue
            cells = [c.strip().lower() for c in line.strip().strip("|").split("|")]
            if len(cells) < 6 or not re.match(r"a-\d+", cells[0]):
                continue
            if cells[3] in {"yes", "true"} and cells[5] == "pending":
                count += 1
    return count


# --------------------------------------------------------------------------- #
# validation
# --------------------------------------------------------------------------- #


def validate(root, uows, tickets, errors, warnings):
    valid_layers = load_layers(root)
    ac_ids = load_ids(os.path.join(root, "02-requirements.md"), r"\bAC-\d+\b")
    covered = defaultdict(list)

    for uid, uow in uows.items():
        if str(uow.get("demoable", "")).lower() not in {"true", "yes"}:
            errors.append(f"{uid}: demoable must be true — a UoW that cannot be demoed is a layer, not a slice")
        if uow.get("risk") and uow["risk"] not in VALID_RISK:
            warnings.append(f"{uid}: risk '{uow['risk']}' not in {sorted(VALID_RISK)}")
        if uow.get("status", "todo") not in VALID_STATUS:
            errors.append(f"{uid}: status '{uow.get('status')}' not in {sorted(VALID_STATUS)}")
        for dep in as_list(uow.get("depends_on")):
            if dep not in uows:
                errors.append(f"{uid}: depends_on unknown UoW '{dep}'")
        if not uow.get("rollback"):
            warnings.append(f"{uid}: no rollback declared")

    for tid, ticket in tickets.items():
        layer = ticket.get("layer")
        if layer not in valid_layers:
            errors.append(
                f"{tid}: layer '{layer}' not in {sorted(valid_layers)} — "
                "override the vocabulary in .ai/aidlc.yaml if this repo uses different layers"
            )
        if ticket.get("type") not in VALID_TYPES:
            errors.append(f"{tid}: type '{ticket.get('type')}' not in {sorted(VALID_TYPES)}")
        if ticket.get("status", "todo") not in VALID_STATUS:
            errors.append(f"{tid}: status '{ticket.get('status')}' not in {sorted(VALID_STATUS)}")

        hours = parse_estimate(ticket.get("estimate"))
        if hours is None:
            errors.append(f"{tid}: unparseable estimate '{ticket.get('estimate')}'")
        elif hours > TICKET_HOUR_CEILING:
            errors.append(
                f"{tid}: estimate {fmt_hours(hours)} exceeds the {TICKET_HOUR_CEILING}h ceiling — split it"
            )

        for dep in as_list(ticket.get("depends_on")):
            if dep not in tickets:
                errors.append(f"{tid}: depends_on unknown ticket '{dep}'")
            elif tid not in as_list(tickets[dep].get("blocks")):
                warnings.append(f"{dep} is a dependency of {tid} but does not list it in 'blocks'")
        for blocked in as_list(ticket.get("blocks")):
            if blocked not in tickets:
                errors.append(f"{tid}: blocks unknown ticket '{blocked}'")
            elif tid not in as_list(tickets[blocked].get("depends_on")):
                errors.append(f"{tid} blocks {blocked}, but {blocked} does not declare the dependency")

        for ac in as_list(ticket.get("verifies")):
            covered[ac].append(tid)
            if ac_ids and ac not in ac_ids:
                warnings.append(f"{tid}: verifies '{ac}' which is not in 02-requirements.md")

        if not as_list(ticket.get("touches")):
            warnings.append(f"{tid}: no 'touches' paths — hard to review scope")

    for ac in ac_ids:
        if ac not in covered:
            errors.append(f"{ac} has no covering ticket")

    for a, b, paths in write_conflicts(tickets):
        warnings.append(
            f"{a} and {b} have no ordering constraint but both write "
            f"{', '.join(paths)} — serialise them with depends_on, or split the file, "
            "before running them on parallel agents"
        )

    for uid in uows:
        _, elapsed = uow_internals(uid, tickets)
        if elapsed > UOW_ELAPSED_CEILING:
            warnings.append(
                f"{uid}: internal critical path {fmt_hours(elapsed)} exceeds the "
                f"{fmt_hours(UOW_ELAPSED_CEILING)} slice ceiling — split it"
            )

    return ac_ids, covered


def uow_internals(uid, tickets):
    """(total effort, internal critical path) for one UoW, ignoring cross-UoW edges."""
    members = {t: m for t, m in tickets.items() if m.get("uow") == uid}
    effort = sum(parse_estimate(m.get("estimate")) or 0 for m in members.values())
    memo = {}

    def visit(tid, seen):
        if tid in memo:
            return memo[tid]
        if tid in seen:
            return 0
        seen = seen | {tid}
        own = parse_estimate(members[tid].get("estimate")) or 0
        best = max(
            (visit(d, seen) for d in as_list(members[tid].get("depends_on")) if d in members),
            default=0,
        )
        memo[tid] = own + best
        return memo[tid]

    elapsed = max((visit(t, frozenset()) for t in members), default=0)
    return effort, elapsed


def topological_waves(tickets):
    """Kahn's algorithm by level. Returns (waves, cycle_nodes)."""
    indeg = {tid: 0 for tid in tickets}
    children = defaultdict(list)
    for tid, ticket in tickets.items():
        for dep in as_list(ticket.get("depends_on")):
            if dep in tickets:
                indeg[tid] += 1
                children[dep].append(tid)

    queue = deque(sorted(t for t, d in indeg.items() if d == 0))
    waves, placed = [], 0
    while queue:
        wave = sorted(queue)
        waves.append(wave)
        queue = deque()
        for node in wave:
            placed += 1
            for child in children[node]:
                indeg[child] -= 1
                if indeg[child] == 0:
                    queue.append(child)

    cycle = sorted(t for t, d in indeg.items() if d > 0) if placed < len(tickets) else []
    return waves, cycle


def critical_path(tickets):
    """Longest path by estimate hours. Returns (path, total_hours)."""
    memo, chain = {}, {}

    def visit(tid, seen):
        if tid in memo:
            return memo[tid]
        if tid in seen:
            return 0
        seen = seen | {tid}
        own = parse_estimate(tickets[tid].get("estimate")) or 0
        best, best_child = 0, None
        for dep in as_list(tickets[tid].get("depends_on")):
            if dep in tickets:
                cost = visit(dep, seen)
                if cost > best:
                    best, best_child = cost, dep
        memo[tid] = own + best
        chain[tid] = best_child
        return memo[tid]

    for tid in tickets:
        visit(tid, frozenset())

    if not memo:
        return [], 0
    end = max(memo, key=lambda t: memo[t])
    path, node = [], end
    while node:
        path.append(node)
        node = chain.get(node)
    return list(reversed(path)), memo[end]


def ancestors_map(tickets):
    """For each ticket, every ticket it transitively depends on."""
    cache = {}

    def walk(tid, seen):
        if tid in cache:
            return cache[tid]
        out = set()
        for dep in as_list(tickets[tid].get("depends_on")):
            if dep in tickets and dep not in seen:
                out.add(dep)
                out |= walk(dep, seen | {tid})
        cache[tid] = out
        return out

    return {t: walk(t, frozenset()) for t in tickets}


def touch_paths(ticket):
    """touches entries with any trailing `# note` stripped."""
    return {p.split("#")[0].strip() for p in as_list(ticket.get("touches")) if p.split("#")[0].strip()}


def write_conflicts(tickets):
    """Pairs with no ordering constraint that write the same path.

    Wave membership is the wrong test here: waves are topological levels, not a schedule.
    Two tickets in different waves with no dependency path between them can still be in
    flight at the same time, and if they touch the same file one of them loses its work.
    """
    anc = ancestors_map(tickets)
    out = []
    ids = sorted(tickets)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            if b in anc[a] or a in anc[b]:
                continue
            overlap = touch_paths(tickets[a]) & touch_paths(tickets[b])
            if overlap:
                out.append((a, b, sorted(overlap)))
    return out


def ready_tickets(tickets):
    out = []
    for tid, ticket in sorted(tickets.items()):
        if ticket.get("status", "todo") != "todo":
            continue
        deps = as_list(ticket.get("depends_on"))
        if all(tickets.get(d, {}).get("status") == "done" for d in deps):
            out.append(tid)
    return out


# --------------------------------------------------------------------------- #
# generation
# --------------------------------------------------------------------------- #


def mermaid(uows, tickets):
    lines = ["```mermaid", "graph LR"]
    for uid in sorted(uows):
        members = sorted(t for t, m in tickets.items() if m.get("uow") == uid)
        if not members:
            continue
        lines.append(f'  subgraph {uid.replace("-", "_")}["{uid} · {uows[uid].get("title", "")}"]')
        for tid in members:
            label = tickets[tid].get("title", tid).replace('"', "'")
            done = "✓ " if tickets[tid].get("status") == "done" else ""
            lines.append(f'    {tid.replace("-", "_")}["{done}{tid}<br/>{label}"]')
        lines.append("  end")
    for tid, ticket in sorted(tickets.items()):
        for dep in as_list(ticket.get("depends_on")):
            if dep in tickets:
                lines.append(f'  {dep.replace("-", "_")} --> {tid.replace("-", "_")}')
    lines.append("```")
    return "\n".join(lines)


def render_graph_doc(root, uows, tickets, waves, path, path_hours):
    slug = os.path.basename(os.path.abspath(root))
    total = sum(parse_estimate(t.get("estimate")) or 0 for t in tickets.values())
    done = sum(1 for t in tickets.values() if t.get("status") == "done")

    out = [
        "<!-- GENERATED by scripts/uow_graph.py — do not edit by hand -->",
        "",
        f"# Ticket graph — {slug}",
        "",
        f"- Units of Work: **{len(uows)}**",
        f"- Tickets: **{len(tickets)}** ({done} done)",
        f"- Total effort: **{fmt_hours(total)}**",
        f"- Critical path: **{fmt_hours(path_hours)}** across {len(path)} tickets",
        f"- Theoretical minimum duration with unlimited parallelism: **{fmt_hours(path_hours)}**",
        "",
        "## Units of Work",
        "",
        "| UoW | Title | Risk | Effort | Elapsed | Depends on | Status |",
        "|-----|-------|------|--------|---------|-----------|--------|",
    ]
    for uid in sorted(uows):
        u = uows[uid]
        deps = ", ".join(as_list(u.get("depends_on"))) or "—"
        effort, elapsed = uow_internals(uid, tickets)
        out.append(
            f"| {uid} | {u.get('title', '')} | {u.get('risk', '—')} | "
            f"{fmt_hours(effort)} | {fmt_hours(elapsed)} | {deps} | {u.get('status', 'todo')} |"
        )
    out.append("")
    out.append("Effort is total person-hours. Elapsed is the longest dependency chain inside the")
    out.append("slice — the floor on how fast it can finish no matter how many people work on it.")

    out += ["", "## Dependency graph", "", mermaid(uows, tickets), "", "## Execution waves", ""]
    out.append("Tickets in the same wave have no dependency between them and can run in parallel.")
    out.append("")
    out.append("| Wave | Tickets | Parallel capacity | Wave duration (longest ticket) |")
    out.append("|------|---------|-------------------|-------------------------------|")
    for i, wave in enumerate(waves, 1):
        longest = max((parse_estimate(tickets[t].get("estimate")) or 0) for t in wave)
        out.append(f"| W{i} | {', '.join(wave)} | {len(wave)} | {fmt_hours(longest)} |")

    hazards = write_conflicts(tickets)
    out += ["", "## Write-conflict hazards", ""]
    if hazards:
        out.append("These pairs have no ordering constraint, so a scheduler may run them at the")
        out.append("same time — and they write the same path. Sequential execution is safe;")
        out.append("parallel agents will lose one side's work.")
        out.append("")
        out.append("| A | B | Contested path |")
        out.append("|---|---|---|")
        for a, b, paths in hazards:
            out.append(f"| {a} | {b} | {', '.join(f'`{p}`' for p in paths)} |")
    else:
        out.append("None: every pair that writes a shared path is ordered by a dependency.")

    out += ["", "## Critical path", "", " → ".join(path) if path else "—", ""]
    out.append(f"Total: **{fmt_hours(path_hours)}**. Shortening the plan means shortening this chain;")
    out.append("adding people to tickets off this path will not make the feature ship sooner.")

    out += ["", "## Tickets", "", "| ID | UoW | Layer | Type | Est | Depends on | Verifies | Status |",
            "|----|-----|-------|------|-----|-----------|----------|--------|"]
    for tid in sorted(tickets):
        t = tickets[tid]
        out.append(
            f"| {tid} | {t.get('uow', '')} | {t.get('layer', '')} | {t.get('type', '')} | "
            f"{t.get('estimate', '')} | {', '.join(as_list(t.get('depends_on'))) or '—'} | "
            f"{', '.join(as_list(t.get('verifies'))) or '—'} | {t.get('status', 'todo')} |"
        )
    return "\n".join(out) + "\n"


def render_traceability(root, ac_ids, covered, tickets):
    slug = os.path.basename(os.path.abspath(root))
    out = [
        "<!-- GENERATED by scripts/uow_graph.py — do not edit by hand -->",
        "",
        f"# Traceability — {slug}",
        "",
        "| AC | Covered by | UoW | Status |",
        "|----|-----------|-----|--------|",
    ]
    for ac in ac_ids:
        tids = covered.get(ac, [])
        if not tids:
            out.append(f"| {ac} | **UNCOVERED** | — | ⚠️ |")
            continue
        uow_set = sorted({tickets[t].get("uow", "?") for t in tids})
        all_done = all(tickets[t].get("status") == "done" for t in tids)
        out.append(
            f"| {ac} | {', '.join(tids)} | {', '.join(uow_set)} | {'done' if all_done else 'open'} |"
        )
    uncovered = [ac for ac in ac_ids if ac not in covered]
    out += ["", f"Coverage: **{len(ac_ids) - len(uncovered)}/{len(ac_ids)}** acceptance criteria."]
    if uncovered:
        out.append("")
        out.append("Uncovered: " + ", ".join(uncovered) + " — add a ticket, or drop the AC explicitly.")
    return "\n".join(out) + "\n"


def yaml_list(values, indent):
    if not values:
        return " []"
    pad = " " * indent
    return "\n" + "\n".join(f"{pad}- {v}" for v in values)


def render_registry(root, uows, tickets, waves, path, path_hours, open_blocking):
    slug = os.path.basename(os.path.abspath(root))
    total = sum(parse_estimate(t.get("estimate")) or 0 for t in tickets.values())
    out = [
        "# GENERATED by scripts/uow_graph.py — do not edit by hand",
        f"feature: {slug}",
        f"units_of_work: {len(uows)}",
        f"tickets: {len(tickets)}",
        f"total_effort_hours: {total:g}",
        f"critical_path_hours: {path_hours:g}",
        f"critical_path:{yaml_list(path, 2)}",
        f"blocking_assumptions_open: {open_blocking if open_blocking is not None else 'unknown'}",
        "waves:",
    ]
    for i, wave in enumerate(waves, 1):
        out.append(f"  - wave: W{i}")
        out.append(f"    tickets:{yaml_list(wave, 6)}")
    out.append("uow:")
    for uid in sorted(uows):
        u = uows[uid]
        out += [
            f"  - id: {uid}",
            f"    title: {u.get('title', '')!r}",
            f"    status: {u.get('status', 'todo')}",
            f"    risk: {u.get('risk', 'unknown')}",
            f"    depends_on:{yaml_list(as_list(u.get('depends_on')), 6)}",
            f"    verifies:{yaml_list(as_list(u.get('verifies')), 6)}",
        ]
    out.append("ticket:")
    for tid in sorted(tickets):
        t = tickets[tid]
        out += [
            f"  - id: {tid}",
            f"    uow: {t.get('uow', '')}",
            f"    title: {t.get('title', '')!r}",
            f"    layer: {t.get('layer', '')}",
            f"    type: {t.get('type', '')}",
            f"    estimate_hours: {parse_estimate(t.get('estimate')) or 0:g}",
            f"    status: {t.get('status', 'todo')}",
            f"    depends_on:{yaml_list(as_list(t.get('depends_on')), 6)}",
            f"    blocks:{yaml_list(as_list(t.get('blocks')), 6)}",
            f"    verifies:{yaml_list(as_list(t.get('verifies')), 6)}",
            f"    touches:{yaml_list(as_list(t.get('touches')), 6)}",
        ]
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #


def main():
    ap = argparse.ArgumentParser(description="Validate and generate an AI-DLC ticket graph.")
    ap.add_argument("feature_dir", help="path to .ai/features/<slug>")
    ap.add_argument("--write", action="store_true", help="write generated artifacts")
    ap.add_argument("--ready", action="store_true", help="list tickets ready to pick up now")
    ap.add_argument("--version", action="version",
                    version=f"uow_graph {__version__} (ruleset {RULESET})")
    ap.add_argument("--parallel", action="store_true",
                    help="report write-conflict hazards between unordered tickets")
    args = ap.parse_args()

    root = args.feature_dir
    if not os.path.isdir(root):
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 2

    uows, tickets, errors, warnings = load_plan(root)
    warnings = check_ruleset(root) + warnings
    ac_ids, covered = validate(root, uows, tickets, errors, warnings)

    waves, cycle = topological_waves(tickets)
    if cycle:
        errors.append("dependency cycle involving: " + ", ".join(cycle))

    path, path_hours = ([], 0) if cycle else critical_path(tickets)
    open_blocking = count_open_blocking_assumptions(os.path.join(root, "01-assumptions.md"))

    if args.parallel:
        hazards = write_conflicts(tickets)
        if hazards:
            print("Write-conflict hazards (unordered pairs writing a shared path):")
            for a, b, paths in hazards:
                print(f"  {a} || {b}")
                for pth in paths:
                    print(f"       {pth}")
        else:
            print("No write-conflict hazards: shared paths are all ordered by dependencies.")
        print()

    if args.ready:
        ready = ready_tickets(tickets)
        print("Ready now:" if ready else "Nothing ready — every todo ticket is blocked.")
        for tid in ready:
            t = tickets[tid]
            print(f"  {tid}  [{t.get('layer')}] {t.get('title', '')}  ({t.get('estimate')})")
        print()

    if open_blocking:
        warnings.append(
            f"{open_blocking} blocking assumption(s) still pending — gate G1 is not passed, "
            "construction should not start"
        )

    for w in warnings:
        print(f"warn:  {w}")
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)

    print(
        f"\n{len(uows)} UoW · {len(tickets)} tickets · "
        f"{fmt_hours(sum(parse_estimate(t.get('estimate')) or 0 for t in tickets.values()))} total · "
        f"critical path {fmt_hours(path_hours)} · "
        f"AC coverage {len(ac_ids) - len([a for a in ac_ids if a not in covered])}/{len(ac_ids)}"
    )

    if errors:
        print(f"\n{len(errors)} error(s) — not writing artifacts.", file=sys.stderr)
        return 1

    if args.write:
        pairs = [
            ("05-ticket-graph.md", render_graph_doc(root, uows, tickets, waves, path, path_hours)),
            ("06-traceability.md", render_traceability(root, ac_ids, covered, tickets)),
            ("registry.yaml", render_registry(root, uows, tickets, waves, path, path_hours, open_blocking)),
        ]
        for name, content in pairs:
            with open(os.path.join(root, name), "w", encoding="utf-8") as fh:
                fh.write(content)
            print(f"wrote {os.path.join(root, name)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
