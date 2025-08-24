# Minimal server-side linter runner.
# This runs system tools (clang-tidy, checkstyle, pylint, flake8, bandit).
# You should run this in a sandboxed environment (container) with timeouts.
import tempfile, os, json, subprocess, shlex
from pathlib import Path

PYLINT_ARGS = ["pylint", "--score=n", "--reports=n", "--output-format=json"]
FLAKE8_ARGS = ["flake8"]
BANDIT_ARGS = ["bandit", "-q", "-f", "json"]
CHECKSTYLE_CMD = ["checkstyle", "-f", "xml"]  # assume checkstyle installed
CLANG_TIDY_CMD = ["clang-tidy", "--quiet"]   # assume clang-tidy installed

TIMEOUT = int(os.environ.get("LINT_TIMEOUT", "25"))

def _write_files(files):
    tmp = tempfile.TemporaryDirectory()
    base = Path(tmp.name)
    paths = []
    for f in files:
        name = os.path.basename(f.get('name') or 'snippet.py')
        p = base / name
        p.write_text(f.get('content') or '', encoding='utf-8')
        paths.append(str(p))
    return tmp, paths

def _run(cmd, cwd=None):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=TIMEOUT)
    return proc.returncode, proc.stdout, proc.stderr

def run_flake8(paths):
    code, out, err = _run(FLAKE8_ARGS + paths)
    res = []
    for line in out.splitlines():
        try:
            head, message = line.split(" ", 1)
            path, line_no, col_no, code = head.split(":")
            res.append({
                "file": os.path.basename(path),
                "line": int(line_no),
                "col": int(col_no),
                "code": code.strip(),
                "message": message.strip(),
                "severity": "error" if code.startswith(("E","F")) else "warning" if code.startswith("W") else "info",
            })
        except Exception:
            continue
    return res

def run_pylint(paths):
    code, out, err = _run(PYLINT_ARGS + paths)
    try:
        data = json.loads(out or "[]")
    except Exception:
        data = []
    res = []
    for item in data:
        res.append({
            "file": os.path.basename(item.get("path") or "unknown"),
            "line": int(item.get("line",0)),
            "col": int(item.get("column",0)),
            "code": item.get("symbol") or item.get("message-id"),
            "message": item.get("message",""),
            "severity": "error" if item.get("type") in ("error","fatal") else "warning" if item.get("type")=="warning" else "info",
        })
    return res

def run_bandit(paths):
    code, out, err = _run(BANDIT_ARGS + paths)
    res = []
    try:
        data = json.loads(out or "{}")
        for issue in data.get("results", []):
            res.append({
                "file": os.path.basename(issue.get("filename","unknown")),
                "line": int(issue.get("line_number",0)),
                "col": int(issue.get("col_offset",0)),
                "code": issue.get("test_id"),
                "message": issue.get("issue_text",""),
                "severity": issue.get("issue_severity","INFO")
            })
    except Exception:
        pass
    return res

def run_checkstyle(paths):
    # simplistic: call checkstyle per file and parse XML if available
    res = []
    for p in paths:
        try:
            code, out, err = _run(CHECKSTYLE_CMD + [p])
            # parsing left as exercise — include raw output
            res.append({"file": os.path.basename(p), "line": 0, "col": 0, "code": "CHECKSTYLE", "message": out.strip() or err.strip(), "severity": "info"})
        except Exception as e:
            res.append({"file": os.path.basename(p), "line": 0, "col": 0, "code": "CHECKSTYLE_ERROR", "message": str(e), "severity": "error"})
    return res

def run_clang_tidy(paths):
    res = []
    for p in paths:
        try:
            code, out, err = _run(CLANG_TIDY_CMD + [p, "--"])
            # crude parse: return raw output
            if out.strip() or err.strip():
                res.append({"file": os.path.basename(p), "line": 0, "col": 0, "code": "CLANG_TIDY", "message": out.strip() or err.strip(), "severity": "info"})
        except Exception as e:
            res.append({"file": os.path.basename(p), "line": 0, "col": 0, "code": "CLANG_TIDY_ERROR", "message": str(e), "severity": "error"})
    return res

def run_all_linters(files, language='auto'):
    tmp, paths = _write_files(files)
    try:
        results = {}
        if language in ('auto','python','micropython'):
            results['flake8'] = run_flake8(paths)
            results['pylint'] = run_pylint(paths)
            results['bandit'] = run_bandit(paths)
        if language in ('java',):
            results['server'] = run_checkstyle(paths)
        if language in ('cpp','c'):
            results['server'] = run_clang_tidy(paths)
        return results
    finally:
        tmp.cleanup()
