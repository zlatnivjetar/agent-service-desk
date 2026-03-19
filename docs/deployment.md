# Deployment Guide

## Overview

- **Frontend (Next.js):** Vercel
- **Backend (FastAPI):** Railway
- **Database:** Neon (Postgres 16 + pgvector)
- **Cache / Queue:** Upstash Redis

---

## Prerequisites

- Neon project with the schema pushed (`just db-push`)
- Upstash Redis instance created
- OpenAI API key
- GitHub repo connected to both Vercel and Railway

---

## Step 1: Deploy the API to Railway

### Create the Railway project

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select the `agent-service-desk` repo
3. Set the **Root Directory** to `api/`
4. Railway will detect `nixpacks.toml` and build automatically

### Set Railway environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (pooled, `?sslmode=require`) |
| `REDIS_URL` | Upstash Redis URL (`rediss://...`) |
| `OPENAI_API_KEY` | Your OpenAI key |
| `JWT_SECRET` | A long random secret (must match Vercel's `JWT_SECRET`) |
| `CORS_ORIGINS` | `["https://<your-vercel-domain>.vercel.app"]` |
| `ENVIRONMENT` | `production` |

> `CORS_ORIGINS` must be a valid JSON array string. Railway env vars are plain strings, and the API validator handles JSON parsing.

### Verify the Railway deploy

Once deployed, visit `https://<railway-domain>/health`. Expected response:

```json
{
  "status": "ok",
  "database": "connected",
  "version": "0.1.0",
  "environment": "production"
}
```

Note your Railway domain — you'll need it for Vercel's `NEXT_PUBLIC_API_URL`.

---

## Step 2: Deploy the Frontend to Vercel

### Create the Vercel project

1. Go to [vercel.com](https://vercel.com) → New Project → Import Git Repository
2. Select the `agent-service-desk` repo
3. Set the **Root Directory** to `web/`
4. Vercel reads `web/vercel.json` — framework, build command, and output directory are pre-configured

### Set Vercel environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | Same Neon connection string |
| `BETTER_AUTH_SECRET` | A long random secret |
| `BETTER_AUTH_URL` | `https://<your-vercel-domain>.vercel.app` |
| `JWT_SECRET` | Same value as Railway's `JWT_SECRET` |
| `NEXT_PUBLIC_API_URL` | `https://<your-railway-domain>` |

### Verify the Vercel deploy

Open the Vercel URL in your browser. You should reach the login page.

---

## Step 3: Push the Database Schema

Run from the repo root (requires `api/.env.local` with `DATABASE_URL`):

```bash
just db-push
```

Or directly:

```bash
cd api && python ../seed/push_schema.py
```

This is idempotent — safe to re-run.

---

## Step 4: Seed Demo Data

```bash
cd api && python ../seed/demo_accounts.py
```

This creates the three demo users:

| Role | Email | Password |
|---|---|---|
| Support Agent | agent@demo.com | agent123 |
| Team Lead | lead@demo.com | lead123 |
| Client User | client@demo.com | client123 |

To seed the full dataset (100 orgs, 15K tickets, etc.):

```bash
cd api && python ../seed/seed.py
```

---

## Environment Variable Reference

### Backend (Railway)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Neon pooled connection string |
| `REDIS_URL` | Yes | Upstash Redis URL |
| `OPENAI_API_KEY` | Yes | Used for embeddings, triage, drafting |
| `JWT_SECRET` | Yes | Must match frontend |
| `CORS_ORIGINS` | Yes | JSON array string of allowed origins |
| `ENVIRONMENT` | No | Defaults to `development` |
| `MOCK_AI` | No | Set to `1` to skip OpenAI calls (testing) |

### Frontend (Vercel)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Used by BetterAuth for session storage |
| `BETTER_AUTH_SECRET` | Yes | BetterAuth signing secret |
| `BETTER_AUTH_URL` | Yes | Full URL of this Vercel deployment |
| `JWT_SECRET` | Yes | Must match backend |
| `NEXT_PUBLIC_API_URL` | Yes | Full URL of the Railway API |

---

## CORS Configuration

The API's `cors_origins` setting controls which origins can call the API.

**Local development** (`api/.env.local`):
```
CORS_ORIGINS=["http://localhost:3000"]
```

**Production** (Railway env var):
```
CORS_ORIGINS=["https://your-app.vercel.app"]
```

The `field_validator` in `config.py` handles parsing this JSON string automatically.

If you see CORS errors in the browser:
1. Check that `CORS_ORIGINS` in Railway matches the exact Vercel URL (no trailing slash)
2. Redeploy the Railway service after changing the variable

---

## Health Check Endpoint

Both Railway and Vercel can use `GET /health` for health checks.

Railway: set the health check path to `/health` in service settings.

---

## Troubleshooting

**CORS errors in browser**
- Verify `CORS_ORIGINS` in Railway matches the Vercel URL exactly
- Check the API response headers include `Access-Control-Allow-Origin`

**JWT validation failures (401 errors)**
- Confirm `JWT_SECRET` is identical in both Railway and Vercel env vars
- JWT tokens are HS256-signed; algorithm must match on both sides

**Neon connection drops / timeout**
- Use the **pooled** Neon connection string (port 5432 via PgBouncer), not the direct connection
- Neon scales to zero on the free plan — the first request after idle may be slow

**Railway build fails**
- Check that `nixpacks.toml` specifies `python312` (Nix package name)
- Ensure `pyproject.toml` is present in the `api/` root so `pip install -e .` succeeds

**`npm run build` fails on Vercel**
- Verify all `NEXT_PUBLIC_*` variables are set in Vercel (they're inlined at build time)
- Run `npm run build` locally from `web/` first to catch TypeScript errors
