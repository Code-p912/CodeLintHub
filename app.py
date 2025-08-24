from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from lint_utils import run_all_linters

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": os.environ.get("CORS_ALLOW","*")}})

@app.post('/api/lint')
def api_lint():
    try:
        payload = request.get_json(force=True)
        files = payload.get('files', [])
        language = payload.get('language', 'auto')
        results = run_all_linters(files, language=language)
        return jsonify({"ok": True, "results": results})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8000)))
