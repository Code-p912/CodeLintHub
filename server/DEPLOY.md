# Server Mode Deployment

Optional: only if you want Java/C++ linting or prefer server execution.

## Render / Railway / Fly.io
- Build command: `pip install -r requirements.txt`
- Start command: `python app.py`
- Set `CORS_ALLOW` to your front-end domain (or `*` for testing)

## Local
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export CORS_ALLOW="*"
python app.py

## Frontend switch
The frontend already calls `/api/lint` for Java/C++ when detected. Host `app.py` at same origin or set CORS.
