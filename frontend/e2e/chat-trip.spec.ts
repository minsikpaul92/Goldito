import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The trip in the chat (03D 3D.8, #145): Start trip for the person who travels, "on the way" / "N min away" / "arrived"
// for both, and a one-tap hello. The card reads the booking's trips like the booking page; nothing is stored in the chat.

const MAX = "00000000-0000-4000-8000-0000000000c1";
const THREAD = "00000000-0000-4000-8000-0000000000f1";
const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const HOUR = 3_600_000;

/** A paid, confirmed stay whose drop-off is `dropInMs` away, at the sitter's home; Robert and Chloe have a chat. */
function seed(db: MockDb, dropInMs = 30 * 60_000) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "confirmed",
    service_type: "boarding",
    meet_greet_status: "done",
    created_at: "2026-10-02T18:00:00Z",
    paid_at: "2026-10-03T18:00:00Z",
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
  const now = Date.now();
  for (const [kind, at] of [
    ["drop_off", now + dropInMs],
    ["pick_up", now + dropInMs + 72 * HOUR],
  ] as const) {
    db.booking_handoffs.push({
      id: `h-${kind}`,
      booking_id: BOOKING,
      kind,
      scheduled_at: new Date(at).toISOString(),
      location_type: "sitter_home",
      location_note: null,
      within_sitter_hours: true,
      status: "agreed",
      proposed_by: OWNER.id,
      completed_at: null,
      created_at: "2026-10-02T18:00:00Z",
    });
  }
  db.chat_messages.push({ id: "m1", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "See you soon", card: null, created_at: "2026-10-10T10:00:00.000Z" });
}

const runningTrip = (patch: Record<string, unknown> = {}) => ({
  id: "trip-1",
  booking_id: BOOKING,
  handoff_kind: "drop_off",
  traveler_id: OWNER.id,
  status: "en_route",
  dest_lat: 43.6477,
  dest_lng: -79.4194,
  last_lat: 43.6566,
  last_lng: -79.3911,
  last_at: new Date().toISOString(),
  eta_at: new Date(Date.now() + 12 * 60_000).toISOString(),
  distance_m: 5200,
  simulated: false,
  sharing: true,
  started_at: new Date().toISOString(),
  arrived_at: null,
  ended_at: null,
  ...patch,
});

async function openChatAs(page: Page, user: MockUser) {
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  await page.goto(`/chat/${THREAD}`);
  return app(page);
}

test.describe("trip in the chat", () => {
  test("the owner starts the trip from the chat; the sitter sees it coming, then the arrival, and they say hello", async ({ page }) => {
    test.setTimeout(60_000);
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);

    // Robert (the owner drives to the sitter's home) starts the trip behind the consent screen.
    let screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-trip-start")).toContainText("Heading to the drop-off?");
    await screen.getByTestId("chat-trip-start-button").click();
    await expect(screen.getByTestId("share-trip-sheet")).toBeVisible();
    expect(db.trips).toHaveLength(0);
    await screen.getByTestId("share-trip-sheet-simulate").click();
    await expect(page).toHaveURL(/\/owner\/bookings\/.*\/trip$/);
    expect(db.trips).toHaveLength(1);

    // Back in the chat the card follows the trip.
    await page.goto(`/chat/${THREAD}`);
    await expect(screen.getByTestId("chat-trip-live")).toContainText("You're on the way");
    await expect(screen.getByTestId("chat-trip-open")).toHaveText("Open trip");

    // Chloe sees it from her phone: on the way, then a few minutes away, then arrived.
    db.trips.length = 0;
    db.trips.push(runningTrip());
    await page.evaluate(() => localStorage.clear());
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-trip-live")).toContainText("Robert is on the way");
    await expect(screen.getByTestId("chat-trip-open")).toHaveText("Track Robert");
    await expect(screen.getByTestId("trip-greet")).toHaveCount(0);

    Object.assign(db.trips[0], { eta_at: new Date(Date.now() + 2.5 * 60_000).toISOString() });
    await expect(screen.getByTestId("chat-trip-live")).toContainText(/Robert is [23] min away/, { timeout: 12_000 });

    Object.assign(db.trips[0], { status: "arrived", arrived_at: new Date().toISOString(), distance_m: 60 });
    await expect(screen.getByTestId("chat-trip-live")).toContainText("Robert has arrived", { timeout: 12_000 });

    // The sitter's hello is one tap and goes into the chat as her message; the button is then gone.
    await screen.getByTestId("trip-greet").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "We will" })).toBeVisible();
    await expect(screen.getByTestId("trip-greet")).toHaveCount(0);
    expect(db.chat_messages.filter((m) => m.body === "We will")).toHaveLength(1);

    // Robert's own hello is "Please take care of them".
    await page.evaluate(() => localStorage.clear());
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-trip-live")).toContainText("You've arrived");
    await expect(screen.getByTestId("trip-greet")).toHaveText("Please take care of them");
    await screen.getByTestId("trip-greet").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "Please take care of them" })).toBeVisible();

    // The drop-off is done: the trip is over, the hello stays a message, and the pick-up waits for its window.
    Object.assign(db.trips[0], { status: "completed", ended_at: new Date().toISOString() });
    db.booking_handoffs[0].completed_at = new Date().toISOString();
    await page.reload();
    await expect(screen.getByTestId("chat-trip-live")).toHaveCount(0);
    await expect(screen.getByTestId("chat-trip-arrived")).toHaveCount(0);
    await expect(screen.getByTestId("chat-trip-waiting")).toContainText("You can start the trip from");
  });

  test("before the window the owner sees when Start trip opens; the sitter has no Start trip", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, 5 * HOUR);
    let screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-trip-waiting")).toContainText("You can start the trip from");
    await expect(screen.getByTestId("chat-trip-start-button")).toHaveCount(0);

    await page.evaluate(() => localStorage.clear());
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-bubble-them")).toBeVisible();
    await expect(screen.getByTestId("chat-trip-waiting")).toHaveCount(0);
    await expect(screen.getByTestId("chat-trip-start")).toHaveCount(0);
  });

  test("an unpaid booking has no trip card", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.bookings[0].paid_at = null;
    const screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-bubble-me")).toBeVisible();
    await expect(screen.getByTestId("chat-trip-start")).toHaveCount(0);
  });
});

test.describe("care in the chat", () => {
  /** The drop-off is done: Max is with Chloe. */
  function inCare(db: MockDb) {
    seed(db);
    db.booking_handoffs[0].completed_at = new Date(Date.now() - HOUR).toISOString();
  }

  test("the owner asks for a photo; the sitter is pointed at the Feed; the answer shows with its one-line caption", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    inCare(db);
    let screen = await openChatAs(page, OWNER);

    await screen.getByTestId("chat-ask-photo").click();
    await expect(screen.getByTestId("chat-photo-open")).toContainText("You asked for a photo of Max");
    await expect(screen.getByTestId("chat-photo-open")).toContainText("Waiting for Chloe");
    await expect(screen.getByTestId("chat-ask-photo")).toHaveCount(0); // one open ask per pet
    expect(db.photo_requests).toHaveLength(1);

    await page.evaluate(() => localStorage.clear());
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-photo-open")).toContainText("Robert asked for a photo of Max");
    await expect(screen.getByTestId("chat-ask-photo")).toHaveCount(0); // only the owner asks
    await screen.getByTestId("chat-photo-send").click();
    await expect(page).toHaveURL(new RegExp(`/sitter/feed/${MAX}$`));

    // The sitter's next shared photo answers the ask (the database does this); the caption is one line.
    db.media.push({ id: "media-1", pet_id: MAX, cloudinary_public_id: "pets/max-nap", resource_type: "image", purpose: "feed" });
    db.feed_posts.push({
      id: "post-1",
      pet_id: MAX,
      sitter_id: SITTER.id,
      posted_by: SITTER.id,
      visibility: "shared",
      media_id: "media-1",
      caption: "Max naps in the sun",
      caption_source: "ai",
      category: null,
      task_log_id: null,
      created_at: new Date().toISOString(),
    });
    Object.assign(db.photo_requests[0], { status: "fulfilled", fulfilled_post_id: "post-1", fulfilled_at: new Date().toISOString() });

    await page.goto(`/chat/${THREAD}`);
    await expect(screen.getByTestId("chat-photo-done")).toContainText("You sent a photo of Max");
    await page.evaluate(() => localStorage.clear());
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-photo-done")).toContainText("Chloe sent a photo of Max");
    await expect(screen.getByTestId("chat-photo-caption")).toHaveText("Max naps in the sun");
    await expect(screen.getByTestId("chat-ask-photo")).toBeVisible(); // answered: the owner may ask again
  });

  test("the day's diary page shows in the chat and opens the Diary", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    inCare(db);
    db.daily_reports.push({
      id: "report-1",
      pet_id: MAX,
      sitter_id: SITTER.id,
      report_date: "2026-10-21",
      body: "Max had a lovely day.",
      status: "sent",
      source_snapshot: null,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    const screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-diary-card")).toContainText("Diary written");
    await screen.getByTestId("chat-diary-open").click();
    await expect(page).toHaveURL(/\/owner\/diary\/report-1$/);
  });

  test("before the drop-off there are no care cards and no Ask for a photo", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    const screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-bubble-me")).toBeVisible();
    await expect(screen.getByTestId("chat-ask-photo")).toHaveCount(0);
    await expect(screen.getByTestId("chat-diary-card")).toHaveCount(0);
  });
});
