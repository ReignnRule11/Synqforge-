import "server-only";
import type { PoolClient } from "pg";
import { auth } from "../../../auth";
import { withVerifiedSessionTransaction } from "./session-db-boundary";
import { getRuntimePool } from "../db/pool";
import { withAuthenticatedUserTransaction } from "../db/runtime";

/**
 * Server-only database entry point for the current authenticated user.
 * Identity is derived from Auth.js auth(); callers cannot supply a user ID.
 */
export async function withCurrentUserTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withVerifiedSessionTransaction(
    async () => auth(),
    (verifiedUserId, callback) =>
      withAuthenticatedUserTransaction(getRuntimePool(), verifiedUserId, callback),
    () => work as unknown as () => Promise<T>,
  );
}
