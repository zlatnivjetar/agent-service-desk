dev-web:
    cd web && npm run dev

dev-api:
    cd api && .venv/Scripts/uvicorn app.main:app --reload --port 8000

db-push:
    psql $DATABASE_URL -f seed/schema.sql

db-seed:
    cd seed && python seed.py

db-reset:
    psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    just db-push
    just db-seed
