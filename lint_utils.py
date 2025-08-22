import subprocess
import json
import tempfile
import os

def run_command(cmd):
    try:
        output = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        return output.stdout or output.stderr
    except Exception as e:
        return str(e)

def run_linters(code_snippet, file_paths):
    results = {'pylint': {}, 'flake8': {}, 'bandit': {}}

    temp_files = []
    if code_snippet.strip():
        fd, temp_path = tempfile.mkstemp(suffix=".py")
        with os.fdopen(fd, 'w') as tmp:
            tmp.write(code_snippet)
        temp_files.append(temp_path)
        file_paths.append(temp_path)

    for path in file_paths:
        results['pylint'][path] = run_command(['pylint', path])
        results['flake8'][path] = run_command(['flake8', path])
        results['bandit'][path] = run_command(['bandit', '-r', path])

    # Clean up temp files
    for f in temp_files:
        os.remove(f)

    return results

def create_report(results):
    report = "# CodeLintHub Report\n\n"
    for tool, files in results.items():
        report += f"## {tool.upper()}\n"
        for file, output in files.items():
            report += f"### {file}\n```\n{output}\n```\n\n"

    path = os.path.join(tempfile.gettempdir(), "lint_report.md")
    with open(path, "w") as f:
        f.write(report)
    return path
