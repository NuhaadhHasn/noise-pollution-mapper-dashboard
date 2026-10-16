"""Dry-run the dashboard fix playbook against an in-memory copy of both repos.

Applies every BEFORE->AFTER pair (and every "New file" / "AFTER (the complete file)")
in document order, cluster by cluster, so later anchors are checked against the text
earlier steps produce. Never writes to either repo.

Usage: python -I dryrun.py <playbook_dir> <dash_root> <app_root> [order csv of spec prefixes]
"""
import os
import re
import sys

PLAYBOOK, DASH, APP = sys.argv[1:4]
ORDER = sys.argv[4].split(',') if len(sys.argv) > 4 else None

vfs = {}
HEAD = {}
LOST = {}


def resolve(p):
    p = p.strip()
    if p.startswith('APP:'):
        return os.path.normpath(os.path.join(APP, p[4:]))
    if p.startswith('DASH:'):
        p = p[5:]
    return os.path.normpath(os.path.join(DASH, p))


def load(path):
    if path not in vfs:
        if os.path.exists(path):
            with open(path, encoding='utf-8', newline='') as f:
                vfs[path] = f.read().replace('\r\n', '\n')
            HEAD[path] = vfs[path]
        else:
            vfs[path] = None
    return vfs[path]


def rstrip_lines(s):
    return '\n'.join(l.rstrip() for l in s.split('\n'))


FENCE = re.compile(r'^\s*```')
BEFORE_RE = re.compile(r'BEFORE \(`([^`]+)`')
NEWFILE_RE = re.compile(r'[Nn]ew file `([^`]+)`')
WHOLE_RE = re.compile(r'AFTER \(the complete file')
PATH_RE = re.compile(r'`((?:APP:)?[\w./\-]+\.(?:tsx?|jsx?|json|rules|dart|md|ya?ml|sh|html|css|cjs|mjs))`')

results = []

# --- Optional compile check (MATERIALIZE=<workspace dir>) -------------------------
# After each cluster, write the in-memory dashboard files into a workspace that is a
# `git archive` copy of the repo with node_modules junctioned in, apply the cluster's
# file deletions, and type-check it. Writes nothing to either real repo.
DELETIONS = {
    '03': ['functions', 'scripts/upload-cache.sh', 'src/utils/cacheDownloader.ts',
           'src/components/map/CacheStatus.tsx'],
    '07': ['src/services/userService.ts'],
}
CHECKS = []


def materialize_and_check(spec):
    import shutil
    import subprocess
    ws = os.environ['MATERIALIZE']
    for rel in DELETIONS.get(spec[:2], []):
        target = os.path.normpath(os.path.join(DASH, rel))
        for p in list(vfs):
            if p == target or p.startswith(target + os.sep):
                vfs[p] = None
        wpath = os.path.join(ws, rel)
        if os.path.isdir(wpath):
            shutil.rmtree(wpath)
        elif os.path.exists(wpath):
            os.remove(wpath)
    for p, content in vfs.items():
        if not p.startswith(os.path.normpath(DASH) + os.sep):
            continue  # APP-repo files (rules) are not compiled here
        wpath = os.path.join(ws, os.path.relpath(p, DASH))
        if content is None:
            if os.path.isfile(wpath):
                os.remove(wpath)
            continue
        os.makedirs(os.path.dirname(wpath), exist_ok=True)
        with open(wpath, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
    if spec[:2] < os.environ.get('CHECK_FROM', '00'):
        return  # files are still materialized; only the type-check is skipped
    tsbi = os.path.join(os.environ['TSBI_DIR'], 'app.tsbuildinfo')
    # npx.cmd with an argument list: no shell quoting, so the path arrives intact.
    cmd = ['npx.cmd', 'tsc', '-p', 'tsconfig.app.json', '--noEmit', '--pretty', 'false',
           '--incremental', '--tsBuildInfoFile', tsbi]
    proc = subprocess.run(cmd, cwd=ws, capture_output=True, text=True,
                          encoding='utf-8', errors='replace',
                          creationflags=getattr(subprocess, 'BELOW_NORMAL_PRIORITY_CLASS', 0))
    out = proc.stdout + proc.stderr
    log = os.path.join(os.environ['TSBI_DIR'], f'tsc_after_{spec[:2]}.log')
    with open(log, 'w', encoding='utf-8') as f:
        f.write(out)
    errs = [l for l in out.splitlines() if 'error TS' in l]
    CHECKS.append((spec, proc.returncode, len(errs)))
    print(f'[compile] after {spec}: tsc exit {proc.returncode}, {len(errs)} error(s) -> {log}', flush=True)


def blocks(lines):
    """Yield (header_context_lines, block_text, start_line) for each fenced block."""
    i = 0
    ctx = []
    while i < len(lines):
        if FENCE.match(lines[i]):
            start = i
            j = i + 1
            while j < len(lines) and not FENCE.match(lines[j]):
                j += 1
            yield ctx[-12:], '\n'.join(lines[i + 1:j]), start + 1
            ctx = []
            i = j + 1
        else:
            ctx.append(lines[i])
            i += 1


specs = sorted(f for f in os.listdir(PLAYBOOK) if f.endswith('.md'))
if ORDER:
    specs = sorted(specs, key=lambda f: ORDER.index(f[:2]) if f[:2] in ORDER else 99)

for spec in specs:
    with open(os.path.join(PLAYBOOK, spec), encoding='utf-8') as f:
        lines = f.read().replace('\r\n', '\n').split('\n')
    pending = None  # (path, before_text, line)
    for ctx, text, ln in blocks(lines):
        header = '\n'.join(ctx)
        m_before = None
        before_line = ''
        for c in reversed(ctx):
            m_before = BEFORE_RE.search(c)
            if m_before or re.search(r'\bAFTER\b', c) or NEWFILE_RE.search(c):
                before_line = c
                break
        m_after = any(re.search(r'^\s*\**AFTER', c) for c in ctx[-3:])
        m_new = None
        for c in reversed(ctx[-4:]):
            m_new = NEWFILE_RE.search(c)
            if m_new:
                break
        if m_before and not m_after:
            # Owner-decision branches: BRANCH=A skips "D1(B) only" steps and vice versa.
            other = {'A': 'B', 'B': 'A'}.get(os.environ.get('BRANCH', ''))
            if other and re.search(rf'D\d+\({other}\) only', before_line):
                pending = ('SKIP', text, ln)
                continue
            pending = (resolve(m_before.group(1)), text, ln, before_line)
            if os.environ.get('STOP') == f'{spec}:{ln}':
                # Dump the target file exactly as earlier steps left it, then stop.
                sys.stdout.buffer.write((load(pending[0]) or '<missing>').encode('utf-8'))
                sys.exit(0)
            continue
        if m_after and pending:
            path, before, bln = pending[:3]
            whole_hdr = pending[3] if len(pending) > 3 else ''
            pending = None
            if path == 'SKIP':
                continue
            cur = load(path)
            if cur is None:
                results.append((spec, bln, 'NOFILE', path))
                continue
            if re.search(r'the whole file', whole_hdr, re.I) and (
                    cur.count(before) == 0 or re.search(r'whole file is replaced', whole_hdr, re.I)):
                # Deliberate whole-file replacement whose BEFORE quotes HEAD. The danger is
                # silently dropping lines earlier clusters added: list them.
                head_lines = set(HEAD.get(path, '').split('\n'))
                after_lines = set(l.strip() for l in text.split('\n'))
                lost = [l for l in cur.split('\n')
                        if l not in head_lines and l.strip() and l.strip() not in after_lines]
                vfs[path] = text
                results.append((spec, bln, f'WHOLE lost={len(lost)}', path))
                LOST[(spec, bln)] = lost
                continue
            if WHOLE_RE.search(header) and before == '':
                vfs[path] = text
                continue
            n = cur.count(before)
            if n == 1:
                vfs[path] = cur.replace(before, text, 1)
                results.append((spec, bln, 'OK', path))
            elif n > 1:
                vfs[path] = cur.replace(before, text, 1)
                results.append((spec, bln, f'AMBIGUOUS x{n}', path))
            else:
                rc, rb = rstrip_lines(cur), rstrip_lines(before)
                if rb and rc.count(rb) == 1:
                    vfs[path] = rc.replace(rb, rstrip_lines(text), 1)
                    results.append((spec, bln, 'WS-ONLY', path))
                else:
                    results.append((spec, bln, 'MISS', path))
            continue
        if m_new or (m_after and WHOLE_RE.search(header) and not pending):
            target = m_new.group(1) if m_new else None
            if not target:
                for c in reversed(ctx):
                    pm = PATH_RE.search(c)
                    if pm:
                        target = pm.group(1)
                        break
            if target:
                path = resolve(target)
                existed = load(path) is not None
                vfs[path] = text
                results.append((spec, ln, 'REPLACED-WHOLE' if existed else 'CREATED', path))
            else:
                results.append((spec, ln, 'WHOLE-NO-PATH', '?'))
            continue
    if pending:
        results.append((spec, pending[2], 'BEFORE-WITHOUT-AFTER', pending[0]))
    if os.environ.get('MATERIALIZE'):
        materialize_and_check(spec)

from collections import Counter
print('Summary per spec:')
for spec in specs:
    c = Counter(r[2].split(' ')[0] for r in results if r[0] == spec)
    print(f'  {spec}: ' + ', '.join(f'{k}={v}' for k, v in sorted(c.items())))
bad = [r for r in results if r[2] not in ('OK', 'CREATED', 'REPLACED-WHOLE')]
print(f'\nProblems ({len(bad)}):')
for spec, ln, kind, path in bad:
    rel = os.path.relpath(path, DASH) if path != '?' else '?'
    print(f'  {spec}:{ln}  {kind:22s} {rel}')

if os.environ.get('DIAG'):
    import difflib
    for spec, ln, kind, path in bad:
        if kind != 'MISS':
            continue
        with open(os.path.join(PLAYBOOK, spec), encoding='utf-8') as f:
            sl = f.read().replace('\r\n', '\n').split('\n')
        i = ln  # fence line (1-based) -> block starts next line
        j = i
        while j < len(sl) and not FENCE.match(sl[j]):
            j += 1
        before = sl[i:j]
        cur = (vfs.get(path) or '').split('\n')
        sm = difflib.SequenceMatcher(None, cur, before, autojunk=False)
        a, b, size = sm.find_longest_match(0, len(cur), 0, len(before))
        lo = max(0, a - b)
        print(f'\n=== {spec}:{ln} {os.path.relpath(path, DASH)} — longest common run {size} lines at file line {a+1}')
        for d in difflib.unified_diff(cur[lo:lo + len(before) + 2], before, 'file-at-this-point', 'spec-BEFORE', lineterm='', n=1):
            print('   ' + d)

if os.environ.get('TRACE'):
    for r in results:
        if os.environ['TRACE'] in r[3]:
            print('TRACE', r[0], r[1], r[2])

for (spec, ln), lost in LOST.items():
    print(f'\nWHOLE-FILE {spec}:{ln} drops {len(lost)} line(s) that earlier clusters added:')
    for l in lost:
        print('   - ' + l.strip()[:150])

if os.environ.get('GREPFINAL'):
    pat = re.compile(os.environ['GREPFINAL'])
    for p, content in sorted(vfs.items()):
        if not content:
            continue
        for i, line in enumerate(content.split('\n'), 1):
            if pat.search(line):
                print(f'FINAL {os.path.relpath(p, DASH)}:{i}: {line.strip()[:140]}')
