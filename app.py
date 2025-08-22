from flask import Flask, render_template, request, send_file, jsonify
import os
from lint_utils import run_linters, create_report
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/lint', methods=['POST'])
def lint_code():
    code = request.form.get('code')
    uploaded_files = request.files.getlist('files')
    file_paths = []

    # Save uploaded files securely
    for f in uploaded_files:
        if f.filename:
            filename = secure_filename(f.filename)
            path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            f.save(path)
            file_paths.append(path)

    results = run_linters(code, file_paths)
    return jsonify(results)

@app.route('/download', methods=['POST'])
def download_report():
    results = request.json.get('results')
    report_path = create_report(results)
    return send_file(report_path, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=False)
