import assert from "node:assert/strict";
import { parseWorkspaceName, workspaceSlugFromName } from "../src/lib/workspaces/domain";

assert.equal(workspaceSlugFromName("NeuroLearn Technologies"), "neurolearn-technologies");
assert.equal(workspaceSlugFromName("  Café & Research  "), "cafe-research");
assert.equal(workspaceSlugFromName("!!!"), "");
assert.equal(workspaceSlugFromName("A".repeat(140)).length, 120);
assert.equal(workspaceSlugFromName("A".repeat(119) + " !!!").length, 119);
assert.equal(workspaceSlugFromName("  Multiple   spaces---and_symbols__  "), "multiple-spaces-and-symbols");
assert.equal(workspaceSlugFromName("Łódź 東京"), "odz");
assert.deepEqual(parseWorkspaceName("  SynqForge Core  "), { name: "SynqForge Core", slug: "synqforge-core" });
assert.equal(parseWorkspaceName("x"), null);
assert.equal(parseWorkspaceName("  "), null);
assert.equal(parseWorkspaceName("x".repeat(101)), null);
assert.equal(parseWorkspaceName(42), null);
assert.equal(parseWorkspaceName("🔥"), null);
assert.deepEqual(parseWorkspaceName("A".repeat(100)), { name: "A".repeat(100), slug: "a".repeat(100) });

console.log("PASS: workspace input validation, Unicode normalization, slug boundaries, and deterministic derivation.");
