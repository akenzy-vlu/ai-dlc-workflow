#!/usr/bin/env python3
"""PreToolUse: refuse commands that destroy work, and edits that corrupt the AI-DLC record.

Two rule classes, and they are here together on purpose.

The first is ordinary destruction — `rm -rf /`, a force push over `main`, piping a download
into a shell. Nothing about it is specific to this methodology.

The second is what makes this the *AI-DLC* guard rather than a generic one. CLAUDE.md already
states these rules in prose: never hand-edit the three generated files, never set
`current_gate` directly, `history.jsonl` is append-only, `verified_by` is a human's signature.
Prose is exactly the enforcement this project was built on the premise of not trusting — an
agent reads "do not hand-edit `.aidlc-state.yaml`", agrees sincerely, and then hand-edits it
when a gate check is in the way, because that reasoning is locally plausible every time. So
these move from prose to a program that refuses.

Reads one hook event on stdin, prints at most one decision, always exits 0.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rules  # noqa: E402

# ---------------------------------------------------------------------------
# Class 1 — generic destruction
# ---------------------------------------------------------------------------

#: Targets that make an `rm -rf` unrecoverable rather than merely annoying. `.` and `*` are in
#: here because an agent that mistakes its cwd wipes the repo with them just as thoroughly as
#: with `/`, and the correct command is always the explicit one.
CATASTROPHIC_RM = {
    "/", "/*", "~", "~/", "~/*", "$HOME", "${HOME}", "$HOME/", "$HOME/*",
    ".", "./", "./*", "..", "../", "../*", "*",
}

#: One level under root. `rm -rf /usr` is not meaningfully safer than `rm -rf /`.
SYSTEM_ROOTS = {
    "/usr", "/etc", "/var", "/bin", "/sbin", "/lib", "/opt", "/boot", "/dev",
    "/System", "/Library", "/Applications", "/home", "/Users", "/root", "/private",
}

FORK_BOMB = re.compile(r":\s*\(\s*\)\s*\{[^}]*\|[^}]*&[^}]*\}\s*;?\s*:")
PIPE_TO_SHELL = re.compile(
    r"\b(?:curl|wget|fetch)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|k|da)?sh\b|"
    r"\b(?:curl|wget|fetch)\b[^|]*\|\s*(?:sudo\s+)?python[23]?\b"
)
PROTECTED_BRANCHES = ("main", "master", "trunk", "release")


def _expanded(word):
    return os.path.expandvars(word).rstrip()


def check_rm(argv, segment):
    short, long_flags = rules.flags_of(argv)
    recursive = "r" in short or "R" in short or "recursive" in long_flags
    force = "f" in short or "force" in long_flags
    if not (recursive and force):
        return None
    home = os.path.expanduser("~").rstrip("/")
    for target in rules.operands(argv):
        # Both spellings have to be tested: `$HOME` matches the literal set, and its
        # expansion matches `home`. Checking only the expanded form silently let `rm -rf
        # $HOME` through, which is how this comment came to exist.
        for candidate in (target.rstrip(), _expanded(target)):
            stripped = candidate.rstrip("/") or "/"
            if candidate in CATASTROPHIC_RM or stripped in SYSTEM_ROOTS or stripped == home:
                return (
                    "block-dangerous/rm-rf-root",
                    f"`{segment.strip()}` would recursively delete `{target}`. Name the "
                    f"specific directory you mean — a wrong cwd makes `.`, `*` and `~` as "
                    f"final as `/`.",
                )
    return None


def check_sudo_rm(segment):
    parsed = rules.tokens(segment)
    if not parsed or os.path.basename(parsed[0]) not in {"sudo", "doas"}:
        return None
    rest = [word for word in parsed[1:] if not word.startswith("-")]
    if rest and os.path.basename(rest[0]) == "rm":
        return (
            "block-dangerous/sudo-rm",
            "`sudo rm` deletes outside the workspace and outside anything git can restore. "
            "Run the deletion without sudo, or do it yourself if it really needs root.",
        )
    return None


def check_git(argv, segment):
    short, long_flags = rules.flags_of(argv)
    subcommand = next((word for word in argv[1:] if not word.startswith("-")), "")

    if subcommand == "push":
        forced = "f" in short or "force" in long_flags
        if forced and "force-with-lease" not in long_flags:
            refs = [word for word in rules.operands(argv)[1:]]
            targets = " ".join(refs)
            if not refs:
                return (
                    "block-dangerous/git-force-push",
                    "a force push with no branch named goes wherever the current branch "
                    "tracks, which may be a protected one. Name the remote and branch "
                    "explicitly, and prefer `--force-with-lease`.",
                )
            if any(branch in targets for branch in PROTECTED_BRANCHES):
                return (
                    "block-dangerous/git-force-push",
                    f"force-pushing over `{targets}` discards commits nobody can recover from "
                    f"a local clone. Open a pull request, or use `--force-with-lease` on a "
                    f"branch that is yours.",
                )

    if subcommand == "clean":
        force = "f" in short or "force" in long_flags
        ignored = "x" in short or "X" in short
        if force and ignored:
            return (
                "block-dangerous/git-clean-ignored",
                "`git clean` with -x deletes ignored files too — which here means `.env`, "
                "`.ai/credentials.env` and `.ai/.auth/`, none of which are in git. Drop -x, "
                "or delete the specific paths.",
            )
    return None


def check_devices(program, argv, segment):
    if program == "dd":
        for word in argv[1:]:
            if word.startswith("of=/dev/") and not word.startswith("of=/dev/null"):
                return (
                    "block-dangerous/dd-to-device",
                    f"`{word}` writes raw bytes to a device node. There is no undo.",
                )
    if program.startswith("mkfs"):
        return ("block-dangerous/mkfs", f"`{segment.strip()}` formats a filesystem.")
    if program == "chmod":
        short, long_flags = rules.flags_of(argv)
        if "R" in short or "recursive" in long_flags:
            args = rules.operands(argv)
            if any(mode in args for mode in ("777", "0777", "a+rwx")):
                for target in args:
                    stripped = _expanded(target).rstrip("/") or "/"
                    if stripped in SYSTEM_ROOTS or stripped in {"/", os.path.expanduser("~")}:
                        return (
                            "block-dangerous/chmod-world-writable",
                            f"recursively world-writable `{target}` is not repairable by "
                            f"re-running chmod — the original modes are gone.",
                        )
    return None


# ---------------------------------------------------------------------------
# Class 2 — AI-DLC controller integrity
# ---------------------------------------------------------------------------

#: The state view. Folded from `history.jsonl` by `fold_gate`; editing it makes the file and
#: the record disagree, and every gate is read from the file.
STATE_FILE = ".aidlc-state.yaml"

#: The append-only trail. `merge=union` in .gitattributes depends on nothing ever rewriting it.
HISTORY_FILE = "history.jsonl"

#: Regenerated from the tickets by `uowg --write`, specifically so they cannot drift from them.
GENERATED_DISTINCT = {"05-ticket-graph.md", "06-traceability.md"}

#: Generated too, but the name is common enough to need the `.ai/` qualifier before refusing.
GENERATED_QUALIFIED = {"registry.yaml"}

VERIFIED_BY = re.compile(r"^verified_by:[ \t]*\S", re.M)

REDIRECT_TRUNCATING = re.compile(r"(?<!>)>(?!>)\s*(\S+)")
REDIRECT_APPENDING = re.compile(r">>\s*(\S+)")
IN_PLACE_EDITORS = {"sed", "perl", "ruby", "gsed"}


def classify_protected(path, cwd):
    """Which controller file, if any, a path names."""
    _, absolute, base = rules.normalise(path, cwd)
    if base == STATE_FILE:
        return "state"
    if base == HISTORY_FILE:
        return "history"
    if base in GENERATED_DISTINCT:
        return "generated"
    if base in GENERATED_QUALIFIED and (f"{os.sep}.ai{os.sep}" in absolute or absolute.startswith(".ai/")):
        return "generated"
    return None


PROTECTED_REASONS = {
    "state": (
        "block-dangerous/aidlc-state-write",
        f"`{STATE_FILE}` is a view folded from `history.jsonl`, not a source of truth. Editing "
        f"it makes the file and the audit trail disagree, and it is the single move that turns "
        f"the gates into theatre. Use `aidlc pass/reopen`, or `aidlc reconcile` to rebuild it.",
    ),
    "history": (
        "block-dangerous/history-rewrite",
        f"`{HISTORY_FILE}` is append-only — it is the durable record of who approved what, and "
        f"its `merge=union` merge strategy assumes nothing ever rewrites it. Append an event "
        f"through an `aidlc` command instead.",
    ),
    "generated": (
        "block-dangerous/generated-artifact-write",
        "this file is regenerated from the tickets by `uowg <feature-dir> --write`, precisely so "
        "it cannot drift from them. Edit the ticket or `uow.md` and regenerate.",
    ),
}


def check_protected_paths(event, cwd, config):
    """Write/Edit against a controller file."""
    for path in rules.paths_of(event):
        kind = classify_protected(path, cwd)
        if kind is None:
            continue
        rule_id, reason = PROTECTED_REASONS[kind]
        if rules.rule_enabled(rule_id, config):
            return rule_id, f"{reason} (target: {path})"
    return None


def check_protected_bash(segment, program, argv, cwd, config):
    """The same files, reached through the shell instead of an editor tool."""
    suspects = []
    for match in REDIRECT_TRUNCATING.finditer(segment):
        suspects.append((match.group(1), "truncating redirect `>`"))
    if program in IN_PLACE_EDITORS:
        short, long_flags = rules.flags_of(argv)
        if "i" in short or "in-place" in long_flags:
            suspects.extend((word, f"in-place `{program} -i`") for word in rules.operands(argv))
    if program in {"truncate", "shred"}:
        suspects.extend((word, program) for word in rules.operands(argv))
    if program == "tee":
        _, long_flags = rules.flags_of(argv)
        if "append" not in long_flags and "a" not in rules.flags_of(argv)[0]:
            suspects.extend((word, "`tee` without --append") for word in rules.operands(argv))
    if program in {"rm", "mv"}:
        suspects.extend((word, program) for word in rules.operands(argv))

    for target, how in suspects:
        if not rules.path_like(target):
            continue
        kind = classify_protected(target, cwd)
        if kind is None:
            continue
        rule_id, reason = PROTECTED_REASONS[kind]
        if rules.rule_enabled(rule_id, config):
            return rule_id, f"{reason} (via {how} on `{target}`)"
    return None


def check_verified_by(event, cwd, config):
    """`verified_by:` is a human's signature on a discovery draft, not a field to fill in.

    `check_g0` reads it to decide whether the architecture map can be trusted (aidlc.py:611,
    734). Heuristics can guess a layer convention from filenames; they cannot tell a live
    convention from a legacy one, which is the entire reason the field exists.
    """
    rule_id = "block-dangerous/verified-by-write"
    if not rules.rule_enabled(rule_id, config):
        return None
    targets = [p for p in rules.paths_of(event) if rules.normalise(p, cwd)[2] == "architecture.md"]
    if not targets:
        return None
    if VERIFIED_BY.search(rules.written_content(event)):
        return (
            rule_id,
            "`verified_by:` in architecture.md is the human trust boundary for G0 — it says a "
            "person read the generated draft and vouched for it. Report what needs confirming "
            "and let a human write the line.",
        )
    return None


# ---------------------------------------------------------------------------


def main():
    event = rules.read_event()
    if event.get("hook_event_name") not in (None, rules.HOOK_EVENT):
        rules.allow()

    cwd = event.get("cwd") or os.getcwd()
    config = rules.load_config(cwd)
    tool = event.get("tool_name") or ""

    if tool in rules.FILE_WRITE_TOOLS:
        for finding in (check_protected_paths(event, cwd, config), check_verified_by(event, cwd, config)):
            if finding:
                rules.deny(*finding)
        rules.allow()

    command = rules.command_of(event)
    if not command:
        rules.allow()

    if rules.rule_enabled("block-dangerous/fork-bomb", config) and FORK_BOMB.search(command):
        rules.deny("block-dangerous/fork-bomb", "that is a fork bomb; it will hang the machine.")
    if rules.rule_enabled("block-dangerous/pipe-to-shell", config) and PIPE_TO_SHELL.search(command):
        rules.deny(
            "block-dangerous/pipe-to-shell",
            "piping a download straight into a shell runs code nobody has read, from a URL "
            "whose contents can change between the review and the run. Download it, read it, "
            "then run it.",
        )

    for segment in rules.segments(command):
        program, argv = rules.head_of(segment)
        if not program:
            continue

        finding = check_protected_bash(segment, program, argv, cwd, config)
        if finding:
            rules.deny(*finding)

        if program == "rm" and rules.rule_enabled("block-dangerous/rm-rf-root", config):
            finding = check_rm(argv, segment)
            if finding:
                rules.deny(*finding)
        if rules.rule_enabled("block-dangerous/sudo-rm", config):
            finding = check_sudo_rm(segment)
            if finding:
                rules.deny(*finding)
        if program == "git":
            finding = check_git(argv, segment)
            if finding and rules.rule_enabled(finding[0], config):
                rules.deny(*finding)
        finding = check_devices(program, argv, segment)
        if finding and rules.rule_enabled(finding[0], config):
            rules.deny(*finding)

    rules.allow()


if __name__ == "__main__":
    rules.guard(main)
