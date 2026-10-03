import { isDemoMode, isProduction, isTest, serverEnv } from "@/lib/env";
import { MemoryRepository } from "./memory";
import { PostgresRepository } from "./postgres";
import type { Repository } from "./repository";

export type { Repository } from "./repository";

const globalForDb = globalThis as unknown as { __rakshaRepo?: Repository };

/**
 * Returns the process-wide repository.
 * - DATABASE_URL set → PostgreSQL (Supabase).
 * - Otherwise → in-memory store, allowed only in development, tests and demo mode.
 */
export function getRepository(): Repository {
  if (globalForDb.__rakshaRepo) return globalForDb.__rakshaRepo;

  const url = serverEnv.databaseUrl();
  let repo: Repository;
  if (url && !isTest()) {
    repo = new PostgresRepository(url);
  } else {
    if (isProduction() && !isDemoMode() && !process.env.RAKSHA_ALLOW_MEMORY_DB) {
      throw new Error("DATABASE_URL is required in production. Set NEXT_PUBLIC_DEMO_MODE=true for a demo deployment.");
    }
    const persist =
      !isTest() && !process.env.VERCEL && process.env.RAKSHA_MEMORY_PERSIST !== "false" ? `${process.cwd()}/.data/dev-db.json` : null;
    repo = new MemoryRepository(persist);
  }
  globalForDb.__rakshaRepo = repo;
  return repo;
}

/** Test helper: swap in a fresh repository. */
export function setRepository(repo: Repository) {
  globalForDb.__rakshaRepo = repo;
}
