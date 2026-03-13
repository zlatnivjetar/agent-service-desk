dev-web:
    cd web && npm run dev

dev-api:
    cd api && .venv/Scripts/uvicorn app.main:app --reload --port 8000

db-push:
    cd seed && python push_schema.py

db-seed:
    cd seed && python seed.py

db-demo:
    cd seed && python demo_accounts.py

db-verify:
    cd seed && python verify.py

db-reset:
    cd seed && python reset_db.py
    just db-push
    just db-seed
    just db-demo
