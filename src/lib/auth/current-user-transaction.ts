import type { Pool, PoolClient } from "pg";
import { withVerifiedSessionTransaction } from "./session-db-boundary";

type SessionLike = {
  user?: { id?: unknown } | null;
} | null | undefined;

type TransactionRunner = <T>(
  pool: Pool,
  verifiedUserId: string,
  work: (client: PoolClient) => Promise<T>,
) => Promise<T>;

/**
 * Build the server-side current-user transaction boundary.
 * The identity is always resolved from the supplied verified session lookup;
 * callers only provide database work and cannot supply a user ID.
 */
export function createCurrentUserTransaction(
  getSession: () => Promise<SessionLike>,
  getPool: () => Pool,
  runTransaction: TransactionRunner,
): <T>(work: (client: PoolClient) => Promise<T>) => Promise<T> {
  return <T>(work: (client: PoolClient) => Promise<T>) =>
    withVerifiedSessionTransaction(
      getSession,
      (verifiedUserId, callback) =>
        runTransaction(getPool(), verifiedUserId, callback),
      work,
    );
}
