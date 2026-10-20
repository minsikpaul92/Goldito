import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, box, drag, signIn } from "./helpers";
import { DEMO_QUOTE, MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Chat hub (03D 3D.4, 014j): one chat per owner and sitter, a WhatsApp-style list inside the Bookings tab, free
// chat both ways, the stay card and the booking progress bar on top, unread counts and leaving a chat.
// The thread rules themselves are tested in rls_smoke.sql; the mock keeps the same ones.

const MAX = "00000000-0000-4000-8000-0000000000c1";
const MOCHI = "00000000-0000-4000-8000-0000000000c2";
const THREAD = "00000000-0000-4000-8000-0000000000f1";
const BOOKING = "00000000-0000-4000-8000-0000000000e1";

function pet(id: string, name: string, species: "dog" | "cat") {
  return { id, owner_id: OWNER.id, species, name, breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-01-01T00:00:00Z" };
}

/** Robert has Max and Mochi and a saved home; Chloe is 3 km away. */
function seed(db: MockDb) {
  db.pets.push(pet(MAX, "Max", "dog"), pet(MOCHI, "Mochi", "cat"));
  db.owner_profiles.push({ id: OWNER.id, home_address: null, home_lat: 43.6644, home_lng: -79.3573 });
  db.nearby_sitters.push({
    sitter_id: SITTER.id,
    display_name: SITTER.displayName,
    bio: null,
    service_area: null,
    experience_years: null,
    services: ["boarding"],
    is_my_sitter: false,
    accepts_multiple_owners: false,
    distance_km: 3,
    boarding_nightly: null,
    house_sitting_nightly: null,
  });
  db.owner_favorite_sitters.push({ owner_id: OWNER.id, sitter_id: SITTER.id });
}

/** An existing chat: Robert asked, Chloe answered, Robert wrote again (two unread for Chloe). */
function seedThread(db: MockDb) {
  db.chat_threads.push({
    id: THREAD,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    owner_read_at: "2026-10-10T10:03:00.000Z",
    sitter_read_at: "2026-10-10T10:01:00.000Z",
    owner_left_at: null,
    sitter_left_at: null,
  });
  const at = (m: number) => `2026-10-10T10:0${m}:00.000Z`;
  db.chat_messages.push(
    { id: "m1", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "Can you take Max in March?", card: null, created_at: at(0) },
    { id: "m2", thread_id: THREAD, sender_id: SITTER.id, kind: "text", body: "Yes, I have room", card: null, created_at: at(1) },
    { id: "m3", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "Great, anything I should bring?", card: null, created_at: at(2) },
    { id: "m4", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "He eats at 8", card: null, created_at: at(3) },
  );
}

async function openBookings(page: Page, user: MockUser, home: "owner" | "sitter") {
  await signIn(page, user);
  await expect(page).toHaveURL(new RegExp(`/${home}$`));
  const screen = app(page);
  await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${home}/bookings$`));
  return screen;
}

/** Bookings, the sitter's name, the profile, Start chat: a chat starts only from the profile. */
async function startChatFromRow(page: Page, name: string) {
  const screen = app(page);
  await screen.getByTestId(`sitter-tile-${name}`).click();
  await expect(page).toHaveURL(/\/owner\/sitters\//);
  await screen.getByTestId("start-chat").click();
}

test.describe("chat hub", () => {
  test("an owner starts a chat from a sitter: the stay card first, then messages both ways, in the same thread", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    const screen = await openBookings(page, OWNER, "owner");

    // The row has no chat button: the avatar shows photos, the name opens the profile, and Start chat is there.
    await expect(screen.getByTestId("sitter-chat-Chloe")).toHaveCount(0);
    await startChatFromRow(page, "Chloe");
    await expect(page).toHaveURL(/\/chat\//);
    const url = page.url();
    await expect(screen.getByTestId("chat-stay-card")).toContainText("Max, Mochi");
    // The header has the pets only (no dates, they are on the card); my stay card sits on the right like my messages.
    await expect(screen.getByTestId("chat-header-stay")).not.toContainText(" to ");
    await expect(screen.getByTestId("chat-header-pet-Max")).toBeVisible();
    await expect(screen.getByTestId("chat-header-pet-Mochi")).toBeVisible();
    const frame = await box(page.locator("iframe"));
    const card = await box(screen.getByTestId("chat-stay-card"));
    expect(card.x + card.width / 2).toBeGreaterThan(frame.x + frame.width / 2);
    expect((await box(screen.getByTestId("chat-input"))).height).toBeLessThanOrEqual(48);
    await expect(screen.getByTestId("chat-empty")).toBeHidden();

    // Free chat: the same person sends again and again.
    for (const text of ["Hi Chloe", "Is Max okay with cats?", "Thanks!"]) {
      await screen.getByTestId("chat-input").fill(text);
      await screen.getByTestId("chat-send").click();
      await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: text })).toBeVisible();
    }
    expect(db.chat_messages.filter((m) => m.kind === "text")).toHaveLength(3);

    // The sitter writes back (as they would from their own phone).
    const thread = db.chat_threads[0];
    db.chat_messages.push({ id: "reply", thread_id: thread.id, sender_id: SITTER.id, kind: "text", body: "Max is welcome!", card: null, created_at: new Date(Date.now() + 5000).toISOString() });
    await expect(screen.getByTestId("chat-bubble-them").filter({ hasText: "Max is welcome!" })).toBeVisible({ timeout: 10000 });

    // Back leaves the chat (the profile, then the list); the same sitter opens the same thread, with the history.
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/owner\/bookings$/);
    await expect(screen.getByTestId("chat-row-Chloe")).toContainText("Max is welcome!");
    await startChatFromRow(page, "Chloe");
    await expect(page).toHaveURL(url);
    await expect(screen.getByTestId("chat-bubble-me")).toHaveCount(3);
    expect(db.chat_threads).toHaveLength(1);
    expect(db.chat_messages.filter((m) => m.kind === "card")).toHaveLength(1); // the same stay is not posted twice
  });

  test("the sitter sees the unread count in Chats, opens at the latest message and replies as often as they like", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");

    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await expect(screen.getByTestId("chat-row-Robert")).toContainText("He eats at 8");
    await expect(screen.getByTestId("chat-unread-Robert")).toHaveText("2");
    await screen.getByTestId("chat-row-Robert").click();

    await expect(page).toHaveURL(new RegExp(`/chat/${THREAD}$`));
    await expect(screen.getByTestId("chat-bubble-them").last()).toBeInViewport();
    for (const text of ["Bring his food", "And the leash"]) {
      await screen.getByTestId("chat-input").fill(text);
      await screen.getByTestId("chat-send").click();
      await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: text })).toBeVisible();
    }

    await page.goBack();
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await expect(screen.getByTestId("chat-row-Robert")).toContainText("And the leash");
    await expect(screen.getByTestId("chat-unread-Robert")).toHaveCount(0);
  });

  test("leaving a chat hides it from my list only; a swipe does it and the chat has no Leave button", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    seedThread(db);
    const screen = await openBookings(page, OWNER, "owner");

    await expect(screen.getByTestId("chat-row-Chloe")).toBeVisible();
    await screen.getByTestId("chat-row-Chloe").click();
    await expect(screen.getByTestId("chat-leave")).toHaveCount(0); // the back arrow is the way out
    await page.goBack();
    await expect(screen.getByTestId("chat-row-Chloe")).toBeVisible();

    // A swipe to the left leaves the chat: gone from my list, the history stays and Chloe still has it.
    const row = await box(screen.getByTestId("chat-row-Chloe"));
    const y = row.y + row.height / 2;
    await drag(page, { x: row.x + row.width - 10, y }, { x: row.x + 10, y }, 12);
    await expect(screen.getByTestId("chat-row-Chloe")).toHaveCount(0);
    expect(db.chat_messages).toHaveLength(4);
    expect(db.chat_threads[0].owner_left_at).not.toBeNull();
    expect(db.chat_threads[0].sitter_left_at).toBeNull();

    // Start it again: the chat is back with its history.
    await startChatFromRow(page, "Chloe");
    await expect(screen.getByTestId("chat-bubble-me")).toHaveCount(3);
  });

  test("the booking progress bar sits on top of the chat and opens the booking", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    db.pets.push(pet(MAX, "Max", "dog"));
    db.bookings.push({
      id: BOOKING,
      owner_id: OWNER.id,
      sitter_id: SITTER.id,
      status: "requested",
      service_type: "boarding",
      meet_greet_status: "not_needed",
      created_at: "2026-10-02T18:00:00Z",
    });
    db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
    const screen = await openBookings(page, OWNER, "owner");

    await screen.getByTestId("chat-row-Chloe").click();
    await expect(screen.getByTestId("stage-bar")).toBeVisible();
    await screen.getByTestId("chat-stage").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}$`));
  });

  test("Start chat on a sitter's pages carries the stay: the first card, and Request booking in the chat is filled in", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    const drop = "2030-10-24T13:00:00.000Z";
    const pick = "2030-10-28T21:00:00.000Z";
    const stay = `drop=${encodeURIComponent(drop)}&pick=${encodeURIComponent(pick)}&pets=${MAX}`;

    // The stay follows See schedule and a day, and Start chat posts it as the first card.
    await page.goto(`/owner/sitters/${SITTER.id}?${stay}`);
    await screen.getByTestId("sitter-see-schedule").click();
    await expect(page).toHaveURL(new RegExp(`/calendar\\?drop=`));
    await page.goBack();
    await screen.getByTestId("start-chat").click();
    await expect(page).toHaveURL(/\/chat\//);
    await expect(screen.getByTestId("chat-stay-card")).toContainText("Max");
    await screen.getByTestId("chat-request-booking").click();
    await expect(screen.getByTestId("request-sheet")).toBeVisible();
    await screen.getByTestId("request-send").click();
    await expect.poll(() => db.requests.length).toBe(1);
    expect(db.requests[0]).toMatchObject({ p_sitter: SITTER.id, p_pets: [MAX], p_drop_off_at: drop, p_pick_up_at: pick });
  });

  test("the sitter has no Request booking in the chat, and an owner with a booking in progress has none either", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    db.pets.push(pet(MAX, "Max", "dog"));
    db.bookings.push({ id: BOOKING, owner_id: OWNER.id, sitter_id: SITTER.id, status: "requested", service_type: "boarding", meet_greet_status: "not_needed", created_at: "2026-10-02T18:00:00Z" });
    db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    await expect(app(page).getByTestId("chat-stay-card").or(app(page).getByTestId("chat-bubble-me").first())).toBeVisible();
    await expect(app(page).getByTestId("chat-request-booking")).toHaveCount(0);
  });

  test("asking about a different stay with nothing said since changes the stay card; after a message it adds one", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    const q = (drop: string, pick: string) => `drop=${encodeURIComponent(drop)}&pick=${encodeURIComponent(pick)}&pets=${MAX}`;

    await page.goto(`/owner/sitters/${SITTER.id}?${q("2030-10-20T13:00:00.000Z", "2030-10-22T21:00:00.000Z")}`);
    await screen.getByTestId("start-chat").click();
    await expect(screen.getByTestId("chat-stay-card")).toHaveCount(1);
    await page.goBack();
    await page.goto(`/owner/sitters/${SITTER.id}?${q("2030-10-20T13:00:00.000Z", "2030-10-23T21:00:00.000Z")}`);
    await screen.getByTestId("start-chat").click();
    await expect(screen.getByTestId("chat-stay-card")).toHaveCount(1); // the same card, new dates
    await expect(screen.getByTestId("chat-stay-card")).toContainText("Oct 23");

    await screen.getByTestId("chat-input").fill("Hi Chloe");
    await screen.getByTestId("chat-send").click();
    await expect(screen.getByTestId("chat-bubble-me")).toHaveCount(1);
    await page.goto(`/owner/sitters/${SITTER.id}?${q("2030-10-21T13:00:00.000Z", "2030-10-24T21:00:00.000Z")}`);
    await screen.getByTestId("start-chat").click();
    await expect(screen.getByTestId("chat-stay-card")).toHaveCount(2); // something was said: a new card
  });

  test("the header has the avatar, the name and the pinned stay: the avatar shows photos, the name opens the sitter and back returns", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    seedThread(db);
    db.chat_messages.unshift({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: { type: "stay", drop_off_at: "2030-10-24T13:00:00Z", pick_up_at: "2030-10-28T21:00:00Z", pets: [{ id: MAX, name: "Max" }] }, created_at: "2026-10-10T09:59:00.000Z" });
    db.profile_photos.push({ id: "ph1", profile_id: SITTER.id, public_id: "goldito/chloe/1" }, { id: "ph2", profile_id: SITTER.id, public_id: "goldito/chloe/2" });
    const screen = await openBookings(page, OWNER, "owner");
    await screen.getByTestId("chat-row-Chloe").click();

    await expect(screen.getByTestId("chat-header-name")).toHaveText("Chloe");
    await expect(screen.getByTestId("chat-header-pet-Max")).toBeVisible();
    await screen.getByTestId("chat-header-avatar").click();
    await expect(screen.getByTestId("chat-photos-photo-1")).toBeVisible();
    await screen.getByTestId("chat-photos-close").click();

    await screen.getByTestId("chat-header-name").click();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/chat/${THREAD}$`));
    await expect(screen.getByTestId("chat-header-name")).toBeVisible();
  });

  test("Request booking is a sheet over the chat: no service or pet choice, one line for the day and time, one send posts a card the sitter reads", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.sitter_profiles.push({ id: SITTER.id, service_area: "Toronto M4W", services: ["boarding"] });
    db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.chat_messages.push({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: { type: "stay", drop_off_at: "2030-10-24T13:00:00Z", pick_up_at: "2030-10-28T21:00:00Z", pets: [{ id: MAX, name: "Max" }, { id: MOCHI, name: "Mochi" }] }, created_at: "2026-10-10T09:59:00.000Z" });
    const screen = await openBookings(page, OWNER, "owner");
    await screen.getByTestId("chat-row-Chloe").click();

    await screen.getByTestId("chat-request-booking").click();
    await expect(screen.getByTestId("request-sheet")).toBeVisible();
    await expect(screen.getByTestId("chat-header")).toBeVisible(); // the chat stays behind the sheet
    await expect(screen.getByText("Who's staying?")).toHaveCount(0);
    await expect(screen.getByText("Boarding", { exact: true })).toHaveCount(0);
    await expect(screen.getByTestId("request-pets")).toContainText("Max");
    // The day and the time share one line.
    const day = await box(screen.getByTestId("request-drop-day"));
    const time = await box(screen.getByTestId("request-drop-time"));
    expect(Math.abs(day.y - time.y)).toBeLessThan(4);
    await expect(screen.getByTestId("request-drop-place")).toHaveText("At Chloe's place, Toronto M4W"); // the rough place, never the street

    // Change one place to a checked address, add a note, send everything at once.
    await page.route("**/api/geo/suggest", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [{ label: "750 Bloor St W, Toronto, ON M6G 3K4", lat: 43.664, lng: -79.42 }] }) }),
    );
    await screen.getByTestId("request-pick-change").click();
    await screen.getByTestId("request-pick-type").getByText("Elsewhere").click();
    await screen.getByTestId("request-pick-address").fill("750 Bloor");
    await expect(screen.getByTestId("request-send")).toBeDisabled(); // not checked yet
    await expect(screen.getByTestId("request-problem")).toContainText("Check the address");
    await screen.getByTestId("request-pick-address-check-address").click();
    await screen.getByTestId("request-pick-address-suggestion-1").click();
    await expect(screen.getByTestId("request-pick-address-address-ok")).toBeVisible();
    await expect(screen.getByTestId("request-pick-place")).toHaveText("At 750 Bloor St W, Toronto, ON M6G 3K4");
    await screen.getByTestId("request-note-toggle").click();
    await screen.getByTestId("request-note").fill("Max gets anxious with loud noises");
    await screen.getByTestId("request-send").click();

    await expect(screen.getByTestId("request-sheet")).toBeHidden();
    expect(db.requests).toHaveLength(1);
    expect(db.requests[0]).toMatchObject({
      p_sitter: SITTER.id,
      p_pets: [MAX, MOCHI],
      p_drop_off_location_type: "sitter_home",
      p_pick_up_location_type: "other",
      p_pick_up_note: "750 Bloor St W, Toronto, ON M6G 3K4",
      p_note: "Max gets anxious with loud noises",
      p_service_type: "boarding",
    });
    // The request is in the chat as one card with the note, and the Request booking button is gone.
    await expect(screen.getByTestId("chat-request-card")).toContainText("You sent a booking request");
    await expect(screen.getByTestId("chat-request-card")).toContainText("750 Bloor St W, Toronto, ON M6G 3K4");
    await expect(screen.getByTestId("chat-request-note")).toHaveText("“Max gets anxious with loud noises”");
    await expect(screen.getByTestId("chat-request-booking")).toHaveCount(0);
    expect(db.chat_messages.filter((m) => (m.card as { type?: string } | null)?.type === "request")).toHaveLength(1);
  });

  test("chips answer what the other person wrote; a tapped chip becomes a draft in the box and nothing is sent until Send", async ({ page }) => {
    const asked: { chips: unknown[]; drafts: unknown[] } = { chips: [], drafts: [] };
    await page.route("**/api/ai/chat-chips", (route) => {
      asked.chips.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ chips: [{ id: "c0", label: "Yes, I can host" }, { id: "c1", label: "Let me check" }], for_message_id: "m4", source: "model" }),
      });
    });
    await page.route("**/api/ai/chat-draft", (route) => {
      asked.drafts.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "Yes, I can host Max! The total is $268.13 CAD.", source: "model" }) });
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await screen.getByTestId("chat-row-Robert").click();

    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Yes, I can host");
    expect(asked.chips).toEqual([{ thread_id: THREAD }]);
    const before = db.chat_messages.length;
    await screen.getByTestId("chat-chip-1").click();
    await expect(screen.getByTestId("chat-input")).toHaveValue("Yes, I can host Max! The total is $268.13 CAD.");
    await expect(screen.getByTestId("chat-chips")).toHaveCount(0);
    expect(asked.drafts).toEqual([{ thread_id: THREAD, chip: "Yes, I can host" }]);
    expect(db.chat_messages).toHaveLength(before); // a draft is only text in the box

    // The person edits and sends it themselves.
    await screen.getByTestId("chat-input").fill("Yes, I can host Max! The total is $268.13 CAD. See you then.");
    await screen.getByTestId("chat-send").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "See you then" })).toBeVisible();
    expect(db.chat_messages).toHaveLength(before + 1);
  });

  test("chips come back after my own message as follow-ups", async ({ page }) => {
    const asked: unknown[] = [];
    await page.route("**/api/ai/chat-chips", (route) => {
      asked.push(route.request().postDataJSON());
      const labels = asked.length === 1 ? ["Yes, I can host", "Let me check"] : ["Any questions for me?", "Shall we set a Meet & Greet?"];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ chips: labels.map((label, i) => ({ id: `c${i}`, label })), for_message_id: null, source: "model" }),
      });
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await screen.getByTestId("chat-row-Robert").click();
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Yes, I can host");

    await screen.getByTestId("chat-input").fill("Hi Robert, I'm Chloe!");
    await screen.getByTestId("chat-send").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "I'm Chloe" })).toBeVisible();
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Any questions for me?");
    expect(asked).toHaveLength(2);
  });

  test("a long drafted reply is fully visible in a box that grows; Enter sends and Shift+Enter is a new line", async ({ page }) => {
    const long = "Hi Robert, thanks for asking! Max is welcome with me. He would have his own bed, two walks a day and a photo update every evening, and we can set up a Meet & Greet first if that helps you feel comfortable.";
    await page.route("**/api/ai/chat-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chips: [{ id: "c0", label: "Yes, I can host" }, { id: "c1", label: "Let me check" }], for_message_id: null, source: "model" }) }),
    );
    await page.route("**/api/ai/chat-draft", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: long, source: "model" }) }));
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await screen.getByTestId("chat-row-Robert").click();
    const input = screen.getByTestId("chat-input");
    const empty = (await box(input)).height;

    await screen.getByTestId("chat-chip-1").click();
    await expect(input).toHaveValue(long);
    await expect.poll(async () => (await box(input)).height).toBeGreaterThan(empty + 20);
    expect((await box(input)).height).toBeLessThanOrEqual(320); // about a third of the phone, then it scrolls
    // every character is inside the box: nothing is scrolled out of sight
    expect(await input.evaluate((el) => (el as HTMLTextAreaElement).scrollHeight <= (el as HTMLTextAreaElement).clientHeight + 1)).toBe(true);

    await input.fill("First line");
    await input.press("Shift+Enter");
    await input.pressSequentially("Second line");
    await expect(input).toHaveValue("First line\nSecond line");
    const before = db.chat_messages.length;
    await input.press("Enter");
    await expect.poll(() => db.chat_messages.length).toBe(before + 1);
    await expect.poll(async () => (await box(input)).height).toBeLessThanOrEqual(empty + 1);
  });

  test("a spinner holds the chips' place from the start; typing hides it; the list asks ahead so the chat opens with chips ready", async ({ page }) => {
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/ai/chat-chips", async (route) => {
      calls += 1;
      await gate;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ chips: [{ id: "c0", label: "Yes, I can host" }, { id: "c1", label: "Let me check" }], for_message_id: "m4", source: "model" }),
      });
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    // The list asked for this chat's chips as soon as it saw something new, before the chat was opened.
    await expect.poll(() => calls).toBe(1);
    await screen.getByTestId("chat-row-Robert").click();

    // Still being written: the spinner is there at once (the slot does not jump later) and the box works.
    await expect(screen.getByTestId("chat-chips-loading")).toContainText("Writing replies");
    await expect(screen.getByTestId("chat-chip-1")).toHaveCount(0);
    await screen.getByTestId("chat-input").fill("Typing first");
    await expect(screen.getByTestId("chat-chips")).toHaveCount(0); // someone who is typing does not get chips popping in
    await screen.getByTestId("chat-input").fill("");
    release();
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Yes, I can host");
    await expect(screen.getByTestId("chat-chips-loading")).toHaveCount(0);
    expect(calls).toBe(1); // the chat reused what the list asked for

    // Prefetched before the chat opens: a second visit has them ready with no new ask.
    await page.goBack();
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await screen.getByTestId("chat-row-Robert").click();
    await expect(screen.getByTestId("chat-chip-1")).toBeVisible();
    expect(calls).toBe(1);
  });

  test("with no AI the chat has no chips and typing works as always", async ({ page }) => {
    await page.route("**/api/ai/chat-chips", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "down" }) }));
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await screen.getByTestId("chat-row-Robert").click();
    await expect(screen.getByTestId("chat-input")).toBeVisible();
    await expect(screen.getByTestId("chat-chips")).toHaveCount(0);
    await screen.getByTestId("chat-input").fill("Typing still works");
    await screen.getByTestId("chat-send").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "Typing still works" })).toBeVisible();
  });

  test("an owner opening a new chat gets opener chips", async ({ page }) => {
    await page.route("**/api/ai/chat-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chips: [{ id: "c0", label: "Hi, I need care for Max" }, { id: "c1", label: "Do you take dogs?" }], for_message_id: null, source: "model" }) }),
    );
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/sitters/${SITTER.id}`);
    await app(page).getByTestId("start-chat").click();
    await expect(app(page).getByTestId("chat-chip-1")).toHaveText("Hi, I need care for Max");
    await expect(app(page).getByTestId("chat-chip-2")).toHaveText("Do you take dogs?");
  });

  // 3D.6 / 014n: the quote and its extra fees live in one card; the numbers are the server's.
  const STAY_CARD = { type: "stay", drop_off_at: "2030-10-24T13:00:00Z", pick_up_at: "2030-10-27T21:00:00Z", pets: [{ id: MAX, name: "Max" }] };
  const quoteCard = (extras: unknown[] = [], status = "sent", total = 268.13) => ({
    type: "quote",
    service_type: "boarding",
    drop_off_at: "2030-10-24T13:00:00Z",
    pick_up_at: "2030-10-27T21:00:00Z",
    pets: [{ id: MAX, name: "Max" }],
    quote: DEMO_QUOTE,
    extras,
    total,
    status,
  });

  test("the sitter prices the stay with one tap, adds a fee, and the owner's pending fee is shown as waiting", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.sitter_profiles.push({ id: SITTER.id, service_area: "Toronto M4W", services: ["boarding", "house_sitting"] });
    db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.chat_messages.push({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: STAY_CARD, created_at: "2026-10-10T09:59:00.000Z" });
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await screen.getByTestId("chat-row-Robert").click();

    await expect(screen.getByTestId("chat-request-booking")).toHaveCount(0);
    await screen.getByTestId("chat-send-quote").click();
    await expect(screen.getByTestId("send-quote-sheet")).toContainText("Max");
    await screen.getByTestId("send-quote-submit").click();

    await expect(screen.getByTestId("chat-quote-card")).toContainText("$268.13");
    await expect(screen.getByTestId("chat-send-quote")).toHaveCount(0); // the stay is priced
    await screen.getByTestId("quote-add-fee").click();
    await screen.getByTestId("add-fee-labels").getByText("Medication").click();
    await screen.getByTestId("add-fee-amount").fill("12.50");
    await screen.getByTestId("add-fee-submit").click();

    await expect(screen.getByTestId("quote-extra-offered")).toContainText("Medication");
    await expect(screen.getByTestId("quote-extra-offered")).toContainText("Waiting for an answer");
    await expect(screen.getByTestId("quote-total")).toHaveText("$268.13 CAD"); // not accepted yet
    await expect(screen.getByTestId("quote-confirm")).toHaveCount(0);
  });

  test("the owner accepts one fee and declines another: the total follows, and the quote is confirmed after the last answer", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.chat_messages.push(
      { id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: STAY_CARD, created_at: "2026-10-10T09:59:00.000Z" },
      {
        id: "q0",
        thread_id: THREAD,
        sender_id: SITTER.id,
        kind: "card",
        body: null,
        card: quoteCard([
          { id: "x1", label: "Medication", amount: 12.5, status: "offered" },
          { id: "x2", label: "Extra walks", amount: 20, status: "offered" },
        ]),
        created_at: "2026-10-10T10:00:00.000Z",
      },
    );
    const screen = await openBookings(page, OWNER, "owner");
    await expect(screen.getByTestId("chat-row-Chloe")).toContainText("Quote"); // the list names a quote card
    await screen.getByTestId("chat-row-Chloe").click();

    await expect(screen.getByTestId("quote-total")).toHaveText("$268.13 CAD");
    await expect(screen.getByTestId("quote-confirm")).toBeDisabled(); // two fees wait for an answer
    await screen.getByTestId("quote-extra-offered").first().getByTestId("quote-extra-accept").click();
    await expect(screen.getByTestId("quote-total")).toHaveText("$280.63 CAD");
    await screen.getByTestId("quote-extra-offered").first().getByTestId("quote-extra-decline").click();
    await expect(screen.getByTestId("quote-total")).toHaveText("$280.63 CAD"); // a declined fee is not in the total
    await expect(screen.getByTestId("quote-extra-declined")).toContainText("Declined");
    await screen.getByTestId("quote-confirm").click();

    await expect(screen.getByTestId("quote-status")).toHaveText("Confirmed");
    await expect(screen.getByTestId("quote-confirm")).toHaveCount(0);
    expect((db.chat_messages.find((m) => m.id === "q0")!.card as { status: string }).status).toBe("confirmed");
  });

  test("a sitter who has not set a price gets the plain reason", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.chat_messages.push({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: STAY_CARD, created_at: "2026-10-10T09:59:00.000Z" });
    db.quote_error = "rates_not_set";
    db.quote_error_detail = "boarding";
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByTestId("sitter-bookings-tabs-chats").click();
    await screen.getByTestId("chat-row-Robert").click();
    await screen.getByTestId("chat-send-quote").click();
    await screen.getByTestId("send-quote-submit").click();
    await expect(screen.getByText("This sitter hasn't set a Boarding price yet.")).toBeVisible();
  });

  // 3D.7 / 014o: Meet & Greet, both say yes, the final quote and the payment, all in the chat. The stage comes from the
  // database; the cards hold only the booking's id; the footer is the one thing that is the person's turn.
  const REQUEST_CARD = (bookingId: string) => ({
    type: "request",
    booking_id: bookingId,
    service_type: "boarding",
    note: null,
    drop_off_at: "2030-10-24T13:00:00Z",
    drop_off_place: { type: "sitter_home", note: null },
    pick_up_at: "2030-10-27T21:00:00Z",
    pick_up_place: { type: "sitter_home", note: null },
    pets: [{ id: MAX, name: "Max" }],
  });

  /** A pair with a request in the chat; `firstTime` decides whether a Meet & Greet is needed. */
  function seedBooking(db: MockDb, firstTime: boolean) {
    seed(db);
    db.sitter_profiles.push({ id: SITTER.id, service_area: "Toronto M4W", services: ["boarding"], meet_spots: ["Christie Pits — east entrance"] });
    db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.bookings.push({
      id: BOOKING,
      owner_id: OWNER.id,
      sitter_id: SITTER.id,
      status: "requested",
      service_type: "boarding",
      meet_greet_status: firstTime ? "required" : "not_needed",
      created_at: "2026-10-02T18:00:00Z",
    });
    db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
    for (const [kind, at] of [
      ["drop_off", "2030-10-24T13:00:00.000Z"],
      ["pick_up", "2030-10-27T21:00:00.000Z"],
    ]) {
      db.booking_handoffs.push({
        id: `h-${kind}`,
        booking_id: BOOKING,
        kind,
        scheduled_at: at,
        location_type: "sitter_home",
        location_note: null,
        within_sitter_hours: true,
        status: "proposed",
        proposed_by: OWNER.id,
        completed_at: null,
        created_at: "2026-10-02T18:00:00Z",
      });
    }
    db.chat_messages.push({ id: "r0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: REQUEST_CARD(BOOKING), created_at: "2026-10-10T09:59:00.000Z" });
  }

  /** Switch phones: drop the stored session, sign in as someone else and open the chat. */
  async function openChatAs(page: Page, user: MockUser) {
    await page.evaluate(() => localStorage.clear());
    await signIn(page, user);
    await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
    await page.goto(`/chat/${THREAD}`);
    return app(page);
  }

  const circles = async (screen: ReturnType<typeof app>) => ({
    label: await screen.getByTestId("stage-bar").getAttribute("aria-label"),
    labels: await screen.locator('[data-testid^="stage-step-"]').allTextContents(),
  });

  test("a first-time pair goes from the sitter's yes to a paid booking in the chat, and the five circles follow the database", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, true);

    // Chloe says yes to meeting: the dates are held and the Meet & Greet card appears.
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/chat/${THREAD}`);
    let screen = app(page);
    expect(await circles(screen)).toEqual({ label: "Step 1 of 5", labels: ["Request", "Meet", "Confirm", "Pay", "Stay"] });
    await expect(screen.getByTestId("chat-next-interest")).toHaveText("Yes, let's meet");
    await screen.getByTestId("chat-next-interest").click();
    await expect(screen.getByTestId("meet-greet")).toBeVisible();
    expect((await circles(screen)).label).toBe("Step 2 of 5");

    // She picks a time from the footer; the card holds the plan and the footer waits.
    await screen.getByTestId("chat-next-meet").click();
    await screen.getByTestId("meet-spot-Christie Pits — east entrance").click();
    await screen.getByTestId("meet-send").click();
    await expect(screen.getByTestId("chat-waiting")).toHaveText("Waiting for Robert");
    expect(db.meetGreetCalls.find((c) => c.fn === "propose_meet_greet")).toBeTruthy();

    // Robert accepts from his footer; after the time has come he says they met. The card is now one line.
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-next-meet")).toHaveText("Accept");
    await screen.getByTestId("chat-next-meet").click();
    await expect(screen.getByTestId("meet-greet")).toContainText("Meet & Greet set");
    db.bookings[0].meet_greet_at = new Date(Date.now() - 3_600_000).toISOString();
    await page.reload();
    await expect(screen.getByTestId("chat-next-meet")).toHaveText("Done, we met");
    await screen.getByTestId("chat-next-meet").click();
    await expect(screen.getByTestId("meet-greet")).toContainText("Met ✓");
    expect((await circles(screen)).label).toBe("Step 3 of 5");

    // Both say yes: the owner after reading the summary, the sitter with one tap, in either order.
    await expect(screen.getByTestId("chat-agreement-card")).toContainText("Chloe: not yet");
    await screen.getByTestId("chat-next-agree").click();
    await expect(screen.getByTestId("agree-sheet")).toContainText("Max");
    await expect(screen.getByTestId("agree-price")).toHaveText("$268.13");
    await screen.getByTestId("agree-submit").click();
    await expect(screen.getByTestId("agreement-owner")).toContainText("✓ Robert would like to book");
    await expect(screen.getByTestId("chat-waiting")).toHaveText("Waiting for Chloe");
    await expect(screen.getByTestId("chat-next-pay")).toHaveCount(0); // nobody pays before both said yes
    expect(db.bookings[0].status).toBe("requested");

    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-next-accept")).toHaveText("I accept");
    await screen.getByTestId("chat-next-accept").click();
    await expect(screen.getByTestId("chat-agreement-card")).toContainText("Booked, you both agreed");
    expect(db.bookings[0].status).toBe("confirmed");
    expect((await circles(screen)).label).toBe("Step 4 of 5");

    // The sitter sends the final quote and adds a fee.
    await expect(screen.getByTestId("chat-payment-card")).toContainText("Waiting for Robert to pay");
    await screen.getByTestId("chat-next-final_quote").click();
    await screen.getByTestId("send-quote-submit").click();
    await expect(screen.getByTestId("chat-quote-card")).toContainText("$268.13");
    await screen.getByTestId("quote-add-fee").click();
    await screen.getByTestId("add-fee-labels").getByText("Medication").click();
    await screen.getByTestId("add-fee-amount").fill("12.50");
    await screen.getByTestId("add-fee-submit").click();
    await expect(screen.getByTestId("chat-waiting")).toHaveText("Waiting for Robert");

    // The owner answers the fee, confirms the quote and only then can pay; Checkout shows the same total.
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-next-confirm_quote")).toBeDisabled();
    await screen.getByTestId("quote-extra-accept").click();
    await screen.getByTestId("chat-next-confirm_quote").click();
    await expect(screen.getByTestId("chat-next-pay")).toHaveText("Pay $280.63");
    await expect(screen.getByTestId("payment-total")).toHaveText("$280.63");
    await screen.getByTestId("chat-next-pay").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}/checkout$`));
    await expect(screen.getByTestId("quote-extra-0")).toContainText("Medication");
    await expect(screen.getByTestId("checkout-quote").getByTestId("quote-total")).toHaveText("$280.63 CAD");
    await expect(screen.getByTestId("checkout-pay")).toContainText("Pay $280.63");
    for (const kind of ["emergency_vet", "safe_return", "handoff_rules", "cohabitation"]) {
      await screen.getByTestId(`consent-${kind}-check`).click();
    }
    await screen.getByTestId("checkout-signer").fill("Robert");
    await screen.getByTestId("checkout-pay").click();
    await expect(screen.getByTestId("toast")).toContainText("You're all set");
    expect((db.bookings[0].price_snapshot as { total: number; extras: unknown[] }).total).toBe(280.63);
    expect((db.bookings[0].price_snapshot as { extras: unknown[] }).extras).toEqual([{ label: "Medication", amount: 12.5 }]);

    await page.goto(`/chat/${THREAD}`);
    await expect(screen.getByTestId("chat-payment-card")).toContainText("Held until the stay ends");
    expect((await circles(screen)).label).toBe("Step 5 of 5");
  });

  test("a pair that has met skips the Meet & Greet: Meet is already checked and both only say yes", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);

    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/chat/${THREAD}`);
    let screen = app(page);
    expect(await circles(screen)).toEqual({ label: "Step 3 of 5", labels: ["Request", "Meet", "Confirm", "Pay", "Stay"] });
    await expect(screen.getByTestId("chat-next-interest")).toHaveCount(0);
    await expect(screen.getByTestId("meet-greet")).toHaveCount(0);
    await screen.getByTestId("chat-next-accept").click();
    await expect(screen.getByTestId("chat-waiting")).toHaveText("Waiting for Robert");
    expect(db.bookings[0].status).toBe("requested"); // one yes is not a booking

    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("agreement-sitter")).toContainText("✓ Chloe accepts");
    await screen.getByTestId("chat-next-agree").click();
    await screen.getByTestId("agree-submit").click();
    await expect(screen.getByTestId("chat-agreement-card")).toContainText("Booked, you both agreed");
    expect(db.bookings[0].status).toBe("confirmed");
    // The sitter has no final quote yet: the owner waits and cannot pay.
    await expect(screen.getByTestId("chat-waiting")).toHaveText("Waiting for Chloe");
    await expect(screen.getByTestId("chat-next-pay")).toHaveCount(0);
  });

  test("a chat with no booking yet shows the circles on Request", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.chat_messages.push({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: STAY_CARD, created_at: "2026-10-10T09:59:00.000Z" });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    expect(await circles(app(page))).toEqual({ label: "Step 1 of 5", labels: ["Request", "Meet", "Confirm", "Pay", "Stay"] });
    await expect(app(page).getByTestId("chat-request-booking")).toBeVisible();
  });

  // #142 second half: besides the word chips, one action chip can point at the next step. It does what the footer or the
  // card would do, only while that is possible on the screen, and nothing happens until the person presses it.
  const chipsAnswer = async (page: Page, action: { id: string; label: string } | null) =>
    page.route("**/api/ai/chat-chips", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ chips: [{ id: "c0", label: "Sounds good" }, { id: "c1", label: "One moment" }], action, for_message_id: "t1", source: "model" }),
      }),
    );
  const saidLast = (db: MockDb, from: string, body: string) =>
    db.chat_messages.push({ id: "t1", thread_id: THREAD, sender_id: from, kind: "text", body, card: null, created_at: "2026-10-10T10:05:00.000Z" });

  test("the owner is pointed at I'd like to book; the chip only opens the sheet", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);
    saidLast(db, SITTER.id, "Shall we book it?");
    await chipsAnswer(page, { id: "agree", label: "I'd like to book" });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);

    await expect(screen.getByTestId("chat-action-chip")).toContainText("I'd like to book");
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Sounds good"); // the word chips stay
    expect(db.agreements).toHaveLength(0);
    await screen.getByTestId("chat-action-chip").click();
    await expect(screen.getByTestId("agree-sheet")).toBeVisible();
    expect(db.agreements).toHaveLength(0); // opening it says nothing yet
    await expect(screen.getByTestId("chat-action-chip")).toHaveCount(0);
  });

  test("the sitter asked for a price is pointed at Send quote", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    db.sitter_profiles.push({ id: SITTER.id, service_area: "Toronto M4W", services: ["boarding"] });
    db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.chat_messages.push({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: STAY_CARD, created_at: "2026-10-10T09:59:00.000Z" });
    saidLast(db, OWNER.id, "How much would it be?");
    await chipsAnswer(page, { id: "send_quote", label: "Send quote" });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);

    await screen.getByTestId("chat-action-chip").click();
    await expect(screen.getByTestId("send-quote-sheet")).toBeVisible();
    expect(db.chat_messages.filter((m) => (m.card as { type?: string } | null)?.type === "quote")).toHaveLength(0);
  });

  test("an action that is not possible here is not shown, even if the server names it", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);
    saidLast(db, SITTER.id, "Ready when you are");
    await chipsAnswer(page, { id: "pay", label: "Pay" }); // the booking is not confirmed yet
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);

    await expect(screen.getByTestId("chat-chip-1")).toBeVisible();
    await expect(screen.getByTestId("chat-action-chip")).toHaveCount(0);
  });

  test("an answer without an action shows only the word chips", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);
    saidLast(db, SITTER.id, "Thanks!");
    await chipsAnswer(page, null);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);

    await expect(screen.getByTestId("chat-chip-1")).toBeVisible();
    await expect(screen.getByTestId("chat-action-chip")).toHaveCount(0);
  });

  test("Skip Meet & Greet from a chip opens the card's question and asks nothing until confirmed", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, true);
    db.bookings[0].sitter_interest_at = new Date().toISOString();
    db.bookings[0].meet_greet_due_at = new Date(Date.now() + 2 * 86_400_000).toISOString();
    // The sitter's first yes posted the Meet & Greet card (the 014o trigger).
    db.chat_messages.push({ id: "mg0", thread_id: THREAD, sender_id: SITTER.id, kind: "card", body: null, card: { type: "meet_greet", booking_id: BOOKING, rev: 0 }, created_at: "2026-10-10T10:01:00.000Z" });
    saidLast(db, SITTER.id, "Do we really have to meet first?");
    await chipsAnswer(page, { id: "meet_skip", label: "Skip Meet & Greet" });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);

    await screen.getByTestId("chat-action-chip").click();
    await expect(screen.getByTestId("meet-skip-sheet")).toContainText("If Chloe says no, this booking will be cancelled.");
    expect(db.meetGreetCalls.find((c) => c.fn === "request_skip_meet_greet")).toBeUndefined();
    await screen.getByTestId("meet-skip-confirm").click();
    await expect.poll(() => db.meetGreetCalls.some((c) => c.fn === "request_skip_meet_greet")).toBe(true);
  });

  test("someone outside the chat cannot open it", async ({ page }) => {
    const other: MockUser = { id: "00000000-0000-4000-8000-000000000009", email: "joy@goldito.test", password: "joy-pass", role: "owner", displayName: "Joy" };
    const { db } = await mockSupabase(page, [OWNER, SITTER, other]);
    seedThread(db);
    await signIn(page, other);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    await expect(app(page).getByText("Chat not found")).toBeVisible();
  });
});
