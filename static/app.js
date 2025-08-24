/* CodeLintHub 2.0 UI + state + worker comms + report download (MIT)
   - Multi-language aware (auto-detect or explicit)
   - Python linting runs in-browser via WebWorker/Pyodide
   - Java/C++ use server fallback (see server/)
*/
const state = {
  files: [], // {name, type, size, content}
  results: { pylint: [], flake8: [], bandit: [], server: [] },
  errors: null,
  booted: false,
  running: false,
  report: null,
  selectedLanguage: 'auto'
};

const el = (sel) => document.querySelector(sel);
const els = (sel) => Array.from(document.querySelectorAll(sel));

const fileInput = el('#fileInput');
const filesList = el('#filesList');
const editor = el('#editor');
const runAllBtn = el('#runAllBtn');
const clearFilesBtn = el('#clearFilesBtn');
const runtimeStatus = el('#runtimeStatus');
const bootProgress = el('#bootProgress');
const toolSpinners = el('#toolSpinners');
const errorBox = el('#errorBox');
const errorText = el('#errorText');
const copyErrorBtn = el('#copyErrorBtn');
const retryBtn = el('#retryBtn');
const downloadReportBtn = el('#downloadReportBtn');
const langSelect = el('#langSelect');

const badgePylint = el('#badgePylint');
const badgeFlake8 = el('#badgeFlake8');
const badgeBandit = el('#badgeBandit');
const badgeServer = el('#badgeServer');

const panelPylint = el('#panelPylint');
const panelFlake8 = el('#panelFlake8');
const panelBandit = el('#panelBandit');
const panelServer = el('#panelServer');

// Tabs
els('.tab').forEach((t)=>{
  t.addEventListener('click', ()=>{
    els('.tab').forEach(x=>x.classList.remove('active'));
    els('.tab-panel').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.dataset.tab;
    el('#panel'+tab.charAt(0).toUpperCase()+tab.slice(1)).classList.add('active');
  });
});

// Editor formatting: wrap lines in spans to simulate line numbers via CSS
function renderEditorLines(){
  const text = editor.textContent.replace(/\r\n?/g,'\n');
  const lines = text.split('\n').map(l=>`<span class="line">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>`).join('\n');
  editor.innerHTML = lines;
  placeCaretAtEnd(editor);
}
function placeCaretAtEnd(elm){
  const range = document.createRange();
  range.selectNodeContents(elm);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
editor.addEventListener('input', ()=>{
  // lightweight debounce
  if (this._deb) clearTimeout(this._deb);
  this._deb = setTimeout(()=>renderEditorLines(), 250);
});

// File management
fileInput.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files);
  for (const f of files){
    const text = await f.text();
    state.files.push({ name: f.name, type: f.type || 'text', size: f.size, content: text });
  }
  renderFileList();
});

clearFilesBtn.addEventListener('click', ()=>{
  state.files = [];
  renderFileList();
});

function renderFileList(){
  filesList.innerHTML = '';
  if (state.files.length === 0){
    filesList.innerHTML = '<div class="empty">No uploaded files. Use "Upload Files" to add multiple files individually.</div>';
  } else {
    for (const f of state.files){
      const div = document.createElement('div');
      div.className = 'file-item';
      div.innerHTML = `
        <div class="meta">
          <span class="name">${f.name}</span>
          <span class="size">${(f.size/1024).toFixed(1)} KB</span>
          <span class="type">${f.type||'text'}</span>
        </div>
        <button class="remove">Remove</button>
      `;
      div.querySelector('.remove').addEventListener('click', ()=>{
        state.files = state.files.filter(x=>x!==f);
        renderFileList();
      });
      filesList.appendChild(div);
    }
  }
  runAllBtn.disabled = !state.booted;
}

// Worker boot
const worker = new Worker('static/worker.js');
worker.addEventListener('message', (e)=>{
  const { type, data } = e.data || {};
  if (type === 'boot-progress'){
    runtimeStatus.textContent = data.message;
    bootProgress.style.width = `${Math.floor(data.progress*100)}%`;
  }
  if (type === 'boot-done'){
    state.booted = true;
    runtimeStatus.textContent = 'Runtime ready. You can run linters.';
    runAllBtn.disabled = false;
  }
  if (type === 'run-status'){
    setToolSpinner(data.tool, data.state);
  }
  if (type === 'results'){
    state.results = data.results;
    state.report = buildReport(state);
    downloadReportBtn.disabled = false;
    renderResults();
    state.running = false;
    setAllToolSpinners('done');
  }
  if (type === 'error'){
    showError(data.error || 'Unknown error');
    state.running = false;
    setAllToolSpinners('');
  }
});

function setToolSpinner(tool, status){
  const node = toolSpinners.querySelector(`.tool[data-tool="${tool}"]`);
  if (!node) return;
  node.classList.remove('running','done');
  if (status==='running') node.classList.add('running');
  if (status==='done') node.classList.add('done');
}
function setAllToolSpinners(status){
  ['pylint','flake8','bandit','server'].forEach(t=>setToolSpinner(t,status));
}

// Kick off boot immediately (Python tooling only)
worker.postMessage({ type: 'boot' });

// Language selection
langSelect.addEventListener('change', (e)=>{
  state.selectedLanguage = e.target.value;
});

// Simple language auto-detect by file extension or content
function detectLanguage(files){
  if (state.selectedLanguage !== 'auto') return state.selectedLanguage;
  // check extensions first
  for (const f of files){
    const ext = (f.name || '').split('.').pop().toLowerCase();
    if (ext === 'py') return 'python';
    if (ext === 'mpy') return 'micropython';
    if (ext === 'java') return 'java';
    if (['c','cpp','cc','cxx','h','hpp'].includes(ext)) return 'cpp';
  }
  // fallback: look for typical keywords
  const text = (files.map(f=>f.content).join('\n') + '\n' + editor.textContent).toLowerCase();
  if (text.includes('import ') || text.includes('def ')) return 'python';
  if (text.includes('public static void main') || text.includes('package ')) return 'java';
  if (text.includes('#include') || text.includes('std::')) return 'cpp';
  return 'python';
}

// Run
runAllBtn.addEventListener('click', async ()=>{
  if (!state.booted || state.running) return;
  state.running = true;
  hideError();
  setAllToolSpinners('running');

  const filesPayload = [
    ...state.files,
    ...(editor.textContent.trim() ? [{ name: 'snippet.py', type: 'text/x-python', size: editor.textContent.length, content: editor.textContent.replace(/\r\n?/g,'\n') }] : [])
  ];

  const lang = detectLanguage(filesPayload);

  // If language is Java or C/C++, call server endpoint if available; otherwise show guidance
  if (['java','cpp'].includes(lang)){
    // notify server spinner
    setToolSpinner('server','running');
    try{
      const res = await fetch('/api/lint', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ files: filesPayload, language: lang }) });
      const data = await res.json();
      if (data.ok){
        state.results.server = data.results.server || [];
        state.report = buildReport(state);
        renderResults();
        setToolSpinner('server','done');
      } else {
        throw new Error(data.error || 'Server lint failed');
      }
    }catch(err){
      showError(String(err));
      setToolSpinner('server','');
    }
    state.running = false;
    setAllToolSpinners('done');
    return;
  }

  // Otherwise, run in-browser worker (Python)
  worker.postMessage({ type:'run', data: { files: filesPayload } });
});

retryBtn.addEventListener('click', ()=>{ hideError(); });
copyErrorBtn.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(errorText.textContent); }catch(e){} });

function showError(msg){ errorText.textContent = String(msg); errorBox.classList.remove('hidden'); }
function hideError(){ errorBox.classList.add('hidden'); }

function renderResults(){
  const { pylint, flake8, bandit, server } = state.results;
  badgePylint.textContent = pylint.length;
  badgeFlake8.textContent = flake8.length;
  badgeBandit.textContent = bandit.length;
  badgeServer.textContent = server.length || 0;

  panelPylint.innerHTML = renderIssuesList(pylint);
  panelFlake8.innerHTML = renderIssuesList(flake8);
  panelBandit.innerHTML = renderIssuesList(bandit);
  panelServer.innerHTML = renderIssuesList(server);
}

function sevClass(sev){
  if (!sev) return 'sev-info';
  if (sev === 'error' || sev === 'HIGH' || sev === 'E' || sev === 'F') return 'sev-error';
  if (sev === 'warning' || sev === 'MEDIUM' || sev === 'W') return 'sev-warning';
  return 'sev-info';
}
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function renderIssuesList(items){
  if (!items || !items.length) return '<div class="empty">No issues found.</div>';
  return items.map(it=>{
    const loc = `${it.file || 'unknown'}:${it.line || 0}:${it.col || 0}`;
    const code = it.code ? ` <code>${escapeHtml(it.code)}</code>` : '';
    return `<div class="result ${sevClass(it.severity)}">
      <div class="file">${escapeHtml(loc)}</div>
      <div class="msg">${escapeHtml(it.message)}${code}</div>
    </div>`;
  }).join('');
}

// Report download (JSON + Markdown)
function buildReport(state){
  const ts = new Date().toISOString();
  const res = state.results;
  const json = { generated_at: ts, language: state.selectedLanguage, totals: {
    pylint: res.pylint.length, flake8: res.flake8.length, bandit: res.bandit.length, server: res.server.length || 0
  }, results: res };
  const md = [
    `# CodeLintHub Report`,
    `Generated: ${ts}`,
    '',
    '## Totals',
    `- Pylint: ${res.pylint.length}`,
    `- Flake8: ${res.flake8.length}`,
    `- Bandit: ${res.bandit.length}`,
    `- Server: ${res.server.length || 0}`,
    '',
    '## Details',
    '### Pylint',
    ...res.pylint.map(i=>`- ${i.file}:${i.line}:${i.col} ${i.severity.toUpperCase()} ${i.code||''} — ${i.message}`),
    '',
    '### Flake8',
    ...res.flake8.map(i=>`- ${i.file}:${i.line}:${i.col} ${i.code||''} — ${i.message}`),
    '',
    '### Bandit',
    ...res.bandit.map(i=>`- ${i.file}:${i.line}:${i.col} ${i.severity} ${i.code||''} — ${i.message}`),
    '',
    '### Server (Java/C++)',
    ...res.server.map(i=>`- ${i.file}:${i.line}:${i.col} ${i.severity||''} ${i.code||''} — ${i.message}`)
  ].join('\n');
  return { json, md };
}

function download(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function safeTimestamp(){ return new Date().toISOString().replace(/[:.]/g,'-'); }

downloadReportBtn.addEventListener('click', ()=>{
  if (!state.report) return;
  const ts = safeTimestamp();
  download(new Blob([JSON.stringify(state.report.json,null,2)],{type:'application/json'}), `codelinthub-report-${ts}.json`);
  download(new Blob([state.report.md],{type:'text/markdown'}), `codelinthub-report-${ts}.md`);
});

// Initial render
renderFileList();
