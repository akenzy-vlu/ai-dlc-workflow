#!/usr/bin/env python3
"""
project_registry.py — project AI-DLC plan files into a queryable read model.

The files in .ai/features/ are the write model: versioned with the code, reviewed in
pull requests, and the thing the gate controller enforces against. This script builds a
**derived** read model from them, for questions no single file can answer — portfolio
status across repos, every pending blocking assumption in one list, what is pickable
anywhere right now.

The read model is disposable by design. Drop the database, re-scan, and it is identical.
That property is what stops it quietly becoming the source of truth: nothing is ever
written here that does not exist in a file first.

    project_registry.py --db plans.db --scan <repo>[:<label>] [<repo>:<label> ...]
    project_registry.py --db plans.db --report

Stdlib only.
"""

import argparse
import datetime
import glob
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys

SCHEMA = """
DROP TABLE IF EXISTS feature;
DROP TABLE IF EXISTS uow;
DROP TABLE IF EXISTS ticket;
DROP TABLE IF EXISTS assumption;
DROP TABLE IF EXISTS coverage;
-- deliberately NOT dropped: gate_event, snapshot_log

CREATE TABLE feature (
  repo TEXT, slug TEXT, profile TEXT, gate TEXT,
  uow_count INT, ticket_count INT, tickets_done INT,
  effort_hours REAL, critical_path_hours REAL,
  blocking_open INT, ac_total INT, ac_uncovered INT,
  commit_sha TEXT, head_sha TEXT, synced_at TEXT,
  PRIMARY KEY (repo, slug)
);
CREATE TABLE uow (
  repo TEXT, feature TEXT, id TEXT, title TEXT, status TEXT, risk TEXT,
  depends_on TEXT, PRIMARY KEY (repo, feature, id)
);
CREATE TABLE ticket (
  repo TEXT, feature TEXT, id TEXT, uow TEXT, title TEXT, layer TEXT, type TEXT,
  estimate_hours REAL, status TEXT, depends_on TEXT, unmet_deps INT,
  -- folded from the trail by flow.py; NULL means unmeasurable, never zero
  cycle_hours REAL, review_hours REAL, blocked_hours REAL, aging_hours REAL,
  block_reason TEXT,
  PRIMARY KEY (repo, feature, id)
);
CREATE TABLE assumption (
  repo TEXT, feature TEXT, id TEXT, blocking INT, status TEXT,
  blast TEXT, resolution TEXT, PRIMARY KEY (repo, feature, id)
);
CREATE TABLE IF NOT EXISTS gate_event (
  -- APPEND-ONLY. Every other table is rebuilt from snapshots on each ingest; this one
  -- accumulates, because when .ai/ is not committed to git the snapshot stream is the
  -- only durable record of who approved what. Deduplicated on the natural key.
  repo TEXT, feature TEXT, at TEXT, gate TEXT, action TEXT, actor TEXT,
  ticket TEXT, reason TEXT,
  PRIMARY KEY (repo, feature, at, action, ticket)
);
CREATE TABLE IF NOT EXISTS snapshot_log (
  repo TEXT, feature TEXT, captured_at TEXT, content_hash TEXT,
  host TEXT, git_sha TEXT, git_branch TEXT, tracked INT, dirty INT,
  PRIMARY KEY (repo, feature, content_hash)
);
CREATE TABLE coverage (
  repo TEXT, feature TEXT, ac TEXT, ticket_ids TEXT, covered INT,
  PRIMARY KEY (repo, feature, ac)
);
"""


def read_text(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def parse_registry(path):
    """Parse the registry.yaml dialect emitted by uow_graph.py."""
    data = {"waves": [], "uow": [], "ticket": [], "critical_path": []}
    section = None
    item = None
    list_key = None

    for raw in read_text(path).splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip())
        line = raw.strip()

        if indent == 0 and line.endswith(":") and line[:-1] in {"waves", "uow", "ticket", "critical_path"}:
            section, item, list_key = line[:-1], None, None
            continue
        if indent == 0 and ":" in line:
            key, _, value = line.partition(":")
            section, item, list_key = None, None, None
            data[key.strip()] = value.strip()
            continue

        if line.startswith("- ") and indent == 2:
            body = line[2:]
            if section == "critical_path":
                data["critical_path"].append(body.strip())
                continue
            item = {}
            data.setdefault(section, []).append(item)
            if ":" in body:
                k, _, v = body.partition(":")
                item[k.strip()] = v.strip().strip("'\"")
            list_key = None
            continue

        if line.startswith("- ") and indent >= 6 and item is not None and list_key:
            item.setdefault(list_key, []).append(line[2:].strip().strip("'\""))
            continue

        if item is not None and ":" in line:
            k, _, v = line.partition(":")
            k, v = k.strip(), v.strip()
            if v in ("", "[]"):
                item[k] = []
                list_key = k
            else:
                item[k] = v.strip("'\"")
                list_key = None
    return data


def parse_state(path):
    state = {}
    for raw in read_text(path).splitlines():
        if raw.startswith(" ") or ":" not in raw or raw.startswith("#"):
            continue
        key, _, value = raw.partition(":")
        state[key.strip()] = value.strip()
    return state


def parse_assumptions(path):
    rows = []
    for line in read_text(path).splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 7 or not re.match(r"(?i)a-\d+", cells[0]):
            continue
        rows.append({
            "id": cells[0], "text": cells[1],
            "blocking": 1 if cells[3].lower() in {"yes", "true"} else 0,
            "blast": cells[4], "status": cells[5].lower(),
            "resolution": cells[6].strip(" —-"),
        })
    return rows


def parse_coverage(path):
    rows = []
    for line in read_text(path).splitlines():
        if not line.lstrip().startswith("| AC-"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        covered = 0 if "UNCOVERED" in cells[1].upper() else 1
        rows.append({"ac": cells[0], "tickets": cells[1] if covered else "", "covered": covered})
    return rows


def git_head(repo):
    try:
        out = subprocess.run(["git", "-C", repo, "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() if out.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


# --------------------------------------------------------------------------- #


def load_sibling(name):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    sys.dont_write_bytecode = True
    try:
        return __import__(name)
    except ImportError:
        return None


def load_uow_graph():
    return load_sibling("uow_graph")


def read_trail(feature_dir):
    """The raw trail. One bad line costs one event, never the file."""
    entries = []
    for line in read_text(os.path.join(feature_dir, "history.jsonl")).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict):
            entries.append(entry)
    return entries


def load_flow(feature_dir, tickets, G):
    """
    Per-ticket flow, imported from `flow.py` rather than recomputed here.

    Two implementations of one number are two numbers, and the one in the portfolio report
    would be the one nobody notices has drifted.
    """
    fl = load_sibling("flow")
    if fl is None:
        return {}, {}
    entries = read_trail(feature_dir)
    estimates = {t: G.parse_estimate(m.get("estimate")) for t, m in tickets.items()}
    rows = {r["ticket"]: r for r in fl.feature_rows(entries, estimates)}
    reasons = {}
    for entry in entries:                       # why a blocked ticket is blocked
        if entry.get("action") == "ticket blocked" and entry.get("ticket"):
            reasons[entry["ticket"]] = entry.get("reason", "")
        elif entry.get("action") == "ticket unblocked" and entry.get("ticket"):
            reasons.pop(entry["ticket"], None)
    return rows, reasons


def build_snapshot(feature_dir, repo_path, label):
    """Build a snapshot payload from the plan files in a checkout.

    Reads the hand-written tickets rather than the generated registry.yaml, so a repo that
    gitignores its generated artifacts — the usual way to keep parallel agents from
    fighting over them — still reports correctly. Same shape as `aidlc snapshot`, so both
    paths land in the database through one code path.
    """
    G = load_uow_graph()
    uows, tickets, _, _ = G.load_plan(feature_dir)
    state = parse_state(os.path.join(feature_dir, ".aidlc-state.yaml"))
    _, crit_hours = G.critical_path(tickets)
    slug = state.get("slug") or os.path.basename(feature_dir)

    def lst(v):
        return G.as_list(v)

    status_of = {t: m.get("status", "todo") for t, m in tickets.items()}
    flow_rows, block_reasons = load_flow(feature_dir, tickets, G)
    return {
        "schema": 1,
        "source": {"host": "collector", "repo_path": os.path.abspath(repo_path),
                   "repo_label": label},
        "git": git_meta(repo_path),
        "feature": {"slug": slug, "profile": state.get("profile", "none"),
                    "gate": state.get("current_gate", "none"),
                    "created": state.get("created", "")},
        "totals": {"critical_path_hours": crit_hours},
        "uow": [{"id": u.get("id"), "title": u.get("title", ""),
                 "status": u.get("status", "todo"), "risk": u.get("risk", ""),
                 "depends_on": lst(u.get("depends_on")),
                 "verifies": lst(u.get("verifies"))}
                for u in sorted(uows.values(), key=lambda x: x.get("id", ""))],
        "ticket": [{"id": t.get("id"), "uow": t.get("uow", ""),
                    "title": t.get("title", ""), "layer": t.get("layer", ""),
                    "type": t.get("type", ""), "estimate": t.get("estimate", ""),
                    "status": t.get("status", "todo"),
                    "depends_on": lst(t.get("depends_on")),
                    "unmet_deps": sum(1 for d in lst(t.get("depends_on"))
                                      if status_of.get(d) != "done"),
                    "verifies": lst(t.get("verifies")),
                    "touches": lst(t.get("touches")),
                    "flow": flow_rows.get(t.get("id"), {}),
                    "block_reason": block_reasons.get(t.get("id"), "")}
                   for t in sorted(tickets.values(), key=lambda x: x.get("id", ""))],
        "assumption": parse_assumptions(os.path.join(feature_dir, "01-assumptions.md")),
        "history": [],          # the state file's own trail; git history is the record here
        "captured_at": datetime.datetime.now().replace(microsecond=0).isoformat(),
        "content_hash": "",
    }


def git_meta(repo):
    def run(*cmd):
        try:
            out = subprocess.run(["git", "-C", repo, *cmd],
                                 capture_output=True, text=True, timeout=5)
            return out.stdout.strip() if out.returncode == 0 else ""
        except (OSError, subprocess.SubprocessError):
            return ""
    sha = run("rev-parse", "--short", "HEAD")
    return {"sha": sha, "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
            "tracked": bool(sha) and bool(run("ls-files", ".ai")),
            "dirty": bool(run("status", "--porcelain", ".ai"))}


def scan(conn, repo_path, label):
    """Scan a checkout. Requires no generated artifacts to be committed."""
    found = 0
    for feature_dir in sorted(glob.glob(os.path.join(repo_path, ".ai", "features", "*"))):
        if not os.path.isdir(feature_dir):
            continue
        if not os.path.isdir(os.path.join(feature_dir, "04-units-of-work")) \
                and not os.path.isfile(os.path.join(feature_dir, ".aidlc-state.yaml")):
            continue
        snap = build_snapshot(feature_dir, repo_path, label)
        canonical = json.dumps({k: v for k, v in snap.items()
                                if k not in ("captured_at", "content_hash")},
                               sort_keys=True, separators=(",", ":"))
        snap["content_hash"] = hashlib.sha256(canonical.encode()).hexdigest()[:16]
        ingest_snapshot(conn, snap)
        found += 1
    conn.commit()
    return found


def ingest_dir(conn, inbox):
    """Ingest a directory of snapshots. Transport-agnostic: rsync, HTTP drop, shared folder."""
    count = 0
    for path in sorted(glob.glob(os.path.join(inbox, "*.json"))):
        try:
            with open(path, encoding="utf-8") as fh:
                snap = json.load(fh)
        except (OSError, ValueError) as exc:
            print(f"skipped {os.path.basename(path)}: {exc}")
            continue
        if snap.get("schema") != 1:
            print(f"skipped {os.path.basename(path)}: unsupported schema {snap.get('schema')}")
            continue
        ingest_snapshot(conn, snap)
        count += 1
    conn.commit()
    return count


def ingest_snapshot(conn, snap):
    src, git = snap.get("source", {}), snap.get("git", {})
    feat = snap.get("feature", {})
    repo, slug = src.get("repo_label", "?"), feat.get("slug", "?")
    tickets = snap.get("ticket", [])
    assumptions = snap.get("assumption", [])
    done = sum(1 for t in tickets if t.get("status") == "done")

    def hours(v):
        m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*([hmd]?)\s*", str(v or ""), re.I)
        if not m:
            return 0.0
        amt, unit = float(m.group(1)), m.group(2).lower()
        return {"m": amt / 60, "d": amt * 8}.get(unit, amt)

    effort = sum(hours(t.get("estimate")) for t in tickets)
    covered = {}
    for t in tickets:
        for ac in t.get("verifies", []):
            covered.setdefault(ac, []).append(t.get("id"))

    conn.execute("INSERT OR REPLACE INTO feature VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
        repo, slug, feat.get("profile", "none"), feat.get("gate", "none"),
        len(snap.get("uow", [])), len(tickets), done, effort,
        float(snap.get("totals", {}).get("critical_path_hours", 0) or 0),
        sum(1 for a in assumptions if a.get("blocking") and a.get("status") == "pending"),
        len(covered), 0, git.get("sha", ""), git.get("sha", ""),
        snap.get("captured_at", ""),
    ))
    for u in snap.get("uow", []):
        conn.execute("INSERT OR REPLACE INTO uow VALUES (?,?,?,?,?,?,?)", (
            repo, slug, u.get("id"), u.get("title", ""), u.get("status", "todo"),
            u.get("risk", ""), ",".join(u.get("depends_on", [])),
        ))
    for t in tickets:
        # A snapshot shipped by an older tool carries no `flow`. It ingests as NULLs
        # rather than being refused — the registry's job is to accept what repos send.
        f = t.get("flow") or {}
        conn.execute("INSERT OR REPLACE INTO ticket VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            repo, slug, t.get("id"), t.get("uow", ""), t.get("title", ""),
            t.get("layer", ""), t.get("type", ""), hours(t.get("estimate")),
            t.get("status", "todo"), ",".join(t.get("depends_on", [])),
            t.get("unmet_deps", 0),
            f.get("cycle_hours"), f.get("review_hours"), f.get("blocked_hours"),
            f.get("aging_hours"), t.get("block_reason", ""),
        ))
    for a in assumptions:
        conn.execute("INSERT OR REPLACE INTO assumption VALUES (?,?,?,?,?,?,?)", (
            repo, slug, a.get("id"), 1 if a.get("blocking") else 0,
            a.get("status", ""), a.get("blast", ""), a.get("resolution", ""),
        ))
    for ac, tids in covered.items():
        conn.execute("INSERT OR REPLACE INTO coverage VALUES (?,?,?,?,?)", (
            repo, slug, ac, ",".join(tids), 1,
        ))
    # append-only
    for h in snap.get("history", []):
        conn.execute("INSERT OR IGNORE INTO gate_event VALUES (?,?,?,?,?,?,?,?)", (
            repo, slug, h.get("at", ""), h.get("gate", ""), h.get("action", ""),
            h.get("by", ""), h.get("ticket", ""), h.get("reason", ""),
        ))
    conn.execute("INSERT OR IGNORE INTO snapshot_log VALUES (?,?,?,?,?,?,?,?,?)", (
        repo, slug, snap.get("captured_at", ""), snap.get("content_hash", ""),
        src.get("host", ""), git.get("sha", ""), git.get("branch", ""),
        1 if git.get("tracked") else 0, 1 if git.get("dirty") else 0,
    ))


def report(conn):
    def show(title, sql, note=None):
        print(f"\n## {title}")
        if note:
            print(f"_{note}_")
        rows = conn.execute(sql).fetchall()
        if not rows:
            print("(none)")
            return
        cols = [d[0] for d in conn.execute(sql).description]
        render(cols, rows)

    def render(cols, rows):
        # `—`, never `None` and never `0`: an unmeasurable span that prints as a number
        # is the one mistake that makes every average below it wrong and confident.
        cells = [["—" if v is None else str(v) for v in r] for r in rows]
        widths = [max(len(str(c)), *(len(r[i]) for r in cells)) for i, c in enumerate(cols)]
        print("  ".join(c.ljust(widths[i]) for i, c in enumerate(cols)))
        print("  ".join("-" * w for w in widths))
        for r in cells:
            print("  ".join(v.ljust(widths[i]) for i, v in enumerate(r)))

    show("Portfolio", """
        SELECT repo, slug AS feature, gate,
               tickets_done || '/' || ticket_count AS tickets,
               ROUND(effort_hours/8.0, 1) || 'd' AS effort,
               ROUND(critical_path_hours/8.0, 1) || 'd' AS crit_path,
               blocking_open AS blocked_by,
               ac_uncovered AS ac_gap
        FROM feature ORDER BY repo, slug
    """, "One row per feature across every repo. No single file answers this.")

    show("Waiting on a human", """
        SELECT f.repo, f.slug AS feature, f.gate, a.id, a.blocking,
               substr(a.blast, 1, 44) AS blast_radius
        FROM assumption a JOIN feature f ON f.repo = a.repo AND f.slug = a.feature
        WHERE a.status = 'pending' AND a.blocking = 1
        ORDER BY f.repo, a.id
    """, "Every blocking assumption nobody has answered. This is the standup list.")

    show("Pickable right now, anywhere", """
        SELECT t.repo, t.feature, t.id, t.layer,
               substr(t.title, 1, 40) AS title,
               t.estimate_hours AS hrs
        FROM ticket t JOIN feature f ON f.repo = t.repo AND f.slug = t.feature
        WHERE t.status = 'todo' AND t.unmet_deps = 0 AND f.gate IN ('G3','G4')
        ORDER BY t.repo, t.id
    """, "Gate-aware: tickets in a feature below G3 are excluded, not merely deprioritised.")

    show("Risk concentration", """
        SELECT repo, feature, id, risk, status, substr(title, 1, 42) AS title
        FROM uow WHERE risk = 'high' AND status != 'done'
        ORDER BY repo, feature, id
    """, "High-risk slices not yet finished.")

    fl = load_sibling("flow")
    print("\n## Flow")
    print("_Folded from the trail — nobody typed any of it. Medians, not means: one ticket "
          "left open over a weekend should not redefine a team's cycle time. `measured` is "
          "the sample size — an unpairable span is unknown, never zero._")
    flow_rows = []
    for (repo,) in conn.execute("SELECT DISTINCT repo FROM ticket ORDER BY repo"):
        vals = conn.execute(
            "SELECT cycle_hours, review_hours, estimate_hours FROM ticket WHERE repo = ?",
            (repo,)).fetchall()
        cycles = [v[0] for v in vals if v[0] is not None]
        reviews = [v[1] for v in vals if v[1] is not None]
        paired = [(v[0], v[2]) for v in vals if v[0] is not None and v[2]]
        median = fl.median if fl else (lambda xs: round(sorted(xs)[len(xs) // 2], 2) if xs else None)
        flow_rows.append((
            repo, f"{len(cycles)}/{len(vals)}", median(cycles), median(reviews),
            round(sum(e for _, e in paired), 1) or None,
            round(sum(c for c, _ in paired), 1) or None,
            round(sum(c - e for c, e in paired), 1) if paired else None,
        ))
    if flow_rows:
        render(["repo", "measured", "median_cycle_h", "median_review_h",
                "estimated_h", "actual_h", "bias_h"], flow_rows)
    else:
        print("(none)")

    show("Stuck", """
        SELECT t.repo, t.feature, t.id, t.status,
               ROUND(COALESCE(t.aging_hours, t.blocked_hours), 1) AS waiting_h,
               substr(COALESCE(NULLIF(t.block_reason, ''), t.title), 1, 44) AS why
        FROM ticket t
        WHERE t.status = 'blocked' OR (t.status = 'in_progress' AND t.aging_hours > 48)
        ORDER BY waiting_h DESC
    """, "Blocked, or in progress for more than 48h. The cross-repo standup list.")

    show("Approval trail (append-only, survives a lost laptop)", """
        SELECT repo, feature, at, action, actor,
               COALESCE(NULLIF(ticket,''), '-') AS ticket
        FROM gate_event ORDER BY at DESC LIMIT 8
    """, "Accumulated across snapshots. This is the one table not rebuilt on ingest.")

    show("Provenance", """
        SELECT repo, feature, host,
               CASE WHEN tracked=1 THEN 'git' ELSE 'LOCAL ONLY' END AS storage,
               CASE WHEN dirty=1 THEN 'yes' ELSE 'no' END AS uncommitted,
               MAX(captured_at) AS last_snapshot
        FROM snapshot_log GROUP BY repo, feature ORDER BY repo
    """, "A feature marked LOCAL ONLY exists nowhere but one machine and this database.")

    show("Freshness", """
        SELECT repo, COUNT(*) AS features, MAX(synced_at) AS last_sync,
               MAX(commit_sha) AS at_commit
        FROM feature GROUP BY repo
    """, "A projection nobody can date is a projection people will over-trust.")


def main():
    ap = argparse.ArgumentParser(description="Project AI-DLC plans into a read model.")
    ap.add_argument("--db", default="plans.db")
    ap.add_argument("--scan", nargs="*", default=[], metavar="PATH[:LABEL]")
    ap.add_argument("--ingest", metavar="DIR", help="ingest a directory of snapshots")
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    fresh = bool(args.scan or args.ingest)
    conn = sqlite3.connect(args.db)
    if fresh:
        conn.executescript(SCHEMA)
    if args.ingest:
        n = ingest_dir(conn, args.ingest)
        print(f"ingested {n} snapshot(s) into {args.db}")
        print("plan tables rebuilt; gate_event and snapshot_log appended")
    if args.scan:
        total = 0
        for spec in args.scan:
            path, _, label = spec.partition(":")
            total += scan(conn, path, label or os.path.basename(os.path.abspath(path)))
        print(f"projected {total} feature(s) from {len(args.scan)} repo(s) into {args.db}")
        print("plan tables are disposable — drop them and re-scan for an identical result")
    if args.report:
        report(conn)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
