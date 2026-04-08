#!/usr/bin/env python3
"""
JSX-aware scanner that finds rendered HTML elements missing a data-id attribute.

Usage: python3 scan-missing-data-ids.py [root-dir]

Exits 0 with "TOTAL MISSING: 0" when every targeted element has a data-id.
Exits 1 with a per-file list otherwise.

Why JSX-aware: a naive regex like `<(\w+)[^>]*>` breaks on arrow functions
inside attributes (`onClick={e => e.stopPropagation()}`) because `=>` contains
`>`. This scanner tracks brace depth and string state so nested expressions
are handled correctly.
"""
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'

# Directories we never want to scan
SKIP_DIR_NAMES = {
    'node_modules', '.next', 'dist', 'build', '.git',
    'out', '.turbo', '.cache', 'coverage',
    'ui',  # shadcn/ui primitives — skip; they are auto-reused
}

# Lowercase DOM tags that must carry a data-id when rendered
TARGET_TAGS = {
    'div', 'span', 'section', 'p',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'a', 'button', 'input', 'textarea', 'select', 'option',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'form', 'label', 'fieldset', 'legend',
    'pre', 'code',
    'nav', 'header', 'footer', 'aside', 'main', 'article',
    'figure', 'figcaption',
}


def find_opening_tags(src):
    """Yield (start, end, name, attrs_start, attrs_end, self_closing) for JSX opening tags.

    Tracks brace depth and string state so characters inside attribute
    expressions (including `=>`, template literals, and nested objects)
    are handled correctly.
    """
    out = []
    i, n = 0, len(src)
    while i < n:
        if src[i] == '<' and i + 1 < n and (src[i + 1].isalpha() or src[i + 1] == '_'):
            # Tag name
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] in '_.'):
                j += 1
            name = src[i + 1:j]

            # Walk attributes tracking brace depth and string state
            brace = 0
            in_str = None  # one of ", ', ` when inside a string
            end = -1
            self_closing = False
            k = j
            while k < n:
                c = src[k]
                if in_str:
                    if c == '\\':
                        k += 2
                        continue
                    if c == in_str:
                        in_str = None
                    k += 1
                    continue
                if c in ('"', "'", '`'):
                    in_str = c
                    k += 1
                    continue
                if c == '{':
                    brace += 1
                    k += 1
                    continue
                if c == '}':
                    brace -= 1
                    k += 1
                    continue
                if brace == 0:
                    if c == '/' and k + 1 < n and src[k + 1] == '>':
                        end = k + 2
                        self_closing = True
                        break
                    if c == '>':
                        end = k + 1
                        break
                k += 1

            if end > 0:
                out.append((i, end, name, j, end - 1, self_closing))
                i = end
            else:
                i += 1
        else:
            i += 1
    return out


DATA_ID_RE = re.compile(r'\bdata-id\s*=')


def scan_file(path):
    with open(path, encoding='utf-8') as f:
        src = f.read()
    misses = []
    for (start, end, name, attrs_start, attrs_end, _self) in find_opening_tags(src):
        if name not in TARGET_TAGS:
            continue
        attrs = src[attrs_start:attrs_end]
        if DATA_ID_RE.search(attrs):
            continue
        line = src[:start].count('\n') + 1
        snippet = src[start:end][:120].replace('\n', ' ')
        misses.append((line, name, snippet))
    return misses


def main():
    total = 0
    files_with_misses = 0
    for dirpath, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIR_NAMES]
        for f in files:
            if not (f.endswith('.tsx') or f.endswith('.jsx')):
                continue
            path = os.path.join(dirpath, f)
            misses = scan_file(path)
            if not misses:
                continue
            files_with_misses += 1
            total += len(misses)
            print(f'\n{path}: {len(misses)} missing')
            for line, name, snip in misses[:30]:
                print(f'  L{line} <{name}>: {snip}')
            if len(misses) > 30:
                print(f'  ... and {len(misses) - 30} more')
    print(f'\nTOTAL MISSING: {total}  (across {files_with_misses} files)')
    sys.exit(1 if total > 0 else 0)


if __name__ == '__main__':
    main()
