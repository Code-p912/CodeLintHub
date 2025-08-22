document.getElementById('lintForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  document.getElementById('loading').style.display = 'block';
  document.getElementById('results').style.display = 'none';

  const response = await fetch('/lint', {
    method: 'POST',
    body: formData
  });
  const results = await response.json();
  window.lintResults = results;

  document.getElementById('loading').style.display = 'none';
  document.getElementById('results').style.display = 'block';

  updateTabContent('pylint', results['pylint']);

  document.querySelectorAll('.tab-links li').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-links li').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updateTabContent(tab.dataset.tool, results[tab.dataset.tool]);
    };
  });
});

function updateTabContent(tool, data) {
  const contentDiv = document.querySelector('.tab-content');
  let text = '';
  for (const file in data) {
    text += `### ${file}\n${data[file]}\n\n`;
  }
  contentDiv.textContent = text;
}

document.getElementById('downloadReport').addEventListener('click', async () => {
  const response = await fetch('/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results: window.lintResults })
  });
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lint_report.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
});
