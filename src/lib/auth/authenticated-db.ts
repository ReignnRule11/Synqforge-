import "server-only";
import { auth } from "../../../auth";
import { getRuntimePool } from "../db/pool";
import { withAuthenticatedUserTransaction } from "../db/runtime";
import { createCurrentUserTransaction } from "./current-user-transaction";

/**
 * Server-only database entry point for the current authenticated user.
 * Identity is derived from Auth.js auth(); callers cannot supply a user ID.
 */
export const withCurrentUserTransaction = createCurrentUserTransaction(
  async () => auth(),
  getRuntimePool,
  withAuthenticatedUserTransaction,
);
