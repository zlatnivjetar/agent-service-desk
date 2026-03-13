/**
 * Creates BetterAuth tables on Neon (user, account, session, verification).
 *
 * Run once after db-push:
 *   just db-auth-migrate
 *
 * Uses auth.runMigrations() from BetterAuth's Kysely adapter.
 */
// Run from web/: cd web && npx tsx --env-file=.env.local ../seed/migrate_auth.ts
import { auth } from "../web/src/lib/auth";

async function main() {
  // $context is BetterAuth's internal context object (a Promise), which has runMigrations()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = await (auth as any).$context;
  await ctx.runMigrations();
  console.log("BetterAuth tables migrated successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
