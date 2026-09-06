#!/usr/bin/env python3
"""
flow.py — turn the trail into how the work actually flowed.

Every number here comes from events the controller has been writing since the trail
existed: `history.jsonl` carries an actor and a microsecond timestamp for each
transition, and until now nothing folded them. There is no new field to fill in and no
extra step for anyone to forget, which is the only reason these numbers can be trusted —
data somebody has to remember to enter is data that stops arriving the week it matters.

Pure functions over a list of trail entries. No filesystem, no argparse, nothing stored:
a computed metric cannot disagree with the record, and `project_registry.py` imports this
module rather than reimplementing it, the way `aidlc.py` imports `uow_graph`.

Two rules run through all of it:

* **Unknown is not zero.** A ticket accepted with no start event, a plan that predates a
  transition, a span that cannot be paired — all report None. Zero would read as "instant"
  and quietly flatter every average built on top of it.
* **An open span measures to now.** A ticket in progress or blocked right now is still
  accruing, which is what makes aging visible while there is still time to act on it.
"""

import datetime

__version__ = "0.1.0"

START = "ticket in_progress"
SUBMIT = "ticket review"
REJECT = "ticket todo"
BLOCK = "ticket blocked"
UNBLOCK = "ticket unblocked"
DONE = ("ticket done", "ticket done (review bypassed)")
HOURS_PER_DAY = 8


def parse_time(entry):
    """`ts` when present — it has microseconds — else `at`, else None."""
    for key in ("ts", "at"):
        raw = entry.get(key)
        if not raw:
            continue
        try:
            return datetime.datetime.fromisoformat(raw)
        except (TypeError, ValueError):
            continue
    return None


def _hours(delta):
    return None if delta is None else round(delta.total_seconds() / 3600.0, 2)


def ticket_events(history, ticket):
    """This ticket's transitions, in trail order, each with a usable timestamp."""
    return [(parse_time(e), e.get("action", "")) for e in history
            if e.get("ticket") == ticket and parse_time(e) is not None]


def blocked_time(events, now):
    """
    (paired blocked duration, still-open-since) for one ticket.

    A ticket that was never blocked returns zero — that is a known zero, not an unknown.
    An unpaired block is still running, so the caller measures it to `now` unless the
    ticket has since finished, in which case the pairing is broken and the answer is
    unknown rather than invented.
    """
    total = datetime.timedelta(0)
    opened = None
    for when, action in events:
        if action == BLOCK:
            opened = when
        elif action == UNBLOCK and opened is not None:
            total += when - opened
            opened = None
    return total, opened


def ticket_row(history, ticket, estimate_hours=None, now=None):
    """One ticket's flow, entirely derived from the trail."""
    now = now or datetime.datetime.now()
    events = ticket_events(history, ticket)
    row = {"ticket": ticket, "status": "todo", "cycle_hours": None, "review_hours": None,
           "blocked_hours": None, "estimate_hours": estimate_hours, "bias_hours": None,
           "aging_hours": None, "unknown": []}
    if not events:
        row["unknown"].append("no transitions on the trail")
        return row

    started = next((w for w, a in events if a == START), None)
    finished = next((w for w, a in reversed(events) if a in DONE), None)
    # The submit that the acceptance actually followed, so a rejected-and-resubmitted
    # ticket measures the review that ended it rather than the one that sent it back.
    submitted = next((w for w, a in reversed(events)
                      if a == SUBMIT and (finished is None or w <= finished)), None)
    last_action = events[-1][1]
    row["status"] = {START: "in_progress", SUBMIT: "review", BLOCK: "blocked",
                     REJECT: "todo", UNBLOCK: "in_progress"}.get(last_action, "todo")
    if last_action in DONE:
        row["status"] = "done"

    paired, open_since = blocked_time(events, now)
    if open_since is not None and finished is not None:
        row["unknown"].append("a block was never closed, yet the ticket finished")
    else:
        if open_since is not None:
            paired += now - open_since
        row["blocked_hours"] = _hours(paired)

    if finished is not None and started is not None:
        row["cycle_hours"] = _hours(finished - started)
    elif finished is not None:
        row["unknown"].append("finished without a recorded start")
    elif started is not None:
        row["aging_hours"] = _hours(now - started)

    if finished is not None and submitted is not None:
        row["review_hours"] = _hours(finished - submitted)
    elif finished is not None:
        row["unknown"].append("finished without a recorded submit")

    if row["cycle_hours"] is not None and estimate_hours:
        row["bias_hours"] = round(row["cycle_hours"] - estimate_hours, 2)
    return row


def feature_rows(history, estimates=None, now=None):
    """One row per ticket that appears anywhere in the trail, plus any that do not."""
    estimates = estimates or {}
    seen = [e.get("ticket") for e in history if e.get("ticket")]
    tickets = sorted(set(seen) | set(estimates))
    return [ticket_row(history, t, estimates.get(t), now) for t in tickets]


def totals(rows):
    """
    Feature-level flow, carrying its own sample size.

    The unknown counts travel with the numbers on purpose: an average that hides how much
    it could not measure is exactly the kind of confident, wrong summary this methodology
    exists to keep out of a plan.
    """
    known = [r for r in rows if r["cycle_hours"] is not None]
    estimated = [r for r in known if r["estimate_hours"]]
    cycle = sorted(r["cycle_hours"] for r in known)
    review = sorted(r["review_hours"] for r in rows if r["review_hours"] is not None)
    blocked = [r["blocked_hours"] for r in rows if r["blocked_hours"]]
    return {
        "tickets": len(rows),
        "measured": len(known),
        "unknown": len(rows) - len(known),
        "median_cycle_hours": median(cycle),
        "median_review_hours": median(review),
        "blocked_hours": round(sum(blocked), 2) if blocked else 0.0,
        "estimate_hours": round(sum(r["estimate_hours"] for r in estimated), 2) or None,
        "actual_hours": round(sum(r["cycle_hours"] for r in estimated), 2) or None,
        "bias_hours": (round(sum(r["cycle_hours"] - r["estimate_hours"] for r in estimated), 2)
                       if estimated else None),
    }


def median(values):
    """Median, not mean: one ticket left open over a weekend should not redefine a team."""
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return round(ordered[mid], 2)
    return round((ordered[mid - 1] + ordered[mid]) / 2.0, 2)


def aging(rows, hours):
    """Tickets in progress longer than `hours` — the ones worth asking about today."""
    return [r for r in rows
            if r["status"] == "in_progress" and (r["aging_hours"] or 0) > hours]


def blocked(rows):
    return [r for r in rows if r["status"] == "blocked"]


def fmt_hours(value):
    """`—` for unknown, so an unmeasured span never reads as an instant one."""
    if value is None:
        return "—"
    if abs(value) >= HOURS_PER_DAY:
        return f"{value / HOURS_PER_DAY:+.1f}d" if value < 0 else f"{value / HOURS_PER_DAY:.1f}d"
    return f"{value:+.1f}h" if value < 0 else f"{value:.1f}h"
