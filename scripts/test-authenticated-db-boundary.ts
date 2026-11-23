import assert from "node:assert/strict";
import { githubUserIdToUuid } from "../src/lib/auth/identity";
import { withVerifiedSessionTransaction } from "../src/lib/auth/session-db-boundary";

const verifiedId = githubUserIdToUuid("222224725");
let transactionCalls = 0;
let capturedIdentity: string | undefined;

async function runTransaction<T>(userId: string, work: () => Promise<T>): Promise<T> {
  transactionCalls += 1;
  capturedIdentity = userId;
  return work();
}

async function run() {
  const expected = await withVerifiedSessionTransaction(
    async () => ({ user: { id: verifiedId } }),
    runTransaction,
    async () => "database-result",
  );
  assert.equal(expected, "database-result");
  assert.equal(transactionCalls, 1);
  assert.equal(capturedIdentity, verifiedId);

  // A caller-controlled identity has no parameter in this boundary. An
  // unrelated forged value cannot replace the identity returned by auth().
  const forgedClientIdentity = githubUserIdToUuid("999999999");
  const trustedResult = await withVerifiedSessionTransaction(
    async () => ({ user: { id: verifiedId } }),
    runTransaction,
    async () => forgedClientIdentity,
  );
  assert.equal(trustedResult, forgedClientIdentity);
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
    await assert.rejects(
      withVerifiedSessionTransaction(
        getSession as () => Promise<{ user?: { id?: unknown } } | null | undefined>,
        runTransaction,
        async () => "must-not-run",
      ),
      /verified session UUID/,
    );
  }
  assert.equal(transactionCalls, 2, "invalid or absent sessions must never reach the database");

  const authFailure = new Error("session provider unavailable");
  await assert.rejects(
    withVerifiedSessionTransaction(
      async () => { throw authFailure; },
      runTransaction,
      async () => "must-not-run",
    ),
    (error: unknown) => error === authFailure,
  );
  assert.equal(transactionCalls, 2, "session lookup failures must fail closed");

  const databaseFailure = new Error("database unavailable");
  await assert.rejects(
    withVerifiedSessionTransaction(
      async () => ({ user: { id: verifiedId } }),
      async () => { throw databaseFailure; },
      async () => "must-not-run",
    ),
    (error: unknown) => error === databaseFailure,
  );

  console.log("PASS: authenticated DB boundary derives identity only from verified session and fails closed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
