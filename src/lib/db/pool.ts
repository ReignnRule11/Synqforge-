import "server-only";
import { Pool } from "pg";

let runtimePool: Pool | undefined;

/**
 * The application DATABASE_URL must identify the restricted synqforge_app
 * runtime login. Never use an administrative/migration credential here.
 */
export function getRuntimePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for server-side database access.");
  }

  if (!runtimePool) {
    runtimePool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return runtimePool;
}
