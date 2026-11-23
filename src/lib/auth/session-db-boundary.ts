import { requireVerifiedSessionIdentity } from "./session-identity";

type SessionLike = {
  user?: { id?: unknown } | null;
} | null | undefined;

type TransactionRunner<T> = (
  verifiedUserId: string,
  work: () => Promise<T>,
) => Promise<T>;

/**
 * Resolve the database identity exclusively from a server-verified session.
 * This function intentionally has no request, body, query, or client identity
 * parameter. The caller must supply Auth.js auth() as getSession.
 */
export async function withVerifiedSessionTransaction<T>(
  getSession: () => Promise<SessionLike>,
  runTransaction: TransactionRunner<T>,
  work: () => Promise<T>,
): Promise<T> {
  const session = await getSession();
  const verifiedUserId = requireVerifiedSessionIdentity(session?.user?.id);
  return runTransaction(verifiedUserId, work);
}
