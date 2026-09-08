#!/usr/bin/env python3
"""PreToolUse: keep credentials out of the transcript, out of the repo, and out of git.

Four coverages, because a secret leaks through whichever one you leave open:

1. **Bash command strings** — an inline `export API_KEY=…` or `-H "Authorization: Bearer …"`
   is in the transcript the moment the tool call is made, whether or not it succeeds.
2. **Write/Edit content** — a key written to a file is a key that gets committed later by
   somebody who never saw it go in.
3. **Reading secret files** — `Read` on `.ai/credentials.env` pulls the credential into the
   context window, where it survives in the session record. CLAUDE.md calls this file out by
   name precisely because a `.env*` gitignore pattern does not match it.
4. **git add / commit / push** — the last chance to stop a secret before it is public, and
   the only one that is irreversible if missed.

Detection is heuristic, so the escape hatch is real: `.claude/aidlc-hooks.json` carries
`allow_paths`, `allow_patterns` and `disabled_rules`, and templates (`*.example`, `*.sample`)
are allowed by default because this repo commits `.env.example`.

Reads one hook event on stdin, prints at most one decision, always exits 0.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rules  # noqa: E402

# ---------------------------------------------------------------------------
# What counts as a secret file
# ---------------------------------------------------------------------------

SECRET_PATHS = [
    ".env",
    ".env.*",
    "*/.env",
    "*/.env.*",
    "credentials.env",
    "*/credentials.env",
    ".ai/.auth/**",
    "*/.ai/.auth/**",
    ".auth/**",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.jks",
    "*.keystore",
    "id_rsa*",
    "id_dsa*",
    "id_ecdsa*",
    "id_ed25519*",
    ".netrc",
    "_netrc",
    "credentials",          # ~/.aws/credentials, matched on basename
    "*.kdbx",
    "service-account*.json",
    "*serviceaccount*.json",
]

#: Commands whose whole purpose is to put a file's bytes in front of the model.
FILE_DUMPERS = {
    "cat", "bat", "less", "more", "head", "tail", "xxd", "od", "strings",
    "nl", "tac", "view", "open", "pbcopy",
}

# ---------------------------------------------------------------------------
# What counts as a secret value
# ---------------------------------------------------------------------------

#: Vendor-specific shapes. These are near-zero-false-positive: nothing else looks like them.
HIGH_CONFIDENCE = [
    ("anthropic api key", re.compile(r"sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_\-]{24,}")),
    ("openai-style api key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b")),
    ("aws access key id", re.compile(r"\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b")),
    ("github token", re.compile(r"\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}\b")),
    ("github fine-grained token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{50,}\b")),
    ("gitlab token", re.compile(r"\bglpat-[A-Za-z0-9_\-]{20,}\b")),
    ("slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{10,}\b")),
    ("google api key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
    ("stripe secret key", re.compile(r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b")),
    ("private key block", re.compile(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----")),
    ("npm token", re.compile(r"\bnpm_[A-Za-z0-9]{36}\b")),
    ("credentialed url", re.compile(r"\b[a-z][a-z0-9+.\-]*://[^\s:/@]+:[^\s/@]{8,}@[^\s/]+")),
]

#: The shape-based catch-all. This one produces false positives, so every hit is filtered
#: through `is_placeholder` before it can deny.
ASSIGNMENT = re.compile(
    r"""(?ix)
    \b (?P<name> [A-Za-z0-9_.\-]* (?: api[_\-]?key | secret | passwd | password | token
                                    | access[_\-]?key | private[_\-]?key | auth[_\-]?token
                                    | client[_\-]?secret | credential ) [A-Za-z0-9_.\-]* )
    \s* [:=] \s*
    (?P<quote>["']) (?P<value> [^"'\n]{12,}) (?P=quote)
    """
)

#: Bash-only shapes: unquoted env assignment and an auth header.
BASH_ASSIGNMENT = re.compile(
    r"""(?ix)
    \b (?:export \s+)?
    (?P<name> [A-Za-z0-9_]* (?: API[_]?KEY | SECRET | PASSWORD | PASSWD | TOKEN
                              | ACCESS[_]?KEY | CLIENT[_]?SECRET | CREDENTIAL ) [A-Za-z0-9_]* )
    = (?P<value> (?: "[^"\n]{8,}" | '[^'\n]{8,}' | [^\s;|&<>]{8,} ))
    """
)
AUTH_HEADER = re.compile(
    r"""(?ix) (?:Authorization|X-Api-Key|X-Auth-Token) \s* :\s*
        (?:Bearer\s+|Basic\s+|Token\s+)? (?P<value>[A-Za-z0-9._\-+/=]{16,})"""
)
PASSWORD_FLAG = re.compile(r"(?i)--(?:password|token|api-key|secret)[= ](?P<value>[^\s;|&]{8,})")


# ---------------------------------------------------------------------------


def secret_path(path, cwd, config):
    """A path that holds credentials — unless the allowlist says it is a template."""
    if rules.path_allowed(path, config, cwd):
        return False
    return rules.matches_any(path, SECRET_PATHS, cwd)


def scan_text(text, config):
    """The first credential in a blob, or None."""
    if not text or rules.text_allowed(text, config):
        return None
    for label, pattern in HIGH_CONFIDENCE:
        match = pattern.search(text)
        if match and not rules.is_placeholder(match.group(0)):
            return label, match.group(0)
    match = ASSIGNMENT.search(text)
    if match and not rules.is_placeholder(match.group("value")):
        return f"hardcoded {match.group('name')}", match.group("value")
    return None


def redact(value):
    """Never echo the secret back — the denial reason is itself transcript."""
    value = value.strip().strip("\"'")
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}…{value[-2:]} ({len(value)} chars)"


# ---------------------------------------------------------------------------
# The four coverages
# ---------------------------------------------------------------------------


def check_read(event, cwd, config):
    """Coverage 3a — the Read tool aimed at a credential file."""
    rule_id = "no-secrets/secret-file-read"
    if not rules.rule_enabled(rule_id, config):
        return None
    for path in rules.paths_of(event):
        if secret_path(path, cwd, config):
            return (
                rule_id,
                f"`{path}` holds credentials. Reading it copies them into the transcript, "
                f"where they outlive the session. Read the schema in "
                f"`references/config-schema.md` instead, or ask which key you need. Add the "
                f"path to `allow_paths` in `.claude/aidlc-hooks.json` if it is a template.",
            )
    return None


def check_write(event, cwd, config):
    """Coverages 2 — a credential about to be written to disk."""
    rule_id = "no-secrets/secret-in-content"
    if not rules.rule_enabled(rule_id, config):
        return None
    targets = rules.paths_of(event)
    # Two exemptions, for opposite reasons. A template (`*.example`) is allowlisted because
    # its "secrets" are illustrations. A credential file (`.env`, `.ai/credentials.env`) is
    # exempt because it is the designated home for the real thing — refusing a write there
    # would push credentials into source, which is the leak this rule exists to prevent. The
    # protection those files get is on the *read* side, and on git.
    if targets and all(
        rules.path_allowed(path, config, cwd) or rules.matches_any(path, SECRET_PATHS, cwd)
        for path in targets
    ):
        return None
    found = scan_text(rules.written_content(event), config)
    if found:
        label, value = found
        where = targets[0] if targets else "this file"
        return (
            rule_id,
            f"that write puts what looks like a real {label} — {redact(value)} — into "
            f"`{where}`. Read it from the environment or from `.ai/credentials.env` at runtime. "
            f"If it is a fixture, use an obvious placeholder, or add an `allow_patterns` entry "
            f"to `.claude/aidlc-hooks.json`.",
        )
    return None


def check_bash_secrets(command, config):
    """Coverage 1 — a credential typed into the command line itself."""
    rule_id = "no-secrets/secret-in-command"
    if not rules.rule_enabled(rule_id, config) or rules.text_allowed(command, config):
        return None

    found = scan_text(command, config)
    if found:
        label, value = found
        return rule_id, f"that command carries what looks like a real {label} — {redact(value)}."

    for pattern, label in (
        (BASH_ASSIGNMENT, "credential assignment"),
        (AUTH_HEADER, "authorization header"),
        (PASSWORD_FLAG, "credential flag"),
    ):
        match = pattern.search(command)
        if match and not rules.is_placeholder(match.group("value")):
            return (
                rule_id,
                f"that command has an inline {label} ({redact(match.group('value'))}). "
                f"A tool call is recorded whether or not it succeeds. Source "
                f"`.ai/credentials.env` or reference `$VAR` instead of pasting the value.",
            )
    return None


def check_bash_read(segment, program, argv, cwd, config):
    """Coverage 3b — the same file, dumped through the shell instead of Read."""
    rule_id = "no-secrets/secret-file-read"
    if not rules.rule_enabled(rule_id, config) or program not in FILE_DUMPERS:
        return None
    for target in rules.operands(argv):
        if rules.path_like(target) and secret_path(target, cwd, config):
            return (
                rule_id,
                f"`{program} {target}` prints credentials into the transcript. Whatever you "
                f"need to know about that file, ask for the key name rather than its value.",
            )
    return None


def check_git(segment, argv, cwd, config):
    """Coverage 4 — the last point at which a leak is still reversible."""
    subcommand = next((word for word in argv[1:] if not word.startswith("-")), "")

    if subcommand == "add" and rules.rule_enabled("no-secrets/git-add-secret", config):
        for target in rules.operands(argv)[1:]:
            if rules.path_like(target) and secret_path(target, cwd, config):
                return (
                    "no-secrets/git-add-secret",
                    f"`{target}` holds credentials and must not be staged. It should be "
                    f"gitignored — check with `git check-ignore -v {target}`; note that a "
                    f"`.env*` pattern does not match `.ai/credentials.env`.",
                )

    if subcommand == "commit" and rules.rule_enabled("no-secrets/git-commit-secret", config):
        staged = rules.git_paths(["diff", "--cached", "--name-only"], cwd)
        leaking = [path for path in staged if secret_path(path, cwd, config)]
        if leaking:
            return (
                "no-secrets/git-commit-secret",
                f"the staged changes include credential files: {', '.join(leaking[:5])}. "
                f"Unstage them (`git restore --staged <path>`) and gitignore them before "
                f"committing.",
            )

    if subcommand == "push" and rules.rule_enabled("no-secrets/git-push-secret", config):
        unpushed = rules.git_paths(["log", "@{u}..HEAD", "--name-only", "--pretty=format:"], cwd)
        leaking = sorted({path for path in unpushed if secret_path(path, cwd, config)})
        if leaking:
            return (
                "no-secrets/git-push-secret",
                f"commits about to be pushed touch credential files: {', '.join(leaking[:5])}. "
                f"Once pushed, treat those credentials as compromised — rotate them rather "
                f"than only rewriting history.",
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

    if tool in rules.FILE_READ_TOOLS:
        finding = check_read(event, cwd, config)
        if finding:
            rules.deny(*finding)
        rules.allow()

    if tool in rules.FILE_WRITE_TOOLS:
        finding = check_write(event, cwd, config)
        if finding:
            rules.deny(*finding)
        rules.allow()

    command = rules.command_of(event)
    if not command:
        rules.allow()

    finding = check_bash_secrets(command, config)
    if finding:
        rules.deny(*finding)

    for segment in rules.segments(command):
        program, argv = rules.head_of(segment)
        if not program:
            continue
        finding = check_bash_read(segment, program, argv, cwd, config)
        if finding:
            rules.deny(*finding)
        if program == "git":
            finding = check_git(segment, argv, cwd, config)
            if finding:
                rules.deny(*finding)

    rules.allow()


if __name__ == "__main__":
    rules.guard(main)
