// Applies supabase/migrations/*.sql to DATABASE_URL in order. Run: npm run db:migrate
// Each file runs once (tracked in raksha_migrations). Safe to re-run.
// Uses the direct connection (port 5432) if MIGRATION_DATABASE_URL is set, which Supabase
// recommends for DDL; otherwise DATABASE_URL.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (or MIGRATION_DATABASE_URL) first.");
  process.exit(1);
}

const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => undefined });

try {
  await sql`create table if not exists raksha_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from raksha_migrations`).map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(dir + file, "utf8"));
      await tx`insert into raksha_migrations (name) values (${file})`;
    });
    console.log(`→ applied ${file}`);
  }
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
