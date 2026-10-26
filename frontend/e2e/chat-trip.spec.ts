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
  await page.evaluate(() => localStorage.clear()).catch(() => undefined); // switching phones: sign in fresh
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  await page.goto(`/chat/${THREAD}`);
  return app(page);
}

test.describe("trip in the chat", () => {
  test("the stage bar shows Scheduled under Care before the drop-off and Trip while on the way (#237)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, 5 * HOUR);
    let screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("stage-step-4")).toHaveText("Care");
    await expect(screen.getByTestId("stage-note-4")).toHaveText("Scheduled");

    db.trips.push(runningTrip());
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("stage-note-4")).toHaveText("Trip");
    // The booking page watches the trips on its own.
    await page.goto(`/sitter/bookings/${BOOKING}`);
    await expect(screen.getByTestId("stage-note-4")).toHaveText("Trip");
  });

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
    // #250: the sitter answers the owner's hello, so hers waits until Robert has said his.
    await expect(screen.getByTestId("trip-greet")).toHaveCount(0);

    // Robert's hello is a small quick reply, "Please take care of them".
    await page.evaluate(() => localStorage.clear());
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-trip-live")).toContainText("You've arrived");
    await expect(screen.getByTestId("trip-greet")).toHaveText("Please take care of them");
    await screen.getByTestId("trip-greet").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "Please take care of them" })).toBeVisible();
    await expect(screen.getByTestId("trip-greet")).toHaveCount(0);

    // Now Chloe's answer is there, one tap, and it goes into the chat as her message.
    await page.evaluate(() => localStorage.clear());
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("trip-greet")).toHaveText("We will");
    await screen.getByTestId("trip-greet").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "We will" })).toBeVisible();
    await expect(screen.getByTestId("trip-greet")).toHaveCount(0);
    expect(db.chat_messages.filter((m) => m.body === "We will")).toHaveLength(1);
    screen = await openChatAs(page, OWNER);

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
    // #250: the + menu's dimmed Start trip says when it opens.
    await screen.getByTestId("chat-plus").click();
    await expect(screen.getByTestId("chat-plus-trip")).toBeDisabled();
    await expect(screen.getByTestId("chat-plus-trip-hint")).toHaveText(/^From \d{1,2}:\d{2} (AM|PM)$/);
    await screen.getByTestId("chat-plus-menu-close").click();

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
    await expect(page).toHaveURL(new RegExp(`/sitter/feed\\?pet=${MAX}$`));

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

test.describe("the + menu", () => {
  test("Start trip, Date change and Photo request open what the flow opens; entries that cannot work yet are dimmed", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    let screen = await openChatAs(page, OWNER);

    // Before the drop-off: the trip can start, there is no photo to ask for, the sitter's Quote is not Robert's.
    await screen.getByTestId("chat-plus").click();
    await expect(screen.getByTestId("chat-plus-menu")).toBeVisible();
    await expect(screen.getByTestId("chat-plus-trip")).toBeEnabled();
    await expect(screen.getByTestId("chat-plus-photo")).toBeDisabled();
    await expect(screen.getByTestId("chat-plus-quote")).toHaveCount(0);
    await expect(screen.getByTestId("chat-plus-meet")).toBeDisabled();

    // Date change opens the suggestion sheet.
    await screen.getByTestId("chat-plus-date").click();
    await expect(screen.getByTestId("change-sheet")).toBeVisible();
    await screen.getByTestId("change-sheet-close").click();

    // Start trip goes through the consent screen like the card's button.
    await screen.getByTestId("chat-plus").click();
    await screen.getByTestId("chat-plus-trip").click();
    await expect(screen.getByTestId("share-trip-sheet")).toBeVisible();
    expect(db.trips).toHaveLength(0);
    await screen.getByTestId("share-trip-sheet-decline").click();

    // The sitter has Quote and no Start trip (the owner drives to her).
    await page.evaluate(() => localStorage.clear());
    screen = await openChatAs(page, SITTER);
    await screen.getByTestId("chat-plus").click();
    await expect(screen.getByTestId("chat-plus-trip")).toBeDisabled();
    await expect(screen.getByTestId("chat-plus-photo")).toHaveCount(0);
    await expect(screen.getByTestId("chat-plus-quote")).toHaveCount(0); // the first quote is gone: only a final quote has a + entry
  });

  test("Photo request in the menu asks for a photo while the pet is in care", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.booking_handoffs[0].completed_at = new Date(Date.now() - HOUR).toISOString();
    const screen = await openChatAs(page, OWNER);

    await screen.getByTestId("chat-plus").click();
    await expect(screen.getByTestId("chat-plus-photo")).toBeEnabled();
    await screen.getByTestId("chat-plus-photo").click();
    await expect(screen.getByTestId("chat-photo-open")).toContainText("You asked for a photo of Max");
    expect(db.photo_requests).toHaveLength(1);
  });
});

test.describe("the pets changing hands in the chat", () => {
  test("the sitter taps Received in the chat, the owner sees the pets are with her, and Returned ends the stay with Home safe", async ({ page }) => {
    await page.route("**/api/ai/life-record", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }));
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db); // the drop-off is 30 minutes away: the check-in window is open
    // Robert drove over and ended his trip ("I've arrived"): the arrival card carries Received (#250).
    db.trips.push(runningTrip({ status: "completed", ended_at: new Date(Date.now() - 60_000).toISOString(), last_lat: null, last_lng: null, last_at: null, eta_at: null, distance_m: null }));

    let screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-trip-arrived")).toContainText("Robert arrived");
    await screen.getByTestId("chat-received").click();
    await expect(screen.getByTestId("chat-stay-incare")).toContainText("Max is with you");
    expect(db.booking_handoffs.find((h) => h.kind === "drop_off")?.completed_at).toBeTruthy();
    await expect(screen.getByTestId("chat-stay-receive")).toHaveCount(0);

    // Robert's chat says where Max is; he has nothing to press.
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-stay-incare")).toContainText("Max is with Chloe");
    await expect(screen.getByTestId("chat-returned")).toHaveCount(0);
    await expect(screen.getByTestId("chat-received")).toHaveCount(0);

    // Returned goes through the same sheet as the booking page (early here: pick-up is days away).
    screen = await openChatAs(page, SITTER);
    await screen.getByTestId("chat-returned").click();
    await expect(screen.getByTestId("return-sheet")).toBeVisible();
    await expect(screen.getByTestId("return-early-warning")).toBeVisible();
    await screen.getByTestId("return-cancel").click();
    expect(db.booking_handoffs.find((h) => h.kind === "pick_up")?.completed_at).toBeFalsy();
    await screen.getByTestId("chat-returned").click();
    await screen.getByTestId("return-confirm").click();
    await expect(screen.getByTestId("chat-stay-home")).toContainText("Home safe");
    expect(db.booking_handoffs.find((h) => h.kind === "pick_up")?.completed_at).toBeTruthy();
    await expect(screen.getByTestId("chat-returned")).toHaveCount(0);

    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-stay-home")).toContainText("Max is back with you");
  });

  test("when the owner has arrived the sitter gets one card: arrived with the time, Track and Received together", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    const arrivedAt = new Date(Date.now() - 60_000).toISOString();
    db.trips.push(runningTrip({ status: "arrived", arrived_at: arrivedAt, eta_at: null }));

    let screen = await openChatAs(page, SITTER);
    const card = screen.getByTestId("chat-trip-live");
    await expect(card).toContainText("Robert has arrived");
    await expect(card).toContainText(/\d{1,2}:\d{2} (AM|PM)/); // when
    await expect(card.getByTestId("chat-trip-open")).toHaveText("Track Robert");
    await expect(card.getByTestId("chat-received")).toBeVisible();
    await expect(screen.getByTestId("chat-stay-receive")).toHaveCount(0); // not a second card

    // The owner sees the arrival but has no Received.
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-trip-live")).toContainText("You've arrived");
    await expect(screen.getByTestId("chat-received")).toHaveCount(0);

    screen = await openChatAs(page, SITTER);
    await screen.getByTestId("chat-received").click();
    await expect(screen.getByTestId("chat-stay-incare")).toContainText("Max is with you");
    expect(db.booking_handoffs.find((h) => h.kind === "drop_off")?.completed_at).toBeTruthy();
  });

  test("no Received in the chat before the drop-off trip got there, even inside the 2-hour window; the owner never has one (#250)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db); // 30 minutes away: the window is open, but nobody is on the way
    let screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-bubble-them")).toBeVisible();
    await expect(screen.getByTestId("chat-received")).toHaveCount(0);
    // The + menu's Received follows the same rule and says why it is off.
    await screen.getByTestId("chat-plus").click();
    await expect(screen.getByTestId("chat-plus-received")).toBeDisabled();
    await expect(screen.getByTestId("chat-plus-received-hint")).toHaveText("After the arrival");
    await screen.getByTestId("chat-plus-menu-close").click();

    // On the way is not there yet.
    db.trips.push(runningTrip());
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-trip-live")).toContainText("Robert is on the way");
    await expect(screen.getByTestId("chat-received")).toHaveCount(0);

    // A cancelled trip does not count as an arrival.
    Object.assign(db.trips[0], { status: "cancelled", ended_at: new Date().toISOString() });
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-bubble-them")).toBeVisible();
    await expect(screen.getByTestId("chat-received")).toHaveCount(0);

    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-bubble-me")).toBeVisible();
    await expect(screen.getByTestId("chat-received")).toHaveCount(0);
  });

  test("a trip without a live location ends with I've arrived; then the sitter gets Received (#250)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.trips.push(runningTrip({ sharing: false, last_lat: null, last_lng: null, last_at: null, eta_at: null, distance_m: null }));

    let screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-trip-live")).toContainText("You're on the way");
    await screen.getByTestId("chat-trip-arrive").click();
    await expect.poll(() => db.trips[0].status).toBe("completed");
    // The owner's card says they are there, with no Start trip again and the hello to send.
    await expect(screen.getByTestId("chat-trip-arrived")).toContainText("You've arrived");
    await expect(screen.getByTestId("chat-trip-start")).toHaveCount(0);
    await expect(screen.getByTestId("trip-greet")).toHaveText("Please take care of them");
    // …and the + menu has no Start trip for it either (no second trip to the same handoff).
    await screen.getByTestId("chat-plus").click();
    await expect(screen.getByTestId("chat-plus-trip")).toBeDisabled();
    await screen.getByTestId("chat-plus-menu-close").click();

    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-trip-arrived")).toContainText("Robert arrived");
    // Now the + menu's Received is on too.
    await screen.getByTestId("chat-plus").click();
    await expect(screen.getByTestId("chat-plus-received")).toBeEnabled();
    await screen.getByTestId("chat-plus-menu-close").click();
    await screen.getByTestId("chat-received").click();
    await expect(screen.getByTestId("chat-stay-incare")).toContainText("Max is with you");
    expect(db.booking_handoffs.find((h) => h.kind === "drop_off")?.completed_at).toBeTruthy();
  });
});

test.describe("reviews in the chat", () => {
  /** The pets are home: both handoffs are done. */
  function finished(db: MockDb) {
    seed(db);
    for (const h of db.booking_handoffs) h.completed_at = new Date(Date.now() - HOUR).toISOString();
    // the stay card the chat started with: once the stay is over it asks for nothing (no Send quote, no Request booking)
    db.chat_messages.push({
      id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, created_at: "2026-10-10T09:59:00.000Z",
      card: { type: "stay", drop_off_at: "2030-10-24T13:00:00Z", pick_up_at: "2030-10-27T21:00:00Z", pets: [{ id: MAX, name: "Max" }] },
    });
  }

  test("after Returned the owner reviews the sitter right in the chat and hearts her; the sitter reads it and keeps a private note", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    finished(db);

    let screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-stay-home")).toContainText("Home safe");
    await expect(screen.getByTestId("chat-next-meet_start")).toHaveCount(0);
    await expect(screen.getByTestId("chat-review")).toContainText("How was Max's stay with Chloe?");
    await expect(screen.getByTestId("review-send")).toBeDisabled(); // no stars yet
    await screen.getByTestId("review-rating-4").click();
    await screen.getByTestId("review-comment").fill("Max came home happy and tired!");
    await screen.getByTestId("review-send").click();

    // The form turns into the review, and the heart is there to add her as a favorite.
    await expect(screen.getByTestId("chat-review")).toContainText("Your review");
    await expect(screen.getByTestId("chat-review")).toContainText("Max came home happy and tired!");
    expect(db.reviews).toHaveLength(1);
    expect(db.reviews[0]).toMatchObject({ rating: 4, comment: "Max came home happy and tired!" });
    await expect(screen.getByTestId("favorite-heart")).toContainText("Add Chloe to favorites");
    await screen.getByTestId("favorite-heart").click();
    await expect(screen.getByTestId("favorite-heart")).toContainText("Favorite");
    expect(db.owner_favorite_sitters).toHaveLength(1);
    await screen.getByTestId("favorite-heart").click(); // and off again
    await expect(screen.getByTestId("favorite-heart")).toContainText("Add Chloe to favorites");
    expect(db.owner_favorite_sitters).toHaveLength(0);

    // Coming back later it is still the review, not the form.
    await page.reload();
    await expect(screen.getByTestId("chat-review")).toContainText("Your review");
    await expect(screen.getByTestId("review-send")).toHaveCount(0);

    // The sitter reads Robert's review in her chat and writes her own private note about him.
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("received-review")).toContainText("Max came home happy and tired!");
    await expect(screen.getByTestId("chat-send-quote")).toHaveCount(0);
    await expect(screen.getByTestId("favorite-heart")).toHaveCount(0); // not hers to see or press
    await screen.getByTestId("owner-note-start").click();
    await screen.getByTestId("owner-note-rating-5").click();
    await screen.getByTestId("owner-note-comment").fill("Easy handoff.");
    await screen.getByTestId("owner-note-save").click();
    await expect(screen.getByTestId("owner-note")).toContainText("Only you can see this");
    expect(db.sitter_owner_notes).toHaveLength(1);

    // The owner never sees the sitter's note.
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("owner-note")).toHaveCount(0);
  });

  test("the sitter's chat shows the owner's review as soon as it is written, and no review cards before Returned", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db); // not returned yet
    let screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-bubble-me")).toBeVisible();
    await expect(screen.getByTestId("chat-review")).toHaveCount(0);

    for (const h of db.booking_handoffs) h.completed_at = new Date(Date.now() - HOUR).toISOString();
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("received-review")).toContainText("Robert hasn't left a review yet.");
    db.reviews.push({ id: "r1", booking_id: BOOKING, owner_id: OWNER.id, sitter_id: SITTER.id, rating: 5, comment: "Wonderful care", created_at: new Date().toISOString() });
    await expect(screen.getByTestId("received-review")).toContainText("Wonderful care", { timeout: 15_000 });
  });
});

