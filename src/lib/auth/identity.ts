import { createHash } from "node:crypto";

// UUIDv5 DNS namespace. The provider prefix prevents collisions with other identity sources.
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function uuidToBytes(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, ""), "hex");
}

/**
 * Stable, deterministic UUID for a verified GitHub account ID.
 * Call only with the provider ID from an Auth.js-verified OAuth account.
 * Never call this with an ID supplied by a browser or API request.
 */
export function githubUserIdToUuid(providerUserId: string): string {
  if (!/^\d+$/.test(providerUserId)) {
    throw new Error("A verified numeric GitHub account ID is required.");
  }

  const digest = createHash("sha1")
    .update(Buffer.concat([uuidToBytes(NAMESPACE), Buffer.from(`github:${providerUserId}`, "utf8")]))
    .digest();
  const bytes = digest.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
