/* Pyodide boot + Python linter runners (A: static) — MIT
   Notes:
   - Runs Python linters (pylint, flake8, bandit) in-browser via Pyodide.
   - For Java/C++ we recommend using /api/lint server (see server/).
*/
let pyodide = null;
let booted = false;

function post(type, data){ self.postMessage({ type, data }); }

self.onmessage = async (e)=>{
  const { type, data } = e.data || {};
  if (type === 'boot'){
    try{ await boot(); post('boot-done', { ok:true }); }catch(err){ post('error', { error: String(err.stack||err) }); }
  }
  if (type === 'run'){
    try{ const results = await runLinters(data.files||[]); post('results', { results }); }catch(err){ post('error', { error: String(err.stack||err) }); }
  }
};

async function boot(){
  if (booted) return;
  post('boot-progress', { message:'Loading Pyodide…', progress: 0.05 });
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js');
  pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/' });
  post('boot-progress', { message:'Installing Python linters (this may take a minute on first load)…', progress: 0.15 });

  const code = `
import sys, io, json, os
import micropip
packages = [
  'flake8==6.1.0', 'mccabe==0.7.0', 'pycodestyle==2.11.1', 'pyflakes==3.1.0',
  'bandit==1.7.9',
  'pylint==3.2.6', 'astroid==3.2.4'
]
async def install_all():
  for pkg in packages:
    try:
      await micropip.install(pkg)
    except Exception:
      pass
await install_all()

def write_files(files):
  base = '/work'
  try:
    os.makedirs(base, exist_ok=True)
  except Exception:
    pass
  paths = []
  for f in files:
    name = f.get('name') or 'snippet.py'
    name = os.path.basename(name)
    p = f"{base}/{name}"
    with open(p,'w',encoding='utf-8',newline='') as fh:
      fh.write(f.get('content') or '')
    paths.append(p)
  return base, paths

def run_flake8(paths):
  from flake8.api import legacy as flake8
  results = []
  style_guide = flake8.get_style_guide()
  report = style_guide.check_files(paths)
  app = report._application
  if hasattr(app, 'file_checker_manager'):
    for checker in app.file_checker_manager.checkers:
      filename = checker.display_name
      for (line_number, offset, code, text, physical_line) in getattr(checker, 'results', []):
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
  bconf = BanditConfig()
  manager = BanditManager(bconf, 'file', False)
  manager.discover_files(paths, True)
  manager.run_tests()
  res = []
  for issue in manager.get_issue_list(sev_level=constants.LOW, conf_level=constants.LOW):
    res.append({
      'file': os.path.basename(issue.fname),
      'line': int(issue.lineno or 0),
      'col': int(getattr(issue, 'col_offset', 0) or 0),
      'code': issue.test_id,
      'message': issue.text,
      'severity': str(issue.severity)
    })
  return res

def run_pylint(paths):
  import io, sys, json
  try:
    from pylint.lint import Run
    from pylint.reporters.json_reporter import JSONReporter
  except Exception:
    return []
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
  for item in data:
    res.append({
      'file': os.path.basename(item.get('path') or item.get('module') or 'unknown'),
      'line': int(item.get('line',0)),
      'col': int(item.get('column',0)),
      'code': item.get('symbol') or item.get('message-id'),
      'message': item.get('message',''),
      'severity': 'error' if (item.get('type') in ('error','fatal')) else 'warning' if item.get('type')=='warning' else 'info'
    })
  return res
`;

  await pyodide.runPythonAsync(code);
  booted = true;
  post('boot-progress', { message:'Packages ready. Warming up…', progress: 0.95 });
}

async function runLinters(files){
  if (!booted) throw new Error('Runtime not ready');

  post('run-status', { tool: 'flake8', state: 'running' });
  const flake8 = await pyodide.runPythonAsync(`
base, paths = write_files(${JSON.stringify(files)})
run_flake8(paths)
  `);
  post('run-status', { tool: 'flake8', state: 'done' });

  post('run-status', { tool: 'bandit', state: 'running' });
  const bandit = await pyodide.runPythonAsync(`
base, paths = write_files(${JSON.stringify(files)})
run_bandit(paths)
  `);
  post('run-status', { tool: 'bandit', state: 'done' });

  post('run-status', { tool: 'pylint', state: 'running' });
  const pylint = await pyodide.runPythonAsync(`
base, paths = write_files(${JSON.stringify(files)})
run_pylint(paths)
  `);
  post('run-status', { tool: 'pylint', state: 'done' });

  // Ensure JS-friendly objects
  return {
    pylint: Array.from(pylint || []),
    flake8: Array.from(flake8 || []),
    bandit: Array.from(bandit || [])
  };
}
