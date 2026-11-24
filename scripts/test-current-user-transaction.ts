import assert from "node:assert/strict";
import type { Pool, PoolClient } from "pg";
import { githubUserIdToUuid } from "../src/lib/auth/identity";
import { createCurrentUserTransaction } from "../src/lib/auth/current-user-transaction";

const verifiedId = githubUserIdToUuid("222224725");
const forgedId = githubUserIdToUuid("999999999");
const fakePool = {} as Pool;
const fakeClient = {} as PoolClient;
let poolLookups = 0;
let transactionCalls = 0;
let capturedIdentity: string | undefined;

const getPool = () => {
  poolLookups += 1;
  return fakePool;
};

const runTransaction = async <T>(
  pool: Pool,
  userId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  assert.equal(pool, fakePool);
  transactionCalls += 1;
  capturedIdentity = userId;
  return work(fakeClient);
};

async function run() {
  const withCurrentUserTransaction = createCurrentUserTransaction(
    async () => ({ user: { id: verifiedId } }),
    getPool,
    runTransaction,
  );

  const result = await withCurrentUserTransaction(async () => "database-result");
  assert.equal(result, "database-result");
  assert.equal(poolLookups, 1);
  assert.equal(transactionCalls, 1);
  assert.equal(capturedIdentity, verifiedId);

  // A caller-controlled value returned by work cannot replace the session identity.
  const workResult = await withCurrentUserTransaction(async () => forgedId);
  assert.equal(workResult, forgedId);
  assert.equal(capturedIdentity, verifiedId);
  assert.equal(transactionCalls, 2);

  const deniedSessions: Array<() => Promise<unknown>> = [
    async () => null,
    async () => undefined,
    async () => ({}),
    async () => ({ user: null }),
    async () => ({ user: {} }),
    async () => ({ user: { id: "not-a-uuid" } }),
    async () => ({ user: { id: "222224725" } }),
  ];

  for (const getSession of deniedSessions) {
    const denied = createCurrentUserTransaction(
      getSession as () => Promise<{ user?: { id?: unknown } } | null | undefined>,
      getPool,
      runTransaction,
    );
    await assert.rejects(denied(async () => "must-not-run"), /verified session UUID/);
  }
  assert.equal(poolLookups, 2, "invalid sessions must be rejected before opening a pool");
  assert.equal(transactionCalls, 2, "invalid sessions must never reach the transaction runner");

  const authFailure = new Error("session provider unavailable");
  const unavailableAuth = createCurrentUserTransaction(
    async () => { throw authFailure; },
    getPool,
    runTransaction,
  );
  await assert.rejects(unavailableAuth(async () => "must-not-run"), (error: unknown) => error === authFailure);
  assert.equal(poolLookups, 2, "auth lookup failure must not open a database pool");

  const databaseFailure = new Error("database unavailable");
  const failingTransaction = createCurrentUserTransaction(
    async () => ({ user: { id: verifiedId } }),
    getPool,
    async () => { throw databaseFailure; },
  );
  await assert.rejects(failingTransaction(async () => "must-not-run"), (error: unknown) => error === databaseFailure);

  console.log("PASS: current-user transaction derives identity from verified session and fails closed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
