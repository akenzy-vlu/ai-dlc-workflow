#!/usr/bin/env python3
"""
discover_generic.py — stack-agnostic repo inventory.

A fallback for piloting on a repo with no stack profile yet. It detects package manifests,
module layout, naming conventions and entry points across common ecosystems, without knowing
anything about your framework.

A profile's own discovery script will always do better — it knows which shared component
library to enumerate, which route registry to read, which conventions are live versus legacy.
Use this to get moving, and write a profile once the stack is worth the investment.

    discover_generic.py <repo-root> [-o .ai/architecture.md] [--feature <name>]

Stdlib only. Read-only.
"""

import argparse
import datetime
import json
import os
import re
import sys
from collections import Counter, defaultdict

SKIP = {".git", "node_modules", "build", "dist", "target", "vendor", "__pycache__",
        ".dart_tool", ".venv", "venv", ".idea", ".vscode", "Pods", ".gradle", "bin", "obj"}

MANIFESTS = {
    "package.json": "node", "pubspec.yaml": "dart", "go.mod": "go",
    "Cargo.toml": "rust", "pyproject.toml": "python", "requirements.txt": "python",
    "pom.xml": "java", "build.gradle": "java", "build.gradle.kts": "java",
    "Gemfile": "ruby", "composer.json": "php", "*.csproj": "dotnet",
}

# suffix → what it usually means. Deliberately cross-ecosystem.
CONVENTIONS = [
    ("use case",       r"(_usecase|_use_case|\.usecase|UseCase)\.\w+$"),
    ("service",        r"(\.service|_service|Service)\.\w+$"),
    ("controller",     r"(\.controller|_controller|Controller)\.\w+$"),
    ("handler",        r"(\.handler|_handler|Handler)\.\w+$"),
    ("repository",     r"(\.repository|_repository|Repository)(?<!Impl)\.\w+$"),
    ("repository impl", r"(_repository_impl|RepositoryImpl|\.repository\.impl)\.\w+$"),
    ("entity",         r"(\.entity|_entity|Entity)\.\w+$"),
    ("model",          r"(\.model|_model|Model)\.\w+$"),
    ("dto",            r"(\.dto|_dto|Dto|DTO)\.\w+$"),
    ("aggregate",      r"(\.aggregate|_aggregate|Aggregate)\.\w+$"),
    ("event",          r"(\.event|_event|Event)\.\w+$"),
    ("command",        r"(\.command|_command|Command)\.\w+$"),
    ("state holder",   r"(_bloc|_cubit|_store|Store|_viewmodel|ViewModel)\.\w+$"),
    ("page / screen",  r"(_page|_screen|Page|Screen)\.\w+$"),
    ("component",      r"(\.component|_component|Component)\.\w+$"),
    ("module",         r"(\.module|_module|Module)\.\w+$"),
    ("migration",      r"(migration|Migration)"),
    ("test",           r"(_test|\.test|\.spec|_spec|Test|Tests)\.\w+$"),
]

LAYER_HINTS = ["domain", "application", "data", "infra", "infrastructure", "presentation",
               "api", "ui", "core", "shared", "common", "usecases", "services", "handlers"]


def walk(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP and not d.startswith(".")]
        yield dirpath, dirnames, filenames


def rel(root, path):
    return os.path.relpath(path, root).replace(os.sep, "/")


def read(path, limit=200_000):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read(limit)
    except OSError:
        return ""


def find_manifests(root):
    out = []
    for dirpath, _, filenames in walk(root):
        for fname in filenames:
            eco = MANIFESTS.get(fname)
            if not eco and fname.endswith(".csproj"):
                eco = "dotnet"
            if not eco:
                continue
            path = os.path.join(dirpath, fname)
            out.append({"eco": eco, "file": fname, "dir": rel(root, dirpath),
                        "name": manifest_name(path, fname, eco),
                        "deps": manifest_deps(path, fname, eco)})
    return sorted(out, key=lambda m: (m["dir"] != ".", m["dir"]))


def manifest_name(path, fname, eco):
    text = read(path)
    if fname == "package.json":
        try:
            return json.loads(text).get("name", "?")
        except ValueError:
            return "?"
    if eco == "dart":
        m = re.search(r"^name:\s*(\S+)", text, re.M)
        return m.group(1) if m else "?"
    if eco == "go":
        m = re.search(r"^module\s+(\S+)", text, re.M)
        return m.group(1) if m else "?"
    if eco == "rust":
        m = re.search(r'^name\s*=\s*"([^"]+)"', text, re.M)
        return m.group(1) if m else "?"
    if eco == "python":
        m = re.search(r'^name\s*=\s*"([^"]+)"', text, re.M)
        return m.group(1) if m else os.path.basename(os.path.dirname(path))
    return os.path.basename(os.path.dirname(path)) or "?"


def manifest_deps(path, fname, eco):
    text = read(path)
    if fname == "package.json":
        try:
            data = json.loads(text)
        except ValueError:
            return []
        return sorted(set(data.get("dependencies", {})) | set(data.get("devDependencies", {})))
    if eco == "dart":
        return sorted(set(re.findall(r"^\s{2}([a-z_][a-z0-9_]*):", text, re.M)))
    if eco == "go":
        return sorted(set(re.findall(r"^\s+([\w./-]+)\s+v\d", text, re.M)))
    if eco == "rust":
        block = text.split("[dependencies]")[-1]
        return sorted(set(re.findall(r"^([a-z0-9_-]+)\s*=", block, re.M)))
    if eco == "python":
        return sorted(set(re.findall(r"^\s*[\"']?([A-Za-z0-9_.-]+)[\"']?\s*[><=~]", text, re.M)))
    return []


def find_modules(root):
    """Directories that look like feature or module boundaries."""
    counts = defaultdict(lambda: {"files": 0, "layers": set(), "path": ""})
    # Two shapes are common: an explicit container directory (features/, modules/, ...),
    # and modules sitting directly under a source root (src/orders/, lib/billing/). Missing
    # the second shape would report "no modules found" on most NestJS and Go repos.
    patterns = [
        r"(.*/(?:features|modules|domains|apps|services|packages))/([^/]+)(?:/(.*))?$",
        r"^((?:src|lib|internal|pkg|app))/([^/]+)(?:/(.*))?$",
    ]
    for dirpath, _, filenames in walk(root):
        norm = rel(root, dirpath)
        for rx in patterns:
            m = re.search(rx, norm)
            if not m:
                continue
            name, tail = m.group(2), m.group(3) or ""
            if "." in name:            # a file-like segment, not a module
                break
            key = f"{m.group(1)}/{name}"
            entry = counts[key]
            entry["path"] = key
            if tail:
                head = tail.split("/")[0]
                if head in LAYER_HINTS:
                    entry["layers"].add(head)
            entry["files"] += sum(1 for f in filenames if "." in f)
            break
    # a module with no files and no layers is usually a false positive
    return {k: v for k, v in sorted(counts.items()) if v["files"] or v["layers"]}


def find_conventions(root):
    counts, samples = Counter(), defaultdict(list)
    for dirpath, _, filenames in walk(root):
        for fname in filenames:
            for label, rx in CONVENTIONS:
                if re.search(rx, fname):
                    counts[label] += 1
                    if len(samples[label]) < 2:
                        samples[label].append(rel(root, os.path.join(dirpath, fname)))
                    break
    return counts, samples


def find_layers_used(root):
    seen = Counter()
    for dirpath, dirnames, _ in walk(root):
        for d in dirnames:
            if d in LAYER_HINTS:
                seen[d] += 1
    return seen


def find_entrypoints(root):
    hits = []
    for dirpath, _, filenames in walk(root):
        for fname in filenames:
            if re.match(r"^(main|index|app|program|server)\.(dart|ts|js|py|go|rs|cs|java|rb)$", fname):
                hits.append(rel(root, os.path.join(dirpath, fname)))
    return sorted(hits)[:20]


def feature_focus(root, feature):
    out = []
    for dirpath, _, filenames in walk(root):
        norm = rel(root, dirpath)
        if feature.lower() not in norm.lower():
            continue
        for fname in sorted(filenames):
            if "." in fname:
                out.append(f"{norm}/{fname}")
    return sorted(out)[:80]


def render(root, focus=None):
    manifests = find_manifests(root)
    modules = find_modules(root)
    conv_counts, conv_samples = find_conventions(root)
    layers = find_layers_used(root)
    entries = find_entrypoints(root)
    ecos = sorted({m["eco"] for m in manifests})

    lines = [
        "<!-- DRAFT generated by ai-dlc-core/scripts/discover_generic.py — verify before trusting -->",
        "---",
        f"generated: {datetime.date.today().isoformat()}",
        f"repo_root: {os.path.abspath(root)}",
        "generator: discover_generic",
        "verified_by:            # a human puts their name here after checking it",
        "---",
        "",
        "# Architecture map",
        "",
        "Produced by the stack-agnostic fallback, so it is coarser than a profile's own",
        "discovery would be. Correct it, then use it as the source of truth for `touches`",
        "paths — never invent a path that does not appear here.",
        "",
        f"Ecosystems detected: **{', '.join(ecos) if ecos else 'none'}**",
        "",
        "## Packages",
        "",
        "| Name | Path | Ecosystem | Deps |",
        "|---|---|---|---|",
    ]
    for m in manifests[:40]:
        lines.append(f"| `{m['name']}` | `{m['dir']}` | {m['eco']} | {len(m['deps'])} |")
    if not manifests:
        lines.append("| — | no package manifest found | | |")

    lines += ["", "## Notable dependencies", ""]
    all_deps = Counter()
    for m in manifests:
        all_deps.update(m["deps"])
    if all_deps:
        lines.append(" · ".join(f"`{d}`" for d, _ in all_deps.most_common(30)))
    else:
        lines.append("None parsed — check the manifests by hand.")

    lines += ["", "## Modules / features", "", "| Path | Layers inside | Files |", "|---|---|---|"]
    for key, info in list(modules.items())[:40]:
        lines.append(f"| `{info['path']}` | {', '.join(sorted(info['layers'])) or '—'} | {info['files']} |")
    if not modules:
        lines.append("| — | no features/ modules/ services/ directory found | |")

    lines += ["", "## Layer vocabulary observed", ""]
    if layers:
        lines.append("| Directory name | Occurrences |")
        lines.append("|---|---|")
        for name, n in layers.most_common():
            lines.append(f"| `{name}` | {n} |")
        lines.append("")
        lines.append("Set `layers:` in `.ai/aidlc.yaml` from this list, not from habit.")
    else:
        lines.append("No conventional layer directories found — decide the vocabulary explicitly.")

    lines += ["", "## Naming conventions observed", "",
              "| Convention | Count | Example |", "|---|---|---|"]
    for label, n in conv_counts.most_common(20):
        example = conv_samples[label][0] if conv_samples[label] else "—"
        lines.append(f"| {label} | {n} | `{example}` |")
    if not conv_counts:
        lines.append("| — | nothing matched the known suffixes | |")

    lines += ["", "## Entry points", ""]
    lines += [f"- `{e}`" for e in entries] or ["None found."]

    if focus:
        files = feature_focus(root, focus)
        lines += ["", f"## Focus — `{focus}`", ""]
        lines += [f"- `{f}`" for f in files] or ["No matching files."]

    lines += [
        "", "## Gaps a human must fill", "",
        "The filesystem cannot answer these. Settle them before writing tickets:", "",
        "- [ ] Which package should new domain/business code live in?",
        "- [ ] Which layer names are real conventions, and which are legacy to avoid copying?",
        "- [ ] Is there a shared component or utility library new work should reuse?",
        "- [ ] How are new dependencies registered — DI container, manual wiring, framework magic?",
        "- [ ] Which modules are frozen, deprecated, or about to be rewritten?",
        "- [ ] Which external contracts are signed off, and which are still moving?",
        "",
        "Once this stack is worth the investment, write a profile: see",
        "`ai-dlc-core/references/profile-contract.md`. A profile's discovery script can",
        "enumerate the shared component library and the route registry, which this cannot.",
        "",
    ]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description="Stack-agnostic repo inventory.")
    ap.add_argument("repo_root")
    ap.add_argument("-o", "--output")
    ap.add_argument("--feature")
    args = ap.parse_args()

    if not os.path.isdir(args.repo_root):
        print(f"error: {args.repo_root} is not a directory", file=sys.stderr)
        return 2

    text = render(args.repo_root, args.feature)
    if args.output:
        parent = os.path.dirname(os.path.abspath(args.output))
        os.makedirs(parent, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"wrote {args.output}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
