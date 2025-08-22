/* CodeLintHub UI + state + worker comms + report download (MIT) */
const state = {
  files: [], // {name, type, size, content}
  results: { pylint: [], flake8: [], bandit: [] },
  errors: null,
  booted: false,
  running: false,
  report: null,
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

const badgePylint = el('#badgePylint');
const badgeFlake8 = el('#badgeFlake8');
const badgeBandit = el('#badgeBandit');

const panelPylint = el('#panelPylint');
const panelFlake8 = el('#panelFlake8');
const panelBandit = el('#panelBandit');

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
  // debounced rerender
});

// File management
fileInput.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files);
  for (const f of files){
    const text = await f.text();
    state.files.push({ name: f.name, type: f.type || 'text/x-python', size: f.size, content: text });
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
  ['pylint','flake8','bandit'].forEach(t=>setToolSpinner(t,status));
}

// Kick off boot immediately
worker.postMessage({ type: 'boot' });

// Run
runAllBtn.addEventListener('click', ()=>{
  if (!state.booted || state.running) return;
  state.running = true;
  hideError();
  setAllToolSpinners('running');

  const payload = {
    files: [
      // Uploaded files first
      ...state.files,
      // Editor snippet as a virtual file if any
      ...(editor.textContent.trim() ? [{ name: 'snippet.py', type: 'text/x-python', size: editor.textContent.length, content: editor.textContent.replace(/\r\n?/g,'\n') }] : [])
    ]
  };
  worker.postMessage({ type:'run', data: payload });
});

retryBtn.addEventListener('click', ()=>{
  hideError();
});
copyErrorBtn.addEventListener('click', async ()=>{
  try{ await navigator.clipboard.writeText(errorText.textContent); }catch(e){}
});

function showError(msg){
  errorText.textContent = String(msg);
  errorBox.classList.remove('hidden');
}
function hideError(){
  errorBox.classList.add('hidden');
}

function renderResults(){
  const { pylint, flake8, bandit } = state.results;
  badgePylint.textContent = pylint.length;
  badgeFlake8.textContent = flake8.length;
  badgeBandit.textContent = bandit.length;

  panelPylint.innerHTML = renderIssuesList(pylint);
  panelFlake8.innerHTML = renderIssuesList(flake8);
  panelBandit.innerHTML = renderIssuesList(bandit);
}

function sevClass(sev){
  if (sev === 'error' || sev === 'HIGH' || sev === 'E' || sev === 'F') return 'sev-error';
  if (sev === 'warning' || sev === 'MEDIUM' || sev === 'W') return 'sev-warning';
  return 'sev-info';
}
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
}
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
  const json = { generated_at: ts, totals: {
    pylint: res.pylint.length, flake8: res.flake8.length, bandit: res.bandit.length
  }, results: res };
  const md = [
    `# CodeLintHub Report`,
    `Generated: ${ts}`,
    '',
    '## Totals',
    `- Pylint: ${res.pylint.length}`,
    `- Flake8: ${res.flake8.length}`,
    `- Bandit: ${res.bandit.length}`,
    '',
    '## Details',
    '### Pylint',
    ...res.pylint.map(i=>`- ${i.file}:${i.line}:${i.col} ${i.severity.toUpperCase()} ${i.code||''} — ${i.message}`),
    '',
    '### Flake8',
    ...res.flake8.map(i=>`- ${i.file}:${i.line}:${i.col} ${i.code||''} — ${i.message}`),
    '',
    '### Bandit',
    ...res.bandit.map(i=>`- ${i.file}:${i.line}:${i.col} ${i.severity} ${i.code||''} — ${i.message}`)
  ].join('\n');
  return { json, md };
}

function download(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function safeTimestamp(){
  return new Date().toISOString().replace(/[:.]/g,'-');
}

downloadReportBtn.addEventListener('click', ()=>{
  if (!state.report) return;
  const ts = safeTimestamp();
  download(new Blob([JSON.stringify(state.report.json,null,2)],{type:'application/json'}), `codelinthub-report-${ts}.json`);
  download(new Blob([state.report.md],{type:'text/markdown'}), `codelinthub-report-${ts}.md`);
});

// Initial render
renderFileList();
