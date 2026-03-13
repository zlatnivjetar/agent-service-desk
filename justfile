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

# Create BetterAuth tables on Neon (run once after db-push)
db-auth-migrate:
    cd web && npx tsx --env-file=.env.local ../seed/migrate_auth.ts

# Seed the 3 demo users into BetterAuth (run after db-auth-migrate)
db-seed-auth:
    cd web && npx tsx --env-file=.env.local ../seed/demo_auth.ts
