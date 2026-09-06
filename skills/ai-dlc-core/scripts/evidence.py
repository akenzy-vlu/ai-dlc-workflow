#!/usr/bin/env python3
"""
evidence.py — run one verification command and report what happened.

This module decides nothing. It does not know what a gate is, which environments matter,
or whether a failure should block anything; it runs a command and describes the result.
`aidlc.py` does the deciding, the same way `verify.py` decides and `runner/run.py` only
drives a browser in the companion package.

Keeping execution here rather than in `aidlc.py` means the one genuinely risky thing this
tooling does — running a command named in a repo's config file — lives in a file small
enough to read in one sitting.

Stdlib only, and `run()` never raises: an unstartable command is a verdict, not a crash.
"""

import hashlib
import os
import signal
import subprocess
import time

__version__ = "0.1.0"

DEFAULT_TIMEOUT = 600
DEFAULT_CEILING = 8192
NOT_FOUND_EXIT = 127          # what a shell returns for a command it cannot find


def _summarise(raw, output_ceiling):
    """
    A digest of everything, and a tail bounded by the ceiling.

    The pair is the point: the record stays small enough to commit, and still says
    something checkable about output nobody kept. A tail alone would be unverifiable,
    and the full output would put an unbounded blob — and any secret a failing test
    printed — into a file that is usually committed.
    """
    return {
        "digest": "sha256:" + hashlib.sha256(raw).hexdigest(),
        "tail": raw[-output_ceiling:].decode("utf-8", "replace"),
        "output_bytes": len(raw),
        "truncated": len(raw) > output_ceiling,
    }


def _kill_group(proc):
    """
    Kill the whole process group, not just the child.

    A test runner spawns workers. Killing the shell leaves them holding the ports and the
    database, and the next run fails for a reason that has nothing to do with the code.
    """
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        proc.kill()


def run(command, timeout=DEFAULT_TIMEOUT, output_ceiling=DEFAULT_CEILING):
    """
    Run `command` through a shell and return a plain dict describing the run.

    Keys: `exit`, `digest`, `tail`, `output_bytes`, `truncated`, `duration_ms`, `error`.

    Four outcomes, none of which may be mistaken for another:

    * exit 0 ....................... passed
    * exit non-zero ................ failed; `error` is None
    * exit 127 ..................... failed to start; `error` names it
    * exit None + `error` .......... never ran, or was killed on timeout

    A caller that only looks at `exit == 0` is still correct. That is deliberate.
    """
    started = time.monotonic()

    def elapsed():
        return int((time.monotonic() - started) * 1000)

    try:
        # start_new_session gives the child its own process group, which is what makes
        # the timeout path able to take the workers down with it.
        proc = subprocess.Popen(
            command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    except (OSError, ValueError) as exc:
        return {"exit": None, "digest": None, "tail": "", "output_bytes": 0,
                "truncated": False, "duration_ms": elapsed(),
                "error": f"could not start the command: {exc}"}

    try:
        raw, _ = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _kill_group(proc)
        raw, _ = proc.communicate()
        result = _summarise(raw or b"", output_ceiling)
        result.update({"exit": None, "duration_ms": elapsed(),
                       "error": f"timed out after {timeout}s and was killed"})
        return result

    result = _summarise(raw or b"", output_ceiling)
    result.update({"exit": proc.returncode, "duration_ms": elapsed(), "error": None})
    if proc.returncode == NOT_FOUND_EXIT:
        result["error"] = "command not found (exit 127) — the run never started"
    return result


def passed(result):
    """One place that decides what a passing run looks like, so callers cannot disagree."""
    return bool(result) and result.get("exit") == 0
