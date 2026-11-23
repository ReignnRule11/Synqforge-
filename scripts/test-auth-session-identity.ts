import assert from "node:assert/strict";
import { githubUserIdToUuid } from "../src/lib/auth/identity";
import { requireVerifiedSessionIdentity } from "../src/lib/auth/session-identity";

const verifiedId = githubUserIdToUuid("222224725");
assert.equal(requireVerifiedSessionIdentity(verifiedId), verifiedId);
assert.throws(() => requireVerifiedSessionIdentity(undefined), /verified session UUID/);
assert.throws(() => requireVerifiedSessionIdentity(null), /verified session UUID/);
assert.throws(() => requireVerifiedSessionIdentity("not-a-uuid"), /verified session UUID/);
assert.throws(() => requireVerifiedSessionIdentity("222224725"), /verified session UUID/);

console.log("PASS: session identity fails closed unless the JWT subject is a UUIDv5 identity.");
