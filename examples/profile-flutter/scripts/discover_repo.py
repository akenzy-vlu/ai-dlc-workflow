#!/usr/bin/env python3
"""
discover_repo.py — inventory a Flutter monorepo and emit a draft architecture map.

Read-only. Stdlib only. Answers the questions you would otherwise waste a human's
time asking: what packages exist, what the features are called, which shared widgets
are available, what route keys are registered, how DI is wired, and which layer
conventions the repo actually follows.

Usage:
    python discover_repo.py <repo-root>                 # print to stdout
    python discover_repo.py <repo-root> -o .ai/architecture.md
    python discover_repo.py <repo-root> --feature auth  # focus an existing feature

The output is a draft. Read it, correct what the heuristics got wrong, and only then
treat it as the source of truth for `touches` paths in tickets.
"""

import argparse
import datetime
import os
import re
import sys
from collections import Counter, defaultdict

SKIP_DIRS = {
    ".git", ".dart_tool", "build", ".idea", ".vscode", "node_modules",
    ".symlinks", "Pods", ".fvm", ".gradle",
}

STATE_LIBS = {
    "flutter_bloc": "BLoC", "bloc": "BLoC", "riverpod": "Riverpod",
    "flutter_riverpod": "Riverpod", "provider": "Provider",
    "get": "GetX", "mobx": "MobX", "redux": "Redux",
}
DI_LIBS = {"get_it": "get_it", "injectable": "injectable", "kiwi": "kiwi", "riverpod": "riverpod"}
NET_LIBS = {"dio": "dio", "http": "http", "chopper": "chopper", "retrofit": "retrofit"}
DB_LIBS = {"drift": "drift", "moor": "moor", "sqflite": "sqflite", "isar": "isar", "hive": "hive"}
ROUTER_LIBS = {"go_router": "go_router", "auto_route": "auto_route"}


def walk(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        yield dirpath, filenames


def read(path, limit=400_000):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read(limit)
    except OSError:
        return ""


def rel(root, path):
    return os.path.relpath(path, root).replace(os.sep, "/")


# --------------------------------------------------------------------------- #


def find_packages(root):
    """Every pubspec.yaml is a package. Returns [{name, path, kind, deps}]."""
    packages = []
    for dirpath, filenames in walk(root):
        if "pubspec.yaml" not in filenames:
            continue
        text = read(os.path.join(dirpath, "pubspec.yaml"))
        name_match = re.search(r"^name:\s*(\S+)", text, re.M)
        deps = set(re.findall(r"^\s{2}([a-z_][a-z0-9_]*):", text, re.M))
        is_app = bool(re.search(r"^\s*flutter:\s*$", text, re.M)) and "lib/main.dart" in [
            rel(dirpath, os.path.join(dp, f))
            for dp, fs in walk(dirpath) for f in fs if f == "main.dart"
        ]
        packages.append({
            "name": name_match.group(1) if name_match else os.path.basename(dirpath),
            "path": rel(root, dirpath),
            "kind": "app" if is_app else "package",
            "deps": deps,
        })
    return sorted(packages, key=lambda p: (p["kind"] != "app", p["path"]))


def detect_stack(packages):
    all_deps = set()
    for p in packages:
        all_deps |= p["deps"]
    def pick(mapping):
        return sorted({label for dep, label in mapping.items() if dep in all_deps})
    return {
        "state": pick(STATE_LIBS), "di": pick(DI_LIBS), "network": pick(NET_LIBS),
        "database": pick(DB_LIBS), "router": pick(ROUTER_LIBS),
        "secure_storage": "flutter_secure_storage" in all_deps,
        "screenutil": "flutter_screenutil" in all_deps,
        "functional": sorted({d for d in ("dartz", "fpdart", "either_dart") if d in all_deps}),
        "testing": sorted({d for d in ("bloc_test", "mocktail", "mockito", "golden_toolkit")
                           if d in all_deps}),
    }


def find_features(root):
    """Directories named .../lib/features/<name>/ and the layers inside them."""
    features = defaultdict(lambda: {"path": "", "layers": set(), "files": 0})
    for dirpath, filenames in walk(root):
        norm = rel(root, dirpath)
        match = re.search(r"(.*/lib/features)/([^/]+)(?:/(.*))?$", norm)
        if not match:
            continue
        name, tail = match.group(2), match.group(3) or ""
        entry = features[name]
        if not entry["path"]:
            entry["path"] = f"{match.group(1)}/{name}"
        if tail:
            entry["layers"].add(tail.split("/")[0])
        entry["files"] += sum(1 for f in filenames if f.endswith(".dart"))
    return dict(sorted(features.items()))


def find_shared_widgets(root):
    """Public widget classes in any package whose path mentions ui_kit / design."""
    widgets = defaultdict(list)
    pattern = re.compile(r"^class\s+([A-Z]\w+)\s+extends\s+(?:Stateless|Stateful|Consumer)Widget", re.M)
    for dirpath, filenames in walk(root):
        norm = rel(root, dirpath)
        if not re.search(r"(ui_kit|design_system|uikit|components)/", norm + "/"):
            continue
        for fname in filenames:
            if not fname.endswith(".dart") or fname.endswith(".g.dart"):
                continue
            for cls in pattern.findall(read(os.path.join(dirpath, fname))):
                widgets[norm.split("/lib/")[0]].append(cls)
    return {k: sorted(set(v)) for k, v in widgets.items()}


def find_route_keys(root):
    """segmentOf('x'), GoRoute(path:), AutoRoute page names — whatever the repo uses."""
    keys = Counter()
    seg = re.compile(r"segmentOf\(\s*['\"]([^'\"]+)['\"]")
    go = re.compile(r"GoRoute\(\s*path:\s*['\"]([^'\"]+)['\"]")
    const_route = re.compile(r"static\s+const\s+String\s+\w+\s*=\s*['\"](/[^'\"]*)['\"]")
    for dirpath, filenames in walk(root):
        for fname in filenames:
            if not fname.endswith(".dart"):
                continue
            text = read(os.path.join(dirpath, fname))
            for rx in (seg, go, const_route):
                for m in rx.findall(text):
                    keys[m] += 1
    return keys


def find_di(root):
    hits = Counter()
    patterns = {
        "getIt.registerSingleton": r"registerSingleton<",
        "getIt.registerLazySingleton": r"registerLazySingleton<",
        "getIt.registerFactory": r"registerFactory<",
        "@injectable": r"@injectable",
        "@lazySingleton": r"@lazySingleton",
        "@module": r"@module",
    }
    files = set()
    for dirpath, filenames in walk(root):
        for fname in filenames:
            if not fname.endswith(".dart"):
                continue
            path = os.path.join(dirpath, fname)
            text = read(path)
            for label, rx in patterns.items():
                n = len(re.findall(rx, text))
                if n:
                    hits[label] += n
                    if re.search(r"(injection|di|locator|service_locator)", fname):
                        files.add(rel(root, path))
    return hits, sorted(files)


def find_conventions(root):
    """Sample the naming the repo actually uses, rather than the naming you assume."""
    counts = Counter()
    samples = defaultdict(list)
    rules = [
        ("usecase", r"_usecase\.dart$"), ("use_case", r"_use_case\.dart$"),
        ("repository interface", r"(?<!_impl)_repository\.dart$"),
        ("repository impl", r"_repository_impl\.dart$"),
        ("datasource", r"_(remote|local)_datasource\.dart$"),
        ("model", r"_model\.dart$"), ("entity", r"_entity\.dart$"),
        ("bloc", r"_bloc\.dart$"), ("cubit", r"_cubit\.dart$"),
        ("page", r"_page\.dart$"), ("screen", r"_screen\.dart$"),
        ("failure", r"_failure(s)?\.dart$"), ("test", r"_test\.dart$"),
    ]
    for dirpath, filenames in walk(root):
        for fname in filenames:
            for label, rx in rules:
                if re.search(rx, fname):
                    counts[label] += 1
                    if len(samples[label]) < 2:
                        samples[label].append(rel(root, os.path.join(dirpath, fname)))
    return counts, samples


def feature_focus(root, feature):
    out = []
    for dirpath, filenames in walk(root):
        norm = rel(root, dirpath)
        if f"/features/{feature}" not in "/" + norm:
            continue
        for fname in sorted(filenames):
            if fname.endswith(".dart"):
                out.append(f"{norm}/{fname}")
    return sorted(out)


# --------------------------------------------------------------------------- #


def render(root, focus=None):
    packages = find_packages(root)
    stack = detect_stack(packages)
    features = find_features(root)
    widgets = find_shared_widgets(root)
    routes = find_route_keys(root)
    di_hits, di_files = find_di(root)
    conv_counts, conv_samples = find_conventions(root)

    today = datetime.date.today().isoformat()
    lines = [
        "<!-- DRAFT generated by scripts/discover_repo.py — verify before trusting -->",
        "---",
        f"generated: {today}",
        f"repo_root: {os.path.abspath(root)}",
        "verified_by:            # a human puts their name here after checking it",
        "---",
        "",
        "# Architecture map",
        "",
        "Heuristic inventory of the repo. Correct anything wrong, then use it as the source",
        "of truth for `touches` paths — never invent a path that does not appear here.",
        "",
        "## Packages",
        "",
        "| Package | Path | Kind |",
        "|---|---|---|",
    ]
    for p in packages:
        lines.append(f"| `{p['name']}` | `{p['path']}` | {p['kind']} |")

    lines += ["", "## Stack", "", "| Concern | Detected |", "|---|---|"]
    for label, key in [("State management", "state"), ("Dependency injection", "di"),
                       ("Networking", "network"), ("Local database", "database"),
                       ("Routing", "router"), ("Functional / Either", "functional"),
                       ("Testing", "testing")]:
        value = stack[key]
        lines.append(f"| {label} | {', '.join(value) if value else '**not detected**'} |")
    lines.append(f"| Secure storage | {'flutter_secure_storage' if stack['secure_storage'] else '**not present**'} |")
    lines.append(f"| Sizing | {'flutter_screenutil' if stack['screenutil'] else '**not present**'} |")

    lines += ["", "## Features", "", "| Feature | Path | Layers | .dart files |", "|---|---|---|---|"]
    for name, info in features.items():
        layers = ", ".join(sorted(info["layers"])) or "—"
        lines.append(f"| {name} | `{info['path']}` | {layers} | {info['files']} |")
    if not features:
        lines.append("| — | no `lib/features/` directory found | | |")

    lines += ["", "## Shared widgets available for reuse", ""]
    if widgets:
        for pkg, names in widgets.items():
            lines.append(f"**`{pkg}`** — {len(names)} widgets")
            lines.append("")
            lines.append(" · ".join(f"`{n}`" for n in names))
            lines.append("")
    else:
        lines += ["No ui_kit / design-system package detected. Confirm this before planning any",
                  "UI ticket — planning against a kit that does not exist produces fictional tickets.", ""]

    lines += ["## Route keys in use", ""]
    if routes:
        lines.append("| Key | Occurrences |")
        lines.append("|---|---|")
        for key, n in routes.most_common(40):
            lines.append(f"| `{key}` | {n} |")
        if len(routes) > 40:
            lines.append(f"| … | {len(routes) - 40} more |")
    else:
        lines.append("None found — routing convention unknown, ask before writing navigation tickets.")

    lines += ["", "## Dependency injection", ""]
    if di_hits:
        lines.append("| Pattern | Occurrences |")
        lines.append("|---|---|")
        for label, n in di_hits.most_common():
            lines.append(f"| `{label}` | {n} |")
        if di_files:
            lines += ["", "Registration files:", ""] + [f"- `{f}`" for f in di_files[:10]]
    else:
        lines.append("No DI registrations found — ask how new dependencies get wired.")

    lines += ["", "## Naming conventions observed", "",
              "| Convention | Count | Example |", "|---|---|---|"]
    for label, n in conv_counts.most_common():
        example = conv_samples[label][0] if conv_samples[label] else "—"
        lines.append(f"| {label} | {n} | `{example}` |")

    if focus:
        files = feature_focus(root, focus)
        lines += ["", f"## Focus — existing `{focus}` feature", ""]
        if files:
            lines += [f"- `{f}`" for f in files]
        else:
            lines.append(f"No files found under a `features/{focus}` directory.")

    lines += [
        "", "## Gaps a human must fill", "",
        "These cannot be read off the filesystem. Ask before planning:", "",
        "- [ ] Which package should new domain code live in, if there is more than one candidate?",
        "- [ ] Are there layer rules enforced in review that the file layout does not show?",
        "- [ ] Which existing features are frozen, deprecated, or about to be rewritten?",
        "- [ ] Which external contracts are already signed off, and which are still moving?",
        "- [ ] Anything here that looks like a convention but is actually legacy to avoid copying?",
        "",
    ]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description="Inventory a Flutter monorepo.")
    ap.add_argument("repo_root")
    ap.add_argument("-o", "--output", help="write to this path instead of stdout")
    ap.add_argument("--feature", help="also list the files of an existing feature")
    args = ap.parse_args()

    if not os.path.isdir(args.repo_root):
        print(f"error: {args.repo_root} is not a directory", file=sys.stderr)
        return 2

    text = render(args.repo_root, args.feature)
    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"wrote {args.output}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
