# Web — Next.js Frontend

## Design System

`design-system/agent-service-desk/MASTER.md` is the source of truth for colors, typography, spacing, shadows, and component specs. Read it at the start of every frontend session.

Page overrides in `design-system/agent-service-desk/pages/` exist but contain generic landing-page patterns — ignore their section orders and CTA placements. Use only their layout/density overrides when relevant.

Palette: Teal primary (#0D9488), orange accent (#F97316), slate text (#0F172A), light background (#F8FAFC). Font: Inter.

## Key Patterns

* **Auth cookie:** BetterAuth uses `__Secure-better-auth.session_token` on HTTPS — middleware (`src/proxy.ts`) checks both prefixed and unprefixed names
* **API calls:** all requests go through `src/lib/api-client.ts` — it fetches a JWT from `/api/token` and attaches it as `Authorization: Bearer`
* **Data fetching:** TanStack Query hooks in `src/hooks/` — one hook per resource, all use `apiClient`
* **Role gating:** `client\_user` sees own org only; `support\_agent` sees workspace; `team\_lead` sees everything + eval console

## Structure

```
src/
├── app/            # Next.js App Router pages
│   ├── (app)/      # Authenticated layout (sidebar, breadcrumb)
│   ├── api/        # API routes (auth, token)
│   └── login/      # Login page
├── components/     # UI components (shadcn/ui + custom)
├── hooks/          # TanStack Query data hooks
├── lib/            # api-client, auth, auth-client, utils
└── types/          # Shared TypeScript types
```
