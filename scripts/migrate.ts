import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

const MIGRATION_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../database/migrations",
);
const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const LOCK_KEY = 1_389_845_761;

type MigrationFile = {
  name: string;
  sql: string;
  checksum: string;
};

async function loadMigrations(): Promise<MigrationFile[]> {
  const names = (await readdir(MIGRATION_DIRECTORY))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (names.length === 0) {
    throw new Error("No SQL migrations were found.");
  }

  const migrations: MigrationFile[] = [];
  for (const name of names) {
    if (!MIGRATION_NAME.test(name)) {
      throw new Error(`Invalid migration filename: ${name}`);
    }
    const sql = await readFile(path.join(MIGRATION_DIRECTORY, name), "utf8");
    if (!sql.trim()) {
      throw new Error(`Migration is empty: ${name}`);
    }
    migrations.push({
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }

  if (new Set(migrations.map((migration) => migration.name.slice(0, 4))).size !== migrations.length) {
    throw new Error("Migration version prefixes must be unique.");
  }
  return migrations;
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function applyMigrations(): Promise<void> {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "MIGRATION_DATABASE_URL is required. Do not use the restricted application DATABASE_URL.",
    );
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
    application_name: "synqforge-migration-runner",
  });
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await ensureMigrationTable(client);

    const migrations = await loadMigrations();
    const applied = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM public.schema_migrations ORDER BY version",
    );
    const appliedByName = new Map(applied.rows.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const previousChecksum = appliedByName.get(migration.name);
      if (previousChecksum) {
        if (previousChecksum.trim() !== migration.checksum) {
          throw new Error(
            `Checksum mismatch for applied migration ${migration.name}. Applied migrations are immutable; create a new migration instead.`,
          );
        }
        console.log(`SKIP ${migration.name} (already applied)`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        await client.query("COMMIT");
        console.log(`APPLIED ${migration.name}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }

    const unknownApplied = [...appliedByName.keys()].filter(
      (version) => !migrations.some((migration) => migration.name === version),
    );
    if (unknownApplied.length > 0) {
      throw new Error(
        `Database contains migrations absent from this checkout: ${unknownApplied.join(", ")}`,
      );
    }
    console.log("Migration run completed.");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

applyMigrations().catch((error: unknown) => {
  console.error("Migration run failed:", error);
  process.exitCode = 1;
});
