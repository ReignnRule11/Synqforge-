import assert from "node:assert/strict";
import { parseWorkspaceName, workspaceSlugFromName } from "../src/lib/workspaces/domain";

assert.equal(workspaceSlugFromName("NeuroLearn Technologies"), "neurolearn-technologies");
assert.equal(workspaceSlugFromName("  Café & Research  "), "cafe-research");
assert.equal(workspaceSlugFromName("!!!"), "");
assert.equal(workspaceSlugFromName("A".repeat(140)).length, 120);
assert.deepEqual(parseWorkspaceName("  SynqForge Core  "), { name: "SynqForge Core", slug: "synqforge-core" });
assert.equal(parseWorkspaceName("x"), null);
assert.equal(parseWorkspaceName("  "), null);
assert.equal(parseWorkspaceName("x".repeat(101)), null);
assert.equal(parseWorkspaceName(42), null);
assert.equal(parseWorkspaceName("🔥"), null);

console.log("PASS: workspace input validation and slug derivation.");
