import type { Pool, PoolClient } from "pg";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Use only with a user ID derived from a verified server-side auth session.
 * Never pass identity from request payloads, query params, or client storage.
 */
export async function withAuthenticatedUserTransaction<T>(
  pool: Pool,
  verifiedUserId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(verifiedUserId)) {
    throw new Error("A verified authenticated user UUID is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE synqforge_app");
    await client.query("SELECT set_config('app.user_id', $1, true)", [verifiedUserId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original transaction failure.
    }
    throw error;
  } finally {
    client.release();
  }
}
