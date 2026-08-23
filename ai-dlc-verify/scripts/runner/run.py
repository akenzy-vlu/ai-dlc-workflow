#!/usr/bin/env python3
"""
run.py — the browser half of ai-dlc-verify, and the only file in the package with a
dependency outside the standard library.

It is deliberately dumb. verify.py parses the config, resolves the ladder, reads the step
table and hands over a finished plan; this file drives Playwright and writes run.json. It
decides nothing about which environments matter or whether a gate may pass. Keeping the
judgement in stdlib-only Python is what lets a machine with no Playwright installed still
validate evidence somebody else produced.

    run.py --plan-stdin            run plan arrives on stdin (credentials never hit disk)
    run.py --plan <file>           run plan from a file (manual-login only: stdin is needed
                                   for the human's Enter, and that mode reads no credentials)

Exit 0 when the run completed and run.json was written — including when steps failed. A red
step is a result, not a crash. Exit 1 only when nothing could be produced.

Install:  pip install playwright && playwright install chromium
"""

import base64
import datetime
import hashlib
import hmac
import json
import os
import re
import struct
import sys
import time

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("runner: playwright is not installed for this interpreter — run:\n"
          f"  {sys.executable} -m pip install playwright\n"
          f"  {sys.executable} -m playwright install chromium",
          file=sys.stderr)
    sys.exit(1)

MOBILE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
             "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")

RECIPE_DEFAULTS = {
    "form": {
        "path": "/login",
        "selectors": {
            "user": "input[type=email], input[name=email], input[name=username], "
                    "input[name=identifier]",
            "password": "input[type=password]",
            "submit": "button[type=submit]",
        },
        "interactive_paths": ["/mfa", "/2fa", "/verify", "/onboarding", "/terms", "/consent"],
    },
    "clerk-hosted": {
        "path": "/sign-in",
        "selectors": {
            "user": "input[name=identifier]",
            "submit": 'button:has-text("Continue")',
            "password": "input[name=password]",
            "password_submit": 'button:has-text("Continue")',
            "totp": "input[name=code]",
        },
        "interactive_paths": ["/factor-one", "/factor-two", "/verify", "/sso-callback",
                              "/continue", "/reset-password"],
    },
    "storage-state": {"path": "", "selectors": {}, "interactive_paths": []},
    "none": {"path": "", "selectors": {}, "interactive_paths": []},
}


def human_ms(ms):
    return f"{ms}ms" if ms < 1000 else f"{ms / 1000:.1f}s"


def log(message):
    print(message, file=sys.stderr, flush=True)


def short(error):
    return str(getattr(error, "message", error)).split("\n")[0][:160]


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()


def auth_of(env):
    defaults = RECIPE_DEFAULTS.get(env.get("recipe"), RECIPE_DEFAULTS["none"])
    auth = env.get("auth") or {}
    merged = dict(defaults)
    merged.update(auth)
    merged["selectors"] = {**defaults.get("selectors", {}), **(auth.get("selectors") or {})}
    merged["interactive_paths"] = auth.get("interactive_paths") or defaults["interactive_paths"]
    merged["landing"] = auth.get("landing") or "/"
    return merged


def pathname_of(url):
    match = re.match(r"^[a-z]+://[^/]+(/[^?#]*)", url or "")
    return match.group(1) if match else (url or "/")


def capture_placeholders(pattern, actual_path):
    """`/{tenant}/*` against `/acme/dashboard` → {'tenant': 'acme'}"""
    if not pattern:
        return {}
    wanted = [p for p in pattern.split("/") if p]
    actual = [p for p in actual_path.split("/") if p]
    out = {}
    for index, token in enumerate(wanted):
        if token == "*":
            break
        if index >= len(actual):
            return out
        match = re.fullmatch(r"\{(\w+)\}", token)
        if match:
            out[match.group(1)] = actual[index]
    return out


def resolve_path(template, placeholders):
    missing = []

    def sub(match):
        name = match.group(1)
        if name not in placeholders:
            missing.append(name)
            return match.group(0)
        return placeholders[name]

    return re.sub(r"\{(\w+)\}", sub, template), missing


def base32_decode(secret):
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    bits = value = 0
    out = bytearray()
    for char in re.sub(r"[=\s]", "", secret).upper():
        index = alphabet.find(char)
        if index < 0:
            continue
        value = (value << 5) | index
        bits += 5
        if bits >= 8:
            out.append((value >> (bits - 8)) & 0xFF)
            bits -= 8
    return bytes(out)


def totp(secret):
    """RFC 6238, 30s window, SHA-1 — the shape every authenticator app implements."""
    counter = struct.pack(">Q", int(time.time()) // 30)
    digest = hmac.new(base32_decode(secret), counter, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{code % 1_000_000:06d}"


# --------------------------------------------------------------------------- #
# page primitives
# --------------------------------------------------------------------------- #


def settle(page, timeout):
    try:
        page.wait_for_load_state("networkidle", timeout=min(timeout, 5000))
    except Exception:
        pass


def apply_ready_when(page, ready, timeout):
    if not ready:
        return
    if ready.get("gone"):
        try:
            page.locator(ready["gone"]).first.wait_for(state="hidden", timeout=timeout)
        except Exception:
            pass
    if ready.get("visible"):
        page.locator(ready["visible"]).first.wait_for(state="visible", timeout=timeout)


def run_actions(page, actions, timeout, soft=False):
    """The four verbs. `soft` swallows failures — post_login needs that, a step must not."""
    for action in actions or []:
        locator = page.locator(action["selector"]).first
        try:
            verb = action["verb"]
            if verb == "click":
                locator.click(timeout=timeout)
            elif verb == "fill":
                locator.fill(action.get("value", ""), timeout=timeout)
            elif verb == "wait":
                locator.wait_for(state="visible", timeout=timeout)
            elif verb == "scroll":
                locator.scroll_into_view_if_needed(timeout=timeout)
        except Exception as error:
            if not soft:
                raise RuntimeError(
                    f"{action['verb']} {action['selector']}: {short(error)}") from None


def check_asserts(page, asserts, timeout):
    failures = []
    for claim in asserts or []:
        kind = claim.get("kind")
        if kind == "text":
            try:
                page.locator(f"text={claim['value']}").first.wait_for(
                    state="visible", timeout=min(timeout, 8000))
            except Exception:
                failures.append(f'expected text "{claim["value"]}" on screen')
        elif kind == "no-text":
            try:
                count = page.locator(f"text={claim['value']}").count()
            except Exception:
                count = 0
            if count:
                failures.append(
                    f'text "{claim["value"]}" should not be present ({count} found)')
        elif kind == "count":
            try:
                count = page.locator(claim["selector"]).count()
            except Exception:
                count = -1
            if count != claim["value"]:
                failures.append(f'expected {claim["value"]} match(es) for '
                                f'"{claim["selector"]}", found {count}')
    return failures


# --------------------------------------------------------------------------- #
# login
# --------------------------------------------------------------------------- #


def on_sign_in(page, auth):
    return bool(auth.get("path")) and pathname_of(page.url).startswith(auth["path"])


def interactive_hit(page, auth):
    here = pathname_of(page.url)
    for fragment in auth.get("interactive_paths") or []:
        if fragment in here:
            return fragment
    return None


def perform_login(page, env, auth, timeout):
    credentials = env.get("credentials") or {}
    selectors = auth.get("selectors") or {}

    page.goto(env["url"] + (auth.get("path") or "/"),
              wait_until="domcontentloaded", timeout=timeout)
    settle(page, timeout)

    page.locator(selectors["user"]).first.fill(credentials.get("user", ""), timeout=timeout)
    page.locator(selectors["submit"]).first.click(timeout=timeout)

    # Two-step forms (and Clerk) ask for the password on the next screen.
    password_field = page.locator(selectors["password"]).first
    if selectors.get("password_submit"):
        password_field.wait_for(state="visible", timeout=timeout)
    try:
        visible = password_field.is_visible()
    except Exception:
        visible = False
    if visible:
        password_field.fill(credentials.get("password", ""), timeout=timeout)
        page.locator(selectors.get("password_submit") or selectors["submit"]).first.click(
            timeout=timeout)
    settle(page, timeout)

    secret = credentials.get("totp_secret")
    if secret and selectors.get("totp"):
        field = page.locator(selectors["totp"]).first
        try:
            present = field.is_visible()
        except Exception:
            present = False
        if present:
            field.fill(totp(secret), timeout=timeout)
            try:
                page.keyboard.press("Enter")
            except Exception:
                pass
            settle(page, timeout)


# Statuses that mean "the edge answered but the thing behind it is still coming up".
# A 500 is the app answering with its own bug — that is a result, not a cold start.
WARMUP_RETRYABLE_STATUS = {502, 503, 504}


def warmup_of(env, plan):
    merged = {**(plan.get("warmup") or {}), **(env.get("warmup") or {})}
    return {
        "path": merged.get("path", "/"),
        "attempts": int(merged.get("attempts", 1)),
        "timeout_ms": int(merged.get("timeout_ms", plan["timeout_ms"])),
    }


def warmup(browser, env, plan):
    """Absorb cold start before anything is judged.

    A load balancer scaled to zero, a container that boots on first request, a database
    connection pool that opens lazily — these make the *first* request of a run slow or fail.
    Calling that flaky mislabels it: nothing is intermittent, the environment simply was not
    up yet, and a retry wrapped around the steps would hide a real regression behind the same
    mechanism.

    So this is one request per environment that no verdict can be derived from, with its own
    budget. It retries only on transport failure or a gateway status — never because the page
    said something unexpected, which is what a step is for.
    """
    settings = warmup_of(env, plan)
    if settings["attempts"] < 1:
        return {"ok": True, "attempts": 0, "duration_ms": 0, "status": 0, "message": "disabled"}

    context = browser.new_context(ignore_https_errors=True)
    page = context.new_page()
    started = time.time()
    last = ""
    try:
        for attempt in range(1, settings["attempts"] + 1):
            try:
                response = page.goto(env["url"] + settings["path"],
                                     wait_until="domcontentloaded",
                                     timeout=settings["timeout_ms"])
                status = response.status if response else 0
                if status not in WARMUP_RETRYABLE_STATUS:
                    return {"ok": True, "attempts": attempt,
                            "duration_ms": int((time.time() - started) * 1000),
                            "status": status, "message": ""}
                last = f"HTTP {status}"
            except Exception as error:
                last = short(error)
            if attempt < settings["attempts"]:
                log(f"  {env['name']}: not up yet ({last}) — warm-up "
                    f"{attempt + 1}/{settings['attempts']}")
        return {"ok": False, "attempts": settings["attempts"],
                "duration_ms": int((time.time() - started) * 1000), "status": 0,
                "message": f"{last} after {settings['attempts']} warm-up attempt(s) — no "
                           "credential was tried and nothing here was verified"}
    finally:
        try:
            context.close()
        except Exception:
            pass


def establish_session(browser, env, plan):
    """Three outcomes that must never be conflated: a reusable session, rejected credentials,
    and "the app accepted the password and then demanded a human"."""
    auth = auth_of(env)
    timeout = plan["timeout_ms"]
    viewport = plan["viewports"][0]
    saved = os.path.isfile(env["state_file"])

    context = browser.new_context(
        viewport={"width": viewport["width"], "height": viewport["height"]},
        storage_state=env["state_file"] if saved else None,
        ignore_https_errors=True,
    )
    page = context.new_page()

    try:
        page.goto(env["url"] + (auth.get("landing") or "/"),
                  wait_until="domcontentloaded", timeout=timeout)
        settle(page, timeout)

        if env["recipe"] != "none" and on_sign_in(page, auth):
            if env["recipe"] == "storage-state":
                return {"ok": False, "message": (
                    "saved session expired — re-run with --manual-login" if saved
                    else "no saved session — run with --manual-login")}
            log(f"  {env['name']}: signing in ({env['recipe']})")
            perform_login(page, env, auth, timeout)

            challenge = interactive_hit(page, auth)
            if challenge:
                return {"ok": False, "message": (
                    "the app accepted the password and then asked for something a script "
                    f"must not complete on your behalf ({challenge}) — re-run with "
                    "--manual-login")}
            if on_sign_in(page, auth):
                return {"ok": False,
                        "message": "credentials were rejected — still on the sign-in route"}

        apply_ready_when(page, auth.get("ready_when"), timeout)
        if auth.get("post_login_actions"):
            run_actions(page, auth["post_login_actions"], min(timeout, 5000), soft=True)

        placeholders = capture_placeholders(auth.get("capture"), pathname_of(page.url))
        state = context.storage_state()
        # Cache the session so the next run skips the login — but never for `none`, where
        # there is no session and the file would make `storage-state` look configured.
        if env["recipe"] != "none":
            try:
                os.makedirs(plan["auth_dir"], exist_ok=True)
                with open(env["state_file"], "w", encoding="utf-8") as handle:
                    json.dump(state, handle)
                os.chmod(env["state_file"], 0o600)
            except OSError:
                pass    # a session we cannot cache is not a failure
        return {"ok": True, "message": "", "placeholders": placeholders, "state": state}
    except Exception as error:
        return {"ok": False, "message": short(error)}
    finally:
        try:
            context.close()
        except Exception:
            pass


# --------------------------------------------------------------------------- #
# stepping
# --------------------------------------------------------------------------- #


def run_viewport(browser, plan, env, viewport, session, results):
    auth = auth_of(env)
    timeout = plan["timeout_ms"]
    context = browser.new_context(
        viewport={"width": viewport["width"], "height": viewport["height"]},
        device_scale_factor=viewport.get("deviceScaleFactor") or 1,
        is_mobile=bool(viewport.get("isMobile")),
        has_touch=bool(viewport.get("isMobile")),
        user_agent=MOBILE_UA if viewport.get("isMobile") else None,
        storage_state=session.get("state"),
        ignore_https_errors=True,
    )
    page = context.new_page()

    console_errors = []
    if plan.get("console_errors"):
        page.on("console", lambda message: (
            console_errors.append(message.text[:200]) if message.type == "error" else None))
        page.on("pageerror", lambda error: console_errors.append(short(error)))

    os.makedirs(os.path.join(plan["out_dir"], env["name"], viewport["name"]), exist_ok=True)

    for step in plan["steps"]:
        started = time.time()
        messages = []
        console_errors.clear()
        relative = os.path.join(env["name"], viewport["name"], f"{step['id']}.png")

        try:
            resolved, missing = resolve_path(step["path"], session.get("placeholders") or {})
            if missing:
                raise RuntimeError(
                    f"unresolved path placeholder {{{', '.join(missing)}}} — add auth.capture "
                    "to .ai/aidlc.yaml, or use a literal path")
            page.goto(env["url"] + resolved, wait_until="domcontentloaded", timeout=timeout)
            settle(page, timeout)

            if env["recipe"] != "none" and on_sign_in(page, auth):
                raise RuntimeError(
                    "redirected to the sign-in route — the session expired mid-run")

            apply_ready_when(page, auth.get("ready_when"), timeout)
            run_actions(page, step.get("actions"), timeout)
            settle(page, timeout)
            apply_ready_when(page, auth.get("ready_when"), timeout)

            for signal in plan.get("failure_signals") or []:
                try:
                    fired = page.locator(signal["selector"]).first.is_visible()
                except Exception:
                    fired = False
                if fired:
                    messages.append(signal["message"])
            messages += check_asserts(page, step.get("asserts"), timeout)
            if plan.get("console_errors") and console_errors:
                messages.append(f"console.error: {console_errors[0]}")
        except Exception as error:
            messages.append(short(error))

        # The screenshot is taken whether the step passed or failed: a red step's screenshot
        # is the defect report, and throwing it away loses the most useful artifact of a bad
        # run.
        screenshot = relative
        try:
            page.screenshot(path=os.path.join(plan["out_dir"], relative), full_page=True)
        except Exception as error:
            screenshot = ""
            messages.append(f"screenshot failed: {short(error)}")

        verdict = "fail" if messages else "pass"
        results.append({
            "env": env["name"],
            "viewport": viewport["name"],
            "step": step["id"],
            "verdict": verdict,
            "duration_ms": int((time.time() - started) * 1000),
            "url": page.url,
            "screenshot": screenshot,
            "messages": messages,
        })
        log(f"  {'·' if verdict == 'pass' else '✗'} "
            f"{env['name']}/{viewport['name']}/{step['id']}"
            + (f" — {messages[0]}" if messages else ""))

    try:
        context.close()
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# contact sheet
# --------------------------------------------------------------------------- #


def contact_sheet(browser, plan, env, results):
    mine = [r for r in results if r["env"] == env["name"] and r["screenshot"]]
    if not mine:
        return None

    cards = []
    for result in mine:
        try:
            with open(os.path.join(plan["out_dir"], result["screenshot"]), "rb") as handle:
                uri = "data:image/png;base64," + base64.b64encode(handle.read()).decode("ascii")
        except OSError:
            continue
        cards.append(
            f'<figure class="{result["verdict"]}">'
            f'<figcaption>{result["step"]} · {result["viewport"]} · {result["verdict"]}'
            f'</figcaption><img src="{uri}"></figure>'
        )
    if not cards:
        return None

    html = f"""<!doctype html><meta charset="utf-8"><style>
    body {{ font: 13px -apple-system, system-ui, sans-serif; background:#fff; color:#111;
           margin:0; padding:24px; }}
    h1 {{ font-size:16px; margin:0 0 16px; }}
    .grid {{ display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }}
    figure {{ margin:0; border:2px solid #d8d8d8; border-radius:6px; overflow:hidden; }}
    figure.fail {{ border-color:#c5221f; }}
    figcaption {{ padding:6px 8px; font-size:12px; background:#f6f6f6; }}
    .fail figcaption {{ background:#fde8e7; color:#c5221f; }}
    img {{ display:block; width:100%; height:auto; }}
    </style><h1>{plan['feature']} — {env['name']} · {plan.get('meta', {}).get('commit', '')}</h1>
    <div class="grid">{''.join(cards)}</div>"""

    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    name = f"contact-sheet-{env['name']}.png"
    page.set_content(html, wait_until="load")
    page.screenshot(path=os.path.join(plan["out_dir"], name), full_page=True)
    try:
        context.close()
    except Exception:
        pass
    return name


# --------------------------------------------------------------------------- #
# modes
# --------------------------------------------------------------------------- #


def manual_login(playwright, plan):
    browser = playwright.chromium.launch(headless=False)
    try:
        for env in plan["environments"]:
            auth = auth_of(env)
            viewport = plan["viewports"][0]
            context = browser.new_context(
                viewport={"width": viewport["width"], "height": viewport["height"]},
                ignore_https_errors=True,
            )
            page = context.new_page()
            try:
                page.goto(env["url"] + (auth.get("path") or auth.get("landing") or "/"),
                          wait_until="domcontentloaded")
            except Exception:
                pass

            log(f"\n{env['name']}: sign in by hand in the browser window that just opened.")
            log("Nothing you type there is read or stored by this tool.")
            sys.stderr.write("Press Enter once you are signed in… ")
            sys.stderr.flush()
            sys.stdin.readline()

            os.makedirs(plan["auth_dir"], exist_ok=True)
            context.storage_state(path=env["state_file"])
            os.chmod(env["state_file"], 0o600)
            log(f"saved {env['state_file']}")
            try:
                context.close()
            except Exception:
                pass
    finally:
        try:
            browser.close()
        except Exception:
            pass
    return 0


def run_plan(playwright, plan):
    started = now_iso()
    browser = playwright.chromium.launch(headless=True)
    browser_version = f"chromium {browser.version}"
    results, environments, contact_sheets = [], [], {}

    try:
        for env in plan["environments"]:
            log(f"{env['name']} — {env['url']}")
            record = {
                "name": env["name"],
                "url": env["url"],
                "required": env["required"],
                "writes": env["writes"],
                "recipe": env["recipe"],
            }

            warm = warmup(browser, env, plan)
            record["warmup"] = warm
            if not warm["ok"]:
                record.update({"login": "failed", "message": warm["message"]})
                environments.append(record)
                log(f"  ✗ {env['name']}: {warm['message']}")
                continue
            if warm["attempts"] > 1 or warm["duration_ms"] >= 5000:
                log(f"  {env['name']}: warm-up took {human_ms(warm['duration_ms'])} over "
                    f"{warm['attempts']} attempt(s) — not counted in any verdict")

            session = establish_session(browser, env, plan)
            record.update({"login": "ok" if session["ok"] else "failed",
                           "message": session["message"]})
            environments.append(record)
            if not session["ok"]:
                # Every step would fail for the same reason; forty identical failures bury
                # the one that matters.
                log(f"  ✗ {env['name']}: {session['message']}")
                continue
            for viewport in plan["viewports"]:
                run_viewport(browser, plan, env, viewport, session, results)
            try:
                sheet = contact_sheet(browser, plan, env, results)
            except Exception:
                sheet = None
            if sheet:
                contact_sheets[env["name"]] = sheet
    finally:
        try:
            browser.close()
        except Exception:
            pass

    passed = sum(1 for r in results if r["verdict"] == "pass")
    required = {e["name"] for e in environments if e["required"]}
    failed = (any(r["verdict"] != "pass" and r["env"] in required for r in results)
              or any(e["login"] == "failed" and e["name"] in required for e in environments))

    run = {
        "schema": 1,
        "tool": plan["tool"],
        "ruleset": plan["ruleset"],
        "feature": plan["feature"],
        "status": "fail" if failed else "pass",
        "started_at": started,
        "finished_at": now_iso(),
        "browser": browser_version,
        "commit": (plan.get("meta") or {}).get("commit", ""),
        "branch": (plan.get("meta") or {}).get("branch", ""),
        "dirty": bool((plan.get("meta") or {}).get("dirty")),
        "environments": environments,
        "viewports": plan["viewports"],
        "steps": [{"id": s["id"], "title": s["title"], "path": s["path"],
                   "verifies": s["verifies"]} for s in plan["steps"]],
        "results": results,
        "contact_sheets": contact_sheets,
        "counts": {"pass": passed, "fail": len(results) - passed, "total": len(results)},
    }

    os.makedirs(plan["out_dir"], exist_ok=True)
    with open(os.path.join(plan["out_dir"], "run.json"), "w", encoding="utf-8") as handle:
        json.dump(run, handle, indent=2)
        handle.write("\n")
    return 0


# --------------------------------------------------------------------------- #


POST_LOGIN_FILL = re.compile(r"(?i)^fill\s+(.+?)\s*=\s*(.+)$")
POST_LOGIN_VERB = re.compile(r"(?i)^(click|wait|scroll)\s+(.+)$")


def parse_post_login(raw):
    """post_login is authored as the same four verbs a step's Interaction column takes."""
    actions = []
    for part in str(raw).split(";"):
        chunk = part.strip().strip("`").strip()
        if not chunk:
            continue
        match = POST_LOGIN_FILL.match(chunk)
        if match:
            actions.append({"verb": "fill", "selector": match.group(1).strip(),
                            "value": match.group(2).strip()})
            continue
        match = POST_LOGIN_VERB.match(chunk)
        if match:
            actions.append({"verb": match.group(1).lower(), "selector": match.group(2).strip()})
    return actions


def main():
    argv = sys.argv[1:]

    if argv[:1] == ["--plan-stdin"]:
        raw = sys.stdin.read()
    elif argv[:1] == ["--plan"] and len(argv) > 1:
        with open(argv[1], encoding="utf-8") as handle:
            raw = handle.read()
    else:
        log("usage: run.py --plan-stdin | --plan <file>")
        return 2

    plan = json.loads(raw)
    for env in plan.get("environments") or []:
        post = (env.get("auth") or {}).get("post_login")
        if isinstance(post, str) and post.strip():
            env["auth"]["post_login_actions"] = parse_post_login(post)

    with sync_playwright() as playwright:
        if plan.get("mode") == "manual-login":
            return manual_login(playwright, plan)
        return run_plan(playwright, plan)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log("interrupted")
        sys.exit(1)
    except Exception as error:  # noqa: BLE001 - the runner must report, not traceback
        log(f"runner failed: {error}")
        sys.exit(1)
