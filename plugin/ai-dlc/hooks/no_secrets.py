#!/usr/bin/env python3
"""PreToolUse: keep credentials out of the transcript, out of the repo, and out of git.

Six coverages, because a secret leaks through whichever one you leave open:

1. **Bash command strings** — an inline `export API_KEY=…` or `-H "Authorization: Bearer …"`
   is in the transcript the moment the tool call is made, whether or not it succeeds.
2. **Write/Edit content** — a key written to a file is a key that gets committed later by
   somebody who never saw it go in.
3. **Reading secret files** — `Read` on `.ai/credentials.env` pulls the credential into the
   context window, where it survives in the session record. CLAUDE.md calls this file out by
   name precisely because a `.env*` gitignore pattern does not match it.
4. **git add / commit / push** — the last chance to stop a secret before it is public, and
   the only one that is irreversible if missed.
5. **Sending the file somewhere else** — `curl -d @.env`, `scp .env host:`, `cp .env /tmp/x`.
   The bytes never enter the transcript and never enter git, so coverages 3 and 4 both miss
   them; an upload is as irreversible as a push, and a copy defeats every rule downstream by
   moving the credential to a path none of them recognise.
6. **Asking a tool to print a live credential** — `gcloud auth print-access-token`,
   `kubectl get secret -o yaml`, bare `env`. No secret *file* is involved at all: the value
   comes from a keychain, a cloud API or the process environment, and lands in the transcript
   exactly as if it had been `cat`ed.

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

#: Commands whose whole purpose is to put a file's bytes in front of the model. Re-encoding
#: counts: `base64 .env` and `jq . service-account.json` print the same credential as `cat`.
FILE_DUMPERS = {
    "cat", "bat", "less", "more", "head", "tail", "xxd", "od", "strings",
    "nl", "tac", "view", "open", "pbcopy",
    "base64", "jq", "yq", "hexdump", "plutil", "unzip",
}

#: Programs that put a local file on a remote host.
NETWORK_UPLOADERS = {"curl", "wget", "httpie", "http", "scp", "rsync", "sftp", "nc", "ncat"}

#: The subset whose bare operands are themselves paths — `scp <local> host:<remote>`.
FILE_TRANSFER = {"scp", "rsync", "sftp"}

#: Flags that name a file whose contents become the request body.
UPLOAD_FLAGS = {
    "-T", "--upload-file", "-d", "--data", "--data-binary", "--data-raw", "--data-ascii",
    "--data-urlencode", "-F", "--form", "--post-file", "--body-file",
}

#: `-d @file`, `-F field=@file` — curl's "read this part from a file".
ATTACHMENT = re.compile(r"@([^\s;|&'\"@]+)")

#: Programs that copy a file to a second path, where the other rules no longer recognise it.
COPIERS = {"cp", "mv", "install", "ditto"}

#: Commands that print a live credential without touching a file the path rules can see.
#: Each is matched against the argv after the program name, so flag order does not matter.
CREDENTIAL_COMMANDS = [
    ("gcloud", re.compile(r"\bauth\b.*\bprint-(?:access|identity)-token\b")),
    ("aws", re.compile(r"\bconfigure\s+get\b.*(?:secret|session[_-]?token)")),
    ("aws", re.compile(r"\bsecretsmanager\s+get-secret-value\b")),
    ("aws", re.compile(r"\bsts\s+get-session-token\b")),
    ("kubectl", re.compile(r"\bget\s+secrets?\b.*(?:-o|--output)[= ]\s*(?:yaml|json|jsonpath)")),
    ("kubectl", re.compile(r"\bdescribe\s+secrets?\b")),
    ("op", re.compile(r"^(?:read|item\s+get)\b")),
    ("vault", re.compile(r"^(?:read|kv\s+get)\b")),
    ("security", re.compile(r"\bfind-(?:generic|internet)-password\b")),
    ("heroku", re.compile(r"^config(?::get)?\b")),
    ("doppler", re.compile(r"^secrets\b(?!.*--only-names)")),
    ("gh", re.compile(r"\bauth\s+token\b")),
    ("git", re.compile(r"\bcredential\s+fill\b")),
]

#: Whole-environment dumps, and the variable names worth refusing one by one.
ENV_DUMPERS = {"printenv", "env"}
SECRET_VAR = re.compile(
    r"(?i)(?:API[_-]?KEY|SECRET|PASSWORD|PASSWD|TOKEN|ACCESS[_-]?KEY"
    r"|CLIENT[_-]?SECRET|CREDENTIAL|PRIVATE[_-]?KEY)"
)

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


def upload_targets(program, argv):
    """Local files a network command would send."""
    targets = []
    for index, word in enumerate(argv[1:], start=1):
        if word.startswith(("--post-file=", "--upload-file=", "--body-file=")):
            targets.append(word.split("=", 1)[1])
        elif word.startswith("-"):
            if word in UPLOAD_FLAGS and index + 1 < len(argv):
                following = argv[index + 1]
                targets.extend(ATTACHMENT.findall(following) or [following])
        elif "@" in word:
            targets.extend(ATTACHMENT.findall(word))
        elif program in FILE_TRANSFER and ":" not in word:
            targets.append(word)
    return [target for target in targets if target and "://" not in target]


def check_upload(program, argv, cwd, config):
    """Coverage 5a — a credential file leaving the machine.

    This is the other irreversible one. `git push` at least leaves the secret somewhere the
    team controls; an upload hands it to whoever owns the URL, and no history rewrite reaches
    it. Rotation is the only remedy, which is what the reason has to say.
    """
    rule_id = "no-secrets/secret-upload"
    if not rules.rule_enabled(rule_id, config) or program not in NETWORK_UPLOADERS:
        return None
    for target in upload_targets(program, argv):
        if rules.path_like(target) and secret_path(target, cwd, config):
            return (
                rule_id,
                f"that command sends `{target}` — a credential file — to a remote host. An "
                f"upload cannot be recalled: if it has already happened, rotate the "
                f"credentials rather than deleting anything. Send the values the endpoint "
                f"actually needs, read from the environment at call time.",
            )
    return None


def check_copy(program, argv, cwd, config):
    """Coverage 5b — a credential moved to a path the other rules do not know about.

    `cp .ai/credentials.env /tmp/x` defeats every rule in this file at once: the copy is not a
    secret path, so it can then be read, written, staged and pushed freely. Copying to another
    secret path (`.env` → `.env.bak`) is ordinary housekeeping and stays allowed.
    """
    rule_id = "no-secrets/secret-copy"
    if not rules.rule_enabled(rule_id, config) or program not in COPIERS:
        return None
    operands = [word for word in rules.operands(argv) if rules.path_like(word)]
    if len(operands) < 2:
        return None
    destination = operands[-1]
    if secret_path(destination, cwd, config):
        return None
    for source in operands[:-1]:
        if secret_path(source, cwd, config):
            return (
                rule_id,
                f"copying `{source}` to `{destination}` moves credentials to a path none of "
                f"these rules recognise, so nothing downstream will stop it being read, "
                f"committed or pushed. Keep credentials in `.ai/credentials.env` and read "
                f"them from there.",
            )
    return None


def check_credential_command(program, argv, config):
    """Coverage 6a — a tool asked to print a live credential."""
    rule_id = "no-secrets/credential-command"
    if not rules.rule_enabled(rule_id, config):
        return None
    rest = " ".join(argv[1:])
    for name, pattern in CREDENTIAL_COMMANDS:
        if program == name and pattern.search(rest):
            return (
                rule_id,
                f"`{program} {rest.strip()}` prints a live credential, and its output goes "
                f"into the transcript exactly as `cat`ing a key file would. If something "
                f"needs that value, let it read it at runtime; if you need to know it "
                f"exists, check the name rather than the value.",
            )
    return None


def check_env_dump(segment, command, config):
    """Coverage 6b — the process environment, printed.

    A bare `env` is refused only when it is the whole command. `env | grep -v TOKEN` sends the
    dump to another program rather than to the transcript, and refusing that would be the kind
    of false positive that gets the hook switched off.
    """
    rule_id = "no-secrets/env-dump"
    if not rules.rule_enabled(rule_id, config):
        return None
    parsed = rules.tokens(segment)
    if not parsed:
        return None
    program = os.path.basename(parsed[0])
    operands = [word for word in parsed[1:] if not word.startswith("-")]

    if program in ENV_DUMPERS and not operands and segment.strip() == command.strip():
        return (
            rule_id,
            f"`{program}` with no arguments prints every environment variable, including "
            f"every key that happens to be exported, into the transcript. Name the one you "
            f"need — `printenv PATH` — or pipe it somewhere that is not the transcript.",
        )
    if program == "printenv":
        for name in operands:
            if SECRET_VAR.search(name):
                return (
                    rule_id,
                    f"`printenv {name}` prints that credential's value into the transcript. "
                    f"Whatever needs it should read it from the environment itself.",
                )
    if program == "export" and not operands and "-p" in parsed[1:]:
        return (rule_id, "`export -p` prints every exported variable, credentials included.")
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
        finding = check_env_dump(segment, command, config)
        if finding:
            rules.deny(*finding)

        program, argv = rules.head_of(segment)
        if not program:
            continue
        finding = check_bash_read(segment, program, argv, cwd, config)
        if finding:
            rules.deny(*finding)

        finding = check_upload(program, argv, cwd, config)
        if finding:
            rules.deny(*finding)

        finding = check_copy(program, argv, cwd, config)
        if finding:
            rules.deny(*finding)

        finding = check_credential_command(program, argv, config)
        if finding:
            rules.deny(*finding)

        if program == "git":
            finding = check_git(segment, argv, cwd, config)
            if finding:
                rules.deny(*finding)

    rules.allow()


if __name__ == "__main__":
    rules.guard(main)
