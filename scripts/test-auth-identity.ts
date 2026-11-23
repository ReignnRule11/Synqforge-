import assert from "node:assert/strict";
import { githubUserIdToUuid } from "../src/lib/auth/identity";

const first = githubUserIdToUuid("222224725");
assert.equal(first, githubUserIdToUuid("222224725"), "same provider account must map to the same UUID");
assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.notEqual(first, githubUserIdToUuid("222224726"), "different provider accounts must map to different UUIDs");
assert.throws(() => githubUserIdToUuid("not-a-provider-id"), /verified numeric GitHub account ID/);
console.log("PASS: GitHub account IDs map deterministically to valid, distinct UUIDv5 identities.");
