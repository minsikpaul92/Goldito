import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { caring, mockUpload } from "./careFixtures";
import { NOON_TORONTO, app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Photo captions and tags (phase-09 9.1–9.5): the sitter only uploads; the model writes the caption and
// picks the tag; if it can't, the post still goes out. The AI endpoint is mocked (pytest covers the real one).

const PET_ID = "00000000-0000-4000-8000-0000000000aa";

async function openSitterFeed(page: Page, caption: { status: number; body?: object; delayMs?: number }) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  caring(db, [{ id: PET_ID, name: "Max", species: "dog" }]);
  await mockUpload(page, db, PET_ID);
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/ai/caption", async (route) => {
    asked.push(route.request().postDataJSON());
    if (caption.delayMs) await new Promise((r) => setTimeout(r, caption.delayMs));
    return route.fulfill({
      status: caption.status,
      contentType: "application/json",
      body: JSON.stringify(caption.body ?? {}),
    });
  });
  await signIn(page, SITTER);
  await app(page).getByRole("heading", { name: /^(Home|Today)$/ }).first().waitFor();
  await page.goto(`/sitter/feed/${PET_ID}`);
  await app(page).getByTestId("feed-add-photo").waitFor();
  return { db, asked };
}

async function addSamplePhoto(page: Page) {
  await app(page).getByTestId("feed-add-photo").click();
  await app(page).getByTestId("sample-walk").click();
  await app(page).getByTestId("feed-add-save").click();
}

test.describe("photo caption", () => {
  test("with Playful words off in Settings, the share toast is plain", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("goldito-playful-words", "false"));
    await openSitterFeed(page, { status: 200, body: { caption: "Max on a walk", category: "walk", source: "ai", model: "m", latency_ms: 300 } });
    await addSamplePhoto(page);
    await expect(app(page).getByTestId("toast")).toContainText("Shared with Robert");
  });

  test("the sitter only uploads: the model's caption and tag are saved, with a Writing a caption… step", async ({ page }) => {
    const { db, asked } = await openSitterFeed(page, {
      status: 200,
      delayMs: 1200,
      body: { caption: "Max sniffing autumn leaves 🍂", category: "walk", source: "ai", model: "m", latency_ms: 900 },
    });
    await addSamplePhoto(page);
    await expect(app(page).getByTestId("feed-uploading-text")).toHaveText("Writing a caption…");
    await expect(app(page).getByTestId("toast")).toContainText("Pawsted! Robert can see it");

    expect(asked).toEqual([{ pet_id: PET_ID, media_id: "media-proof" }]);
    expect(db.feed_posts).toHaveLength(1);
    expect(db.feed_posts[0]).toMatchObject({
      media_id: "media-proof", caption: "Max sniffing autumn leaves 🍂", caption_source: "ai", category: "walk", posted_by: SITTER.id,
    });
    // No caption field anywhere on the sitter's screen.
    await expect(app(page).getByRole("textbox")).toHaveCount(0);
  });

  test("when the caption fails the post still goes out with the fallback caption and no tag", async ({ page }) => {
    const { db } = await openSitterFeed(page, { status: 502, body: { detail: "down" } });
    await addSamplePhoto(page);
    await expect(app(page).getByTestId("toast")).toContainText("Pawsted! Robert can see it");
    expect(db.feed_posts[0]).toMatchObject({ caption: "A moment from today's care 🐾", caption_source: "fallback", category: null });
  });

  test("the server's own fallback caption is kept and marked as a fallback", async ({ page }) => {
    const { db } = await openSitterFeed(page, {
      status: 200,
      body: { caption: "Max had a lovely moment today 🐾", category: null, source: "fallback", model: "fallback", latency_ms: 0 },
    });
    await addSamplePhoto(page);
    await expect(app(page).getByTestId("toast")).toContainText("Pawsted! Robert can see it");
    expect(db.feed_posts[0]).toMatchObject({ caption: "Max had a lovely moment today 🐾", caption_source: "fallback", category: null });
  });
});
