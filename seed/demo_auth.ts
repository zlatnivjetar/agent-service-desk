/**
 * Creates the 3 demo users in BetterAuth's tables so they can log in.
 *
 * Run after `just db-auth-migrate`:
 *   just db-seed-auth
 *
 * Requires DATABASE_URL and BETTER_AUTH_SECRET in web/.env.local.
 * The script is executed from the web/ directory so those env vars are loaded.
 */
// Run from web/: cd web && npx tsx --env-file=.env.local ../seed/demo_auth.ts
// The import resolves relative to this file's location (seed/), so:
import { auth } from "../web/src/lib/auth";

const DEMO_USERS = [
  { email: "agent@demo.com", password: "agent123", name: "Alex Agent" },
  { email: "lead@demo.com", password: "lead123", name: "Lee Lead" },
  { email: "client@demo.com", password: "client123", name: "Chris Client" },
];

async function main() {
  for (const user of DEMO_USERS) {
    try {
      const result = await auth.api.signUpEmail({ body: user });
      console.log(`✓ ${user.email}  id=${result.user.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Duplicate email is fine — user already exists from a previous run
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        console.log(`- ${user.email}  (already exists, skipping)`);
      } else {
        console.error(`✗ ${user.email}  ${msg}`);
      }
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
