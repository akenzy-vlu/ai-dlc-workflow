#!/usr/bin/env python3
"""Shared machinery for the AI-DLC PreToolUse hooks.

The controller pattern, applied one level down. `aidlc.py` refuses to advance a gate whose
preconditions are unmet; these hooks refuse the tool calls that would corrupt the record the
gates are computed from, or leak the credentials a verification run needs.

Two properties are load-bearing and every change here has to preserve them:

- **A hook never exits non-zero.** A matched rule denies by *printing* a decision; an internal
  error allows and prints a `systemMessage`. This is the same argument as `verify.py`'s
  `skipped` rung: a guard that fails loudly on ordinary work gets switched off, and a
  switched-off guard is worse than an absent one. `guard()` is what enforces it.
- **Denials are specific.** A refusal names its rule id and says what to do instead, because
  the alternative is an agent that retries the same command three different ways.

Stdlib only, like everything else under `skills/`.
"""

import fnmatch
import json
import os
import re
import shlex
import subprocess
import sys

__version__ = "0.1.0"

# ---------------------------------------------------------------------------
# The hook wire protocol
# ---------------------------------------------------------------------------

HOOK_EVENT = "PreToolUse"

#: Tools whose input names a file we may have to inspect.
FILE_WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
FILE_READ_TOOLS = {"Read", "NotebookRead"}


def read_event():
    """The one JSON object Claude Code writes to our stdin."""
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def deny(rule_id, reason):
    """Refuse the tool call. Prints the decision and exits 0 — never non-zero."""
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": HOOK_EVENT,
            "permissionDecision": "deny",
            "permissionDecisionReason": f"{rule_id}: {reason}",
        }
    }))
    sys.exit(0)


def allow():
    """Say nothing. Silence is consent for a PreToolUse hook."""
    sys.exit(0)


def note(message):
    """Surface a problem with the hook itself without blocking the tool call."""
    print(json.dumps({"systemMessage": message}))
    sys.exit(0)


def guard(main):
    """Run `main`, converting any failure into an allow.

    A traceback on stderr with a non-zero exit would read as a blocked tool call for reasons
    nobody can act on. Allowing and saying so is the honest failure.
    """
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - deliberately total
        note(f"ai-dlc hook {os.path.basename(sys.argv[0])} failed open: {exc.__class__.__name__}: {exc}")
    sys.exit(0)


# ---------------------------------------------------------------------------
# Reading the tool input
# ---------------------------------------------------------------------------


def tool_input(event):
    value = event.get("tool_input")
    return value if isinstance(value, dict) else {}


def command_of(event):
    """The shell command, for Bash calls. Empty string for anything else."""
    if event.get("tool_name") != "Bash":
        return ""
    return str(tool_input(event).get("command") or "")


def paths_of(event):
    """Every file path this tool call names, tool-shape by tool-shape."""
    data = tool_input(event)
    found = []
    for key in ("file_path", "path", "notebook_path", "filePath"):
        value = data.get(key)
        if isinstance(value, str) and value:
            found.append(value)
    edits = data.get("edits")
    if isinstance(edits, list):
        for edit in edits:
            if isinstance(edit, dict):
                value = edit.get("file_path")
                if isinstance(value, str) and value:
                    found.append(value)
    return found


def written_content(event):
    """Everything this call would put on disk, concatenated.

    Write carries `content`; Edit carries `new_string`; MultiEdit carries a list of them;
    NotebookEdit carries `new_source`. Reading only the first shape is how a scanner ends up
    passing a MultiEdit that a Write of the same bytes would have been refused for.
    """
    data = tool_input(event)
    parts = []
    for key in ("content", "new_string", "new_source"):
        value = data.get(key)
        if isinstance(value, str):
            parts.append(value)
    edits = data.get("edits")
    if isinstance(edits, list):
        for edit in edits:
            if isinstance(edit, dict):
                for key in ("new_string", "new_source", "content"):
                    value = edit.get(key)
                    if isinstance(value, str):
                        parts.append(value)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Shell parsing
# ---------------------------------------------------------------------------

#: `rtk` (https://github.com/rtk-ai/rtk) is a token-filtering CLI proxy. Every one of its
#: subcommands either *is* another program (`rtk git push` runs git) or *wraps* one
#: (`rtk proxy rm -rf /` runs rm). Every rule in this package dispatches on the program name,
#: so an unstripped `rtk` prefix reports program `rtk`, matches nothing, and silently disables
#: the guard for exactly the commands it exists to catch.
RTK = "rtk"

#: Subcommands whose remaining argv *is* another command. `proxy`/`run` forward it verbatim;
#: `err`/`test`/`summary` filter the output but still execute the command underneath.
RTK_WRAPPERS = {"proxy", "run", "err", "test", "summary"}

#: Subcommands that stand in for a named program, mapped to the binary whose rules apply.
#: `rtk read` prints a file, so it is a file dumper exactly as `cat` is.
RTK_ALIASES = {
    "git": "git",
    "gh": "gh",
    "grep": "grep",
    "find": "find",
    "ls": "ls",
    "tree": "tree",
    "diff": "diff",
    "wc": "wc",
    "curl": "curl",
    "wget": "wget",
    "docker": "docker",
    "kubectl": "kubectl",
    "aws": "aws",
    "psql": "psql",
    "npm": "npm",
    "npx": "npx",
    "pnpm": "pnpm",
    "cargo": "cargo",
    "dotnet": "dotnet",
    "read": "cat",
    "json": "cat",
    "log": "cat",
}

#: How deep `rtk run -c '...'` nesting is followed before giving up. A hook the user waits on
#: must terminate; three levels is far past anything a real command line does.
RTK_NEST_CEILING = 3

#: Separators that start a new command within one Bash invocation.
_SEGMENT_SPLIT = re.compile(r"(?:\|\||&&|[;|\n])")


def segments(command, _depth=0):
    """Split a command line into the individual commands it runs.

    `cd /tmp && rm -rf /` is one Bash tool call and two commands; a scanner that only looks at
    the first token of the whole string sees `cd` and waves it through.

    `rtk run -c 'rm -rf /'` is the same problem one level down: the command is a single argv
    word, so no amount of prefix-stripping in `head_of` reaches it. The inner string is
    scanned as well as, not instead of, the segment that carries it.
    """
    parts = [part.strip() for part in _SEGMENT_SPLIT.split(command) if part.strip()]
    if _depth >= RTK_NEST_CEILING:
        return parts
    expanded = []
    for part in parts:
        expanded.append(part)
        inner = rtk_command_string(part)
        if inner:
            expanded.extend(segments(inner, _depth + 1))
    return expanded


def rtk_command_string(segment):
    """The shell string inside `rtk run -c '<command>'`, which `sh -c` runs verbatim."""
    parsed = tokens(segment)
    if not parsed or os.path.basename(parsed[0]) != RTK:
        return ""
    for position, word in enumerate(parsed[1:], start=1):
        if word in {"-c", "--command"}:
            return parsed[position + 1] if position + 1 < len(parsed) else ""
        if word.startswith("--command="):
            return word.split("=", 1)[1]
        if word.startswith("-c") and len(word) > 2 and not word.startswith("--"):
            return word[2:]
    return ""


def tokens(segment):
    """shlex where it works, whitespace where it does not.

    An unbalanced quote raises in shlex, and a command we cannot parse is exactly the one a
    guard should still look at — so fall back rather than give up.
    """
    try:
        return shlex.split(segment, posix=True)
    except ValueError:
        return segment.split()


def rtk_step(parsed, index):
    """Resolve one `rtk` prefix at `index`.

    Returns `(alias, next_index)` — `alias` empty for a wrapper, whose inner command is
    parsed by continuing the walk — or `None` when the subcommand is rtk's own (`rtk gain`)
    and there is no underlying program to police.
    """
    cursor = index + 1
    while cursor < len(parsed) and parsed[cursor].startswith("-"):
        cursor += 1  # rtk's own flags, before the subcommand: `rtk -v git push`
    if cursor >= len(parsed):
        return None
    subcommand = parsed[cursor]
    if subcommand in RTK_WRAPPERS:
        return "", cursor + 1
    if subcommand in RTK_ALIASES:
        return RTK_ALIASES[subcommand], cursor + 1
    return None


def head_of(segment):
    """The program a segment invokes, with `sudo`/`env`/`command`/`rtk` prefixes stripped."""
    parsed = tokens(segment)
    index = 0
    while index < len(parsed):
        word = os.path.basename(parsed[index])
        if word in {"sudo", "doas", "env", "command", "nohup", "time", "xargs"}:
            index += 1
            continue
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", parsed[index]):
            index += 1  # VAR=value prefix, at any depth: `FOO=1 BAR=2 rm -rf /`
            continue
        if word == RTK:
            step = rtk_step(parsed, index)
            if step is None:
                return word, parsed[index:]  # rtk's own command: `rtk gain`, `rtk config`
            alias, index = step
            if alias:
                # Report the underlying binary, so every existing rule matches unchanged.
                return alias, [alias, *parsed[index:]]
            continue
        return word, parsed[index:]
    return "", []


def flags_of(argv):
    """Every short flag letter and long flag name in an argv, flattened.

    `-rf`, `-r -f` and `--recursive --force` all have to compare equal, or a rule written for
    one spelling is bypassed by another.
    """
    short = set()
    long_flags = set()
    for word in argv:
        if word == "--":
            break
        if word.startswith("--"):
            long_flags.add(word[2:].split("=", 1)[0])
        elif word.startswith("-") and len(word) > 1:
            short.update(word[1:])
    return short, long_flags


def operands(argv):
    """The non-flag arguments after the program name."""
    return [word for word in argv[1:] if not word.startswith("-")]


# ---------------------------------------------------------------------------
# Path handling
# ---------------------------------------------------------------------------


def normalise(path, cwd):
    """A path as written, plus its absolute form and its basename.

    Rules match against all three: `.env` and `/repo/.env` and `../secrets/.env` are the same
    file, and a pattern list that only sees one spelling misses the other two.
    """
    raw = os.path.expandvars(os.path.expanduser(str(path)))
    absolute = raw if os.path.isabs(raw) else os.path.normpath(os.path.join(cwd or os.getcwd(), raw))
    return raw, absolute, os.path.basename(absolute.rstrip("/"))


def matches_any(path, patterns, cwd=""):
    """True when a path matches a glob, tested against every spelling of it."""
    raw, absolute, base = normalise(path, cwd)
    candidates = {raw, absolute, base, raw.lstrip("./")}
    for pattern in patterns:
        for candidate in candidates:
            if fnmatch.fnmatch(candidate, pattern):
                return True
        # A `dir/**` pattern should also catch `dir/` itself and anything under it.
        if pattern.endswith("/**"):
            stem = pattern[:-3]
            for candidate in candidates:
                if candidate == stem or candidate.startswith(stem + "/") or f"/{stem}/" in candidate:
                    return True
        elif "/" in pattern and pattern in absolute:
            return True
    return False


def path_like(word):
    """Whether a bare shell token plausibly names a file rather than a flag or a URL."""
    if not word or word.startswith("-"):
        return False
    return "://" not in word


# ---------------------------------------------------------------------------
# Configuration — the escape hatch
# ---------------------------------------------------------------------------

CONFIG_FILENAME = os.path.join(".claude", "aidlc-hooks.json")

#: Paths that never carry a live credential, however much they look like they do. Committed
#: templates are the whole reason this list exists: `.env.example` is in this repo, and
#: `login-recipes.md` documents credential shapes on purpose.
DEFAULT_ALLOW_PATHS = [
    "*.example",
    "*.sample",
    "*.template",
    "*.dist",
    ".env.example",
    ".env.sample",
    ".env.template",
    "*/references/login-recipes.md",
    "*/references/config-schema.md",
]

#: Values that match a secret's *shape* but are obviously a stand-in.
#:
#: Split in two on purpose. A run of dashes is a placeholder only when it is the *whole*
#: value — as a prefix it also matches `-----BEGIN RSA PRIVATE KEY-----`, which is the single
#: least ambiguous secret there is. Filler and separators go in EXACT, real stand-in syntax
#: (`${VAR}`, `<put-key-here>`, `your-token`) goes in PREFIX.
PLACEHOLDER_EXACT = re.compile(
    r"(?i)^(?:x{3,}|\.{3,}|-{3,}|\*{3,}|_{3,}|"
    r"none|null|nil|undefined|todo|tbd|test|fake|foo|bar|baz|"
    r"example|sample|dummy|placeholder|redacted|secret|password|changeme)$"
)
PLACEHOLDER_PREFIX = re.compile(
    r"(?i)^(?:<[^>]*>|\$\{?[a-z_][a-z0-9_]*\}?|x{3,}|"
    r"(?:your|my|the|some|a|an)[-_ ]|change[-_ ]?me|replace[-_ ]?me|put[-_ ]|"
    r"placeholder|redacted|insert[-_ ]|"
    r"process\.env|os\.environ|import\.meta\.env|System\.getenv)"
)


def load_config(cwd):
    """Per-project overrides, merged onto the defaults.

    Missing, unreadable or malformed all mean "use the defaults". A guard that refuses to run
    because its own optional config has a trailing comma is a guard that gets deleted.
    """
    config = {
        "allow_paths": list(DEFAULT_ALLOW_PATHS),
        "allow_patterns": [],
        "disabled_rules": [],
    }
    if os.environ.get("AIDLC_HOOKS_OFF"):
        config["disabled_rules"] = ["*"]
        return config
    path = os.path.join(cwd or os.getcwd(), CONFIG_FILENAME)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            loaded = json.load(handle)
    except (OSError, ValueError):
        return config
    if not isinstance(loaded, dict):
        return config
    for key in ("allow_paths", "allow_patterns", "disabled_rules"):
        value = loaded.get(key)
        if isinstance(value, list):
            entries = [str(item) for item in value]
            config[key] = config[key] + entries if key == "allow_paths" else entries
    return config


def rule_enabled(rule_id, config):
    disabled = config.get("disabled_rules") or []
    return "*" not in disabled and rule_id not in disabled


def path_allowed(path, config, cwd=""):
    return matches_any(path, config.get("allow_paths") or [], cwd)


def text_allowed(text, config):
    for pattern in config.get("allow_patterns") or []:
        try:
            if re.search(pattern, text):
                return True
        except re.error:
            continue
    return False


def is_placeholder(value):
    stripped = value.strip().strip("\"'")
    if not stripped:
        return True
    return bool(PLACEHOLDER_EXACT.match(stripped) or PLACEHOLDER_PREFIX.match(stripped))


# ---------------------------------------------------------------------------
# Bounded git queries
# ---------------------------------------------------------------------------

GIT_TIMEOUT_SECONDS = 3
GIT_PATH_CEILING = 4000


def git_paths(argv, cwd):
    """Run a read-only git query and return the paths it names.

    Bounded three ways — a timeout, a path ceiling, and a total fail-open on any error —
    because this runs inside a PreToolUse hook that the user is waiting on. A slow guard is
    a guard that gets disabled, which is the failure this whole package is built to avoid.
    """
    try:
        result = subprocess.run(
            ["git", *argv],
            cwd=cwd or os.getcwd(),
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if result.returncode != 0:
        return []
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return lines[:GIT_PATH_CEILING]
