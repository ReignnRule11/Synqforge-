const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Require the UUID subject generated from a verified OAuth provider identity.
 * Never accept a browser-supplied identity as a substitute.
 */
export function requireVerifiedSessionIdentity(subject: unknown): string {
  if (typeof subject !== "string" || !UUID_PATTERN.test(subject)) {
    throw new Error("A verified session UUID is required.");
  }
  return subject;
}
