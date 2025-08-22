/* Pyodide boot + linter runners (A: 100% static) — MIT */
let pyodide = null;
let booted = false;

function post(type, data){
  self.postMessage({ type, data });
}

self.onmessage = async (e)=>{
  const { type, data } = e.data || {};
  if (type === 'boot'){
    try{
      await boot();
      post('boot-done', { ok:true });
    }catch(err){
      post('error', { error: String(err.stack||err) });
    }
  }
  if (type === 'run'){
    try{
      const results = await runLinters(data.files||[]);
      post('results', { results });
    }catch(err){
      post('error', { error: String(err.stack||err) });
    }
  }
};

async function boot(){
  if (booted) return;
  post('boot-progress', { message:'Loading Pyodide…', progress: 0.05 });
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js');
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/'
  });
  post('boot-progress', { message:'Installing packages (this may take a minute on first load)…', progress: 0.15 });

  const code = `
import sys, io, json, types
from pyodide.http import pyfetch
import micropip

# Speed tip: these are all pure-Python wheels and cache after first load
packages = [
  'flake8==6.1.0', 'mccabe==0.7.0', 'pycodestyle==2.11.1', 'pyflakes==3.1.0',
  'bandit==1.7.9',
  'pylint==3.2.6', 'astroid==3.2.4', 'isort==5.13.2'
]

async def install_all():
  for i, pkg in enumerate(packages):
    try:
      await micropip.install(pkg)
    except Exception as e:
      # proceed; some deps may already be present
      pass

await install_all()

# Utility functions to run linters
import os

def write_files(files):
  # create a base working dir
  base = '/work'
  try:
    os.makedirs(base, exist_ok=True)
  except Exception: pass
  paths = []
  for f in files:
    name = f.get('name') or 'snippet.py'
    # ensure only filename
    name = os.path.basename(name)
    p = f"{base}/{name}"
    with open(p,'w',encoding='utf-8',newline='') as fh:
      fh.write(f.get('content') or '')
    paths.append(p)
  return base, paths


def run_flake8(paths):
  from flake8.api import legacy as flake8
  from flake8.formatting.default import Default
  import sys, io
  buf = io.StringIO()
  style_guide = flake8.get_style_guide()
  report = style_guide.check_files(paths)
  # Default formatter writes to stdout; we instead build from report
  results = []
  for s in report.get_statistics(''): # forces stats collection
    pass
  # flake8 doesn't easily expose all results; parse from report._application.guide._file_checker_manager
  app = report._application
  if hasattr(app, 'file_checker_manager'):
    for checker in app.file_checker_manager.checkers:
      filename = checker.display_name
      for (line_number, offset, code, text, physical_line) in checker.results:
        results.append({
          'file': os.path.basename(filename),
          'line': int(line_number),
          'col': int(offset),
          'code': code,
          'message': text,
          'severity': 'warning' if code.startswith(('W','C','N','D')) else 'error' if code.startswith(('E','F')) else 'info'
        })
  return results


def run_bandit(paths):
  from bandit.core.manager import BanditManager
  from bandit.core.config import BanditConfig
  from bandit.core import constants
  from bandit.core.metrics import Metrics
  from bandit.core.node_visitor import BanditNodeVisitor
  from bandit.core import tester as bandit_tester
  import json

  bconf = BanditConfig()
  manager = BanditManager(bconf, 'file', False)
  manager.discover_files(paths, True)
  manager.run_tests()
  res = []
  for issue in manager.get_issue_list(sev_level=constants.LOW, conf_level=constants.LOW):
    res.append({
      'file': os.path.basename(issue.fname),
      'line': int(issue.lineno or 0),
      'col': int(issue.col_offset or 0),
      'code': issue.test_id,
      'message': issue.text,
      'severity': str(issue.severity)
    })
  return res


def run_pylint(paths):
  import io, sys, json
  from pylint.lint import Run
  try:
    from pylint.reporters.json_reporter import JSONReporter
  except Exception:
    from pylint.reporters.json import JSONReporter
  buf = io.StringIO()
  reporter = JSONReporter(output=buf)
  argv = ['--score=n', '--reports=n'] + paths
  try:
    Run(argv, reporter=reporter, do_exit=False)
  except SystemExit:
    pass
  try:
    data = json.loads(buf.getvalue() or '[]')
  except Exception:
    data = []
  res = []

