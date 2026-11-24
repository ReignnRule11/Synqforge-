import { test, expect } from "@playwright/test";

test("deployed sign-in page is reachable", async ({ page }) => {
  const response = await page.goto("/signin");
  expect(response, "sign-in navigation should return an HTTP response").not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").origin);
  await expect(page.locator("body")).not.toBeEmpty();
});

test("workspace API rejects unauthenticated access with JSON", async ({ request }) => {
  const response = await request.get("/api/workspaces", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"] ?? "").toContain("application/json");
});

const userAState = process.env.E2E_USER_A_STORAGE_STATE;
const userBState = process.env.E2E_USER_B_STORAGE_STATE;
const projectId = process.env.E2E_USER_A_PROJECT_ID;
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("a second authenticated user cannot read the first user's project", async ({ browser }) => {
  test.skip(
    !userAState || !userBState || !projectId,
    "Configure two dedicated test-user storage states and E2E_USER_A_PROJECT_ID to enable the authenticated tenant-isolation check.",
  );

  const stateA = JSON.parse(userAState!);
  const stateB = JSON.parse(userBState!);
  const bypassHeaders: Record<string, string> = {};
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    bypassHeaders["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    bypassHeaders["x-vercel-set-bypass-cookie"] = "true";
  }
  const userA = await browser.newContext({ storageState: stateA, extraHTTPHeaders: bypassHeaders });
  const userB = await browser.newContext({ storageState: stateB, extraHTTPHeaders: bypassHeaders });

  try {
    // Prove both stored sessions resolve to distinct, verified Auth.js identities.
    const sessionAResponse = await userA.request.get(new URL("/api/auth/session", baseURL).toString());
    const sessionBResponse = await userB.request.get(new URL("/api/auth/session", baseURL).toString());
    expect(sessionAResponse.status()).toBe(200);
    expect(sessionBResponse.status()).toBe(200);

    const sessionA = await sessionAResponse.json() as { user?: { id?: string } };
    const sessionB = await sessionBResponse.json() as { user?: { id?: string } };
    expect(sessionA.user?.id, "test user A must have an authenticated session identity").toMatch(UUID_PATTERN);
    expect(sessionB.user?.id, "test user B must have an authenticated session identity").toMatch(UUID_PATTERN);
    expect(sessionA.user!.id).not.toBe(sessionB.user!.id);

    // Both identities must independently pass an authenticated application API.
    const workspacesA = await userA.request.get(new URL("/api/workspaces", baseURL).toString());
    const workspacesB = await userB.request.get(new URL("/api/workspaces", baseURL).toString());
    expect(workspacesA.status()).toBe(200);
    expect(workspacesB.status()).toBe(200);

    const ownerResponse = await userA.request.get(
      new URL(`/api/projects/${encodeURIComponent(projectId!)}`, baseURL).toString(),
    );
    expect(ownerResponse.status()).toBe(200);

    const otherUserResponse = await userB.request.get(
      new URL(`/api/projects/${encodeURIComponent(projectId!)}`, baseURL).toString(),
    );
    expect([403, 404]).toContain(otherUserResponse.status());
  } finally {
    await userA.close();
    await userB.close();
  }
});
