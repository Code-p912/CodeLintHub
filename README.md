# CodeLintHub 2.0

**Source-available (All Rights Reserved)**

Run **pylint**, **flake8**, and **bandit** right in your browser via **Pyodide/WASM**. Paste code or upload files, view results per tool, and download timestamped JSON/Markdown reports. Mobile-first UI with clear boot progress and per-tool spinners.

> If you have any issues, email **nyxara.dev@gmail.com**.

## Features
- 100% static by default (can host on GitHub Pages).
- In-browser execution with Pyodide (privacy: your code stays local).
- Linters: **pylint**, **flake8**, **bandit**.
- Multiple file uploads + quick snippet editor.
- Tabbed results with badges and color-coded severities.
- One-click **Report** download (JSON + Markdown).

## Quick Start (Static)
1. Clone/download this repository.
2. Open `index.html` in your browser (or serve the folder with any static server).
3. Paste code or upload `.py` files, then click **Run Linters**.

## Optional Server Mode
For large projects, use the included Flask API. See `server/DEPLOY.md` for deployment and switch the frontend worker to call `/api/lint`.

## License
**All Rights Reserved – Source Available.**  
This source code is provided for viewing and reference only.  
No permission is granted to use, copy, modify, merge, publish, distribute, sublicense, or sell this software, in whole or in part, without prior written authorization from the copyright holder.

For questions or permissions, contact **nyxara.dev@gmail.com**.
