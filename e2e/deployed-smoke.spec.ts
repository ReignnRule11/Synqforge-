import { test, expect } from "@playwright/test";

test("deployed sign-in page is reachable", async ({ page }) => {
  const response = await page.goto("/signin");
  expect(response, "sign-in navigation should return an HTTP response").not.toBeNull();
  expect(response!.status()).toBe(200);
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

test("a second authenticated user cannot read the first user's project", async ({ browser }) => {
  test.skip(
    !userAState || !userBState || !projectId,
    "Configure two dedicated test-user storage states and E2E_USER_A_PROJECT_ID to enable the authenticated tenant-isolation check.",
  );

  const stateA = JSON.parse(userAState!);
  const stateB = JSON.parse(userBState!);
  const userA = await browser.newContext({ storageState: stateA });
  const userB = await browser.newContext({ storageState: stateB });

  try {
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
