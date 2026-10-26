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

/** The Chat tab (#329): the list of chats has its own tab, out of Bookings. */
async function openChats(page: Page, user: MockUser, home: "owner" | "sitter") {
  await signIn(page, user);
  await expect(page).toHaveURL(new RegExp(`/${home}$`));
  const screen = app(page);
  await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${home}/chat$`));
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
    // #227: one line, the dates and the pets with their species, no "Stay" title, no drop-off or pick-up wording.
    await expect(screen.getByTestId("chat-stay-line")).toHaveText(/^\w{3} \d{1,2} \d{1,2}:\d{2} [AP]M to \w{3} \d{1,2} \d{1,2}:\d{2} [AP]M\s2 pets: 🐶 Max, 🐱 Mochi$/);
    for (const word of ["Stay", "Drop-off", "Pick-up"]) await expect(screen.getByTestId("chat-stay-card")).not.toContainText(word);
    // The owner's header has no pets (the sitter's does, #263); my stay card sits on the right like my messages.
    await expect(screen.getByTestId("chat-header-stay")).toHaveCount(0);
    const frame = await box(page.locator("iframe"));
    const card = await box(screen.getByTestId("chat-stay-card"));
    expect(card.x + card.width / 2).toBeGreaterThan(frame.x + frame.width / 2);
    expect((await box(screen.getByTestId("chat-input"))).height).toBeLessThanOrEqual(48);
    await expect(screen.getByTestId("chat-empty")).toBeHidden();

    // Free chat: the same person sends again and again.
    for (const text of ["Quick question", "Is Max okay with cats?", "Thanks!"]) {
      await screen.getByTestId("chat-input").fill(text);
      await screen.getByTestId("chat-send").click();
      await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: text })).toBeVisible();
    }
    expect(db.chat_messages.filter((m) => m.kind === "text")).toHaveLength(4); // the hello that starts the chat, then the three

    // The sitter writes back (as they would from their own phone).
    const thread = db.chat_threads[0];
    db.chat_messages.push({ id: "reply", thread_id: thread.id, sender_id: SITTER.id, kind: "text", body: "Max is welcome!", card: null, created_at: new Date(Date.now() + 5000).toISOString() });
    await expect(screen.getByTestId("chat-bubble-them").filter({ hasText: "Max is welcome!" })).toBeVisible({ timeout: 10000 });

    // Back leaves the chat (the profile, then the list); the same sitter opens the same thread, with the history.
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/owner\/bookings$/);
    await expect(screen.getByTestId("chat-row-Chloe")).toHaveCount(0); // chats have their own tab now (#329)
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
    await expect(screen.getByTestId("chat-row-Chloe")).toContainText("Max is welcome!");
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    await startChatFromRow(page, "Chloe");
    await expect(page).toHaveURL(url);
    await expect(screen.getByTestId("chat-bubble-me")).toHaveCount(4);
    expect(db.chat_threads).toHaveLength(1);
    expect(db.chat_messages.filter((m) => (m.card as { type?: string } | null)?.type === "stay")).toHaveLength(1); // the same stay is not posted twice
    expect(db.bookings).toHaveLength(1); // starting the chat made the booking once, not on every Start chat
  });

  test("the sitter sees the unread count in Chats, opens at the latest message and replies as often as they like", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");

    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
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
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
    await expect(screen.getByTestId("chat-row-Robert")).toContainText("And the leash");
    await expect(screen.getByTestId("chat-unread-Robert")).toHaveCount(0);
  });

  test("the Chat tab counts what is unread and points at the newest chat with something new (#228, #329)", async ({ page }) => {
    const JOY: MockUser = { id: "00000000-0000-4000-8000-000000000005", email: "joy@goldito.test", password: "coco-and-toto", role: "owner", displayName: "Joy" };
    const JOY_THREAD = "00000000-0000-4000-8000-0000000000f2";
    const { db } = await mockSupabase(page, [OWNER, SITTER, JOY]);
    seedThread(db); // Robert wrote twice, unread, at 10:03
    db.chat_threads.push({ id: JOY_THREAD, owner_id: JOY.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.chat_messages.push({ id: "j1", thread_id: JOY_THREAD, sender_id: JOY.id, kind: "text", body: "Hi! Are you free in May?", card: null, created_at: "2026-10-10T10:05:00.000Z" });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);
    const chatTab = screen.getByRole("tab").filter({ hasText: "Chat" });

    // Two owners wrote: the tab says 3, and in the list the newer chat (Joy) is the one pointed at.
    await expect(chatTab).toContainText("3");
    await chatTab.click();
    await expect(screen.getByTestId("chat-row-Joy-new")).toBeVisible();
    await expect(screen.getByTestId("chat-row-Robert-new")).toHaveCount(0);
    // Bookings has no chats any more.
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
    await expect(screen.getByTestId("sitter-bookings-tabs-chats")).toHaveCount(0);

    // Read both chats: nothing new, no number on the tab and no row pointed at.
    for (const thread of [THREAD, JOY_THREAD]) {
      await page.goto(`/chat/${thread}`);
      await expect(screen.getByTestId("chat-input")).toBeVisible();
    }
    await page.goto("/sitter/chat");
    await expect(screen.getByTestId("chat-row-Robert")).toBeVisible();
    await expect(screen.getByTestId(/^chat-row-.*-new$/)).toHaveCount(0);
    await expect(chatTab).not.toContainText(/\d/);
  });

  test("a chat that turns unread while the sitter is elsewhere shows on the Chat tab without a reload (#228, #329)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    db.chat_threads[0].sitter_read_at = "2026-10-10T10:09:00.000Z"; // everything read
    const screen = await openBookings(page, SITTER, "sitter");
    const chatTab = screen.getByRole("tab").filter({ hasText: "Chat" });
    await expect(chatTab).not.toContainText(/\d/);

    // Robert writes while Chloe is looking at Bookings.
    db.chat_messages.push({ id: "m9", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "One more thing", card: null, created_at: new Date().toISOString() });
    await expect(chatTab).toContainText("1", { timeout: 15_000 });
    await chatTab.click();
    await expect(screen.getByTestId("chat-row-Robert-new")).toBeVisible();
  });

  test("leaving a chat hides it from my list only; a swipe does it and the chat has no Leave button", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    seedThread(db);
    const screen = await openChats(page, OWNER, "owner");

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

    // Start it again from Bookings: the chat is back with its history.
    await screen.getByRole("tab").getByText("Bookings", { exact: true }).click();
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
    const screen = await openChats(page, OWNER, "owner");

    await screen.getByTestId("chat-row-Chloe").click();
    await expect(screen.getByTestId("stage-bar")).toBeVisible();
    await screen.getByTestId("chat-stage").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}$`));
  });

  test("Start chat on a sitter's pages carries the stay: the first card, a hello, and the booking request made from it", async ({ page }) => {
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
    // Starting the chat is the booking request: no sheet, no Request booking button.
    await expect.poll(() => db.requests.length).toBe(1);
    expect(db.requests[0]).toMatchObject({ p_sitter: SITTER.id, p_pets: [MAX], p_drop_off_at: drop, p_pick_up_at: pick });
    await expect(screen.getByTestId("request-sheet")).toHaveCount(0);
    await expect(screen.getByTestId("chat-bubble-me")).toContainText("Hi Chloe, I'm Robert. Could you take Max for these days?");
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
    await expect(app(page).getByTestId("chat-next-meet_start")).toHaveCount(0);
  });

  test("asking about a different stay adds a new stay card, since the hello was said", async ({ page }) => {
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
    await page.goto(`/owner/sitters/${SITTER.id}?${q("2030-10-21T13:00:00.000Z", "2030-10-23T21:00:00.000Z")}`);
    await screen.getByTestId("start-chat").click();
    await expect(screen.getByTestId("chat-stay-card")).toHaveCount(2); // the hello was said: a new card
    await expect(screen.getByTestId("chat-stay-card").last()).toContainText("Oct 23");
    expect(db.bookings).toHaveLength(1); // one booking in progress is not made twice
  });

  test("the header has the avatar, the name and the pinned stay: the avatar shows photos, the name opens the sitter and back returns", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db);
    seedThread(db);
    db.chat_messages.unshift({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: { type: "stay", drop_off_at: "2030-10-24T13:00:00Z", pick_up_at: "2030-10-28T21:00:00Z", pets: [{ id: MAX, name: "Max" }] }, created_at: "2026-10-10T09:59:00.000Z" });
    db.profile_photos.push({ id: "ph1", profile_id: SITTER.id, public_id: "goldito/chloe/1" }, { id: "ph2", profile_id: SITTER.id, public_id: "goldito/chloe/2" });
    const screen = await openChats(page, OWNER, "owner");
    await screen.getByTestId("chat-row-Chloe").click();

    await expect(screen.getByTestId("chat-header-name")).toHaveText("Chloe");
    await expect(screen.getByTestId("chat-header-stay")).toHaveCount(0);
    await screen.getByTestId("chat-header-avatar").click();
    await expect(screen.getByTestId("chat-photos-photo-1")).toBeVisible();
    await screen.getByTestId("chat-photos-close").click();

    await screen.getByTestId("chat-header-name").click();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/chat/${THREAD}$`));
    await expect(screen.getByTestId("chat-header-name")).toBeVisible();
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
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
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

  test("after a pause in typing the chips follow the text; emptying the box brings the usual chips back; the draft keeps the typed text (#235)", async ({ page }) => {
    const asked: { typed: unknown[]; drafts: unknown[] } = { typed: [], drafts: [] };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/ai/chat-chips", async (route) => {
      const body = route.request().postDataJSON() as { typed?: string };
      if (body.typed) {
        asked.typed.push(body);
        await gate;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chips: [{ id: "c0", label: "Ask about early pick-up" }, { id: "c1", label: "Ask about the leash" }], for_message_id: "m4", source: "model" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chips: [{ id: "c0", label: "Yes, I can host" }, { id: "c1", label: "Let me check" }], for_message_id: "m4", source: "model" }) });
    });
    await page.route("**/api/ai/chat-draft", (route) => {
      asked.drafts.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "Could Max be picked up a bit earlier?", source: "model" }) });
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
    await screen.getByTestId("chat-row-Robert").click();
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Yes, I can host");

    // Typing hides the usual chips; nothing is asked while the text is still changing.
    await screen.getByTestId("chat-input").fill("can you take them early");
    await expect(screen.getByTestId("chat-chips")).toHaveCount(0);
    expect(asked.typed).toHaveLength(0);
    // After 1.5 seconds without typing: a spinner, then chips that fit the text.
    await expect(screen.getByTestId("chat-chips-loading")).toContainText("Finding replies", { timeout: 4000 });
    expect(asked.typed).toEqual([{ thread_id: THREAD, typed: "can you take them early" }]);
    release();
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Ask about early pick-up");
    await expect(screen.getByTestId("chat-chip-2")).toHaveText("Ask about the leash");

    // A tapped chip goes through the draft step with the typed text; the box gets the draft, nothing is sent.
    const before = db.chat_messages.length;
    await screen.getByTestId("chat-chip-1").click();
    await expect(screen.getByTestId("chat-input")).toHaveValue("Could Max be picked up a bit earlier?");
    expect(asked.drafts).toEqual([{ thread_id: THREAD, chip: "Ask about early pick-up", typed: "can you take them early" }]);
    expect(db.chat_messages).toHaveLength(before);
    expect(asked.typed).toHaveLength(1); // the draft in the box does not ask again

    // Emptying the box brings the usual chips back.
    await screen.getByTestId("chat-input").fill("");
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Yes, I can host");
  });

  test("when the typed-text ask fails the box just has no chips, and the usual ones return on clearing", async ({ page }) => {
    let typedAsks = 0;
    await page.route("**/api/ai/chat-chips", (route) => {
      const body = route.request().postDataJSON() as { typed?: string };
      if (body.typed) typedAsks += 1;
      if (body.typed) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "down" }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chips: [{ id: "c0", label: "Yes, I can host" }, { id: "c1", label: "Let me check" }], for_message_id: "m4", source: "model" }) });
    });
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
    await screen.getByTestId("chat-row-Robert").click();
    await expect(screen.getByTestId("chat-chip-1")).toBeVisible();
    await screen.getByTestId("chat-input").fill("anything at all");
    await expect.poll(() => typedAsks, { timeout: 4000 }).toBe(1);
    await expect(screen.getByTestId("chat-chips")).toHaveCount(0); // nothing to show: no guess
    await screen.getByTestId("chat-input").fill("");
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Yes, I can host");
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
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
    await screen.getByTestId("chat-row-Robert").click();
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Yes, I can host");

    await screen.getByTestId("chat-input").fill("Hi Robert, I'm Chloe!");
    await screen.getByTestId("chat-send").click();
    await expect(screen.getByTestId("chat-bubble-me").filter({ hasText: "I'm Chloe" })).toBeVisible();
    await expect(screen.getByTestId("chat-chip-1")).toHaveText("Any questions for me?");
    expect(asked).toHaveLength(2);
  });

  test("the message box grows with the text up to about six lines, then it stays that tall and scrolls; Enter sends and Shift+Enter is a new line", async ({ page }) => {
    const medium = "Hi Robert, thanks for asking! Max is welcome with me and he would have his own bed.";
    const long = Array.from({ length: 6 }, () => "Max would have his own bed, two walks a day and a photo update every evening.").join(" ");
    await page.route("**/api/ai/chat-chips", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chips: [{ id: "c0", label: "Yes, I can host" }, { id: "c1", label: "Let me check" }], for_message_id: null, source: "model" }) }),
    );
    await page.route("**/api/ai/chat-draft", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: medium, source: "model" }) }));
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
    await screen.getByTestId("chat-row-Robert").click();
    const input = screen.getByTestId("chat-input");
    const empty = (await box(input)).height;
    const metrics = () => input.evaluate((el) => { const t = el as HTMLTextAreaElement; return { scroll: t.scrollHeight, client: t.clientHeight, bar: t.offsetWidth - t.clientWidth }; });

    // A drafted reply that fits is fully visible, no scrolling.
    await screen.getByTestId("chat-chip-1").click();
    await expect(input).toHaveValue(medium);
    await expect.poll(async () => (await box(input)).height).toBeGreaterThan(empty + 20);
    expect((await box(input)).height).toBeLessThanOrEqual(150);
    expect((await metrics()).scroll).toBeLessThanOrEqual((await metrics()).client + 1);

    // Past about six lines the box stops growing and shows a scrollbar.
    await input.fill(long);
    await expect.poll(async () => (await box(input)).height).toBeGreaterThanOrEqual(140);
    expect((await box(input)).height).toBeLessThanOrEqual(150);
    const tall = await metrics();
    expect(tall.scroll).toBeGreaterThan(tall.client + 20);
    expect(tall.bar).toBeGreaterThan(0);

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
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
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
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
    await screen.getByTestId("chat-row-Robert").click();
    await expect(screen.getByTestId("chat-chip-1")).toBeVisible();
    expect(calls).toBe(1);
  });

  test("with no AI the chat has no chips and typing works as always", async ({ page }) => {
    await page.route("**/api/ai/chat-chips", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "down" }) }));
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    const screen = await openBookings(page, SITTER, "sitter");
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
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

  test("quotes sent before #265: an accepted fee stays a plain line in the total, an unanswered one has no buttons (#265)", async ({ page }) => {
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
          { id: "x2", label: "Extra walks", amount: 20, status: "declined" },
        ]),
        created_at: "2026-10-10T10:00:00.000Z",
      },
    );
    const screen = await openChats(page, OWNER, "owner");
    await expect(screen.getByTestId("chat-row-Chloe")).toContainText("Quote"); // the list names a quote card
    await screen.getByTestId("chat-row-Chloe").click();

    // An old fee nobody answered: no Accept or Decline, a line that a new quote replaces it, and Confirm stays off.
    await expect(screen.getByTestId("quote-total")).toHaveText("$268.13 CAD");
    await expect(screen.getByTestId("quote-extra-accept")).toHaveCount(0);
    await expect(screen.getByTestId("quote-extra-decline")).toHaveCount(0);
    await expect(screen.getByTestId("chat-quote-card")).not.toContainText("Medication");
    await expect(screen.getByTestId("chat-quote-card")).not.toContainText("Extra walks"); // no struck-out declined line
    await expect(screen.getByTestId("quote-legacy-fee")).toBeVisible();
    await expect(screen.getByTestId("quote-confirm")).toBeDisabled();

    // An old quote whose fee was accepted: the line is part of its total and it can be confirmed.
    (db.chat_messages.find((m) => m.id === "q0")!.card as Record<string, unknown>).extras = [
      { id: "x1", label: "Medication", amount: 12.5, status: "accepted" },
    ];
    (db.chat_messages.find((m) => m.id === "q0")!.card as Record<string, unknown>).total = 280.63;
    await page.reload();
    await expect(screen.getByTestId("quote-extra-accepted")).toContainText("Medication");
    await expect(screen.getByTestId("quote-total")).toHaveText("$280.63 CAD");
    await expect(screen.getByTestId("quote-legacy-fee")).toHaveCount(0);
    await screen.getByTestId("quote-confirm").click();
    await expect(screen.getByTestId("quote-status")).toHaveText("Confirmed");
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
    test.setTimeout(90_000); // the whole stay from the first yes to the payment, on two phones
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, true);

    // Chloe says yes to meeting: the dates are held and the Meet & Greet card appears.
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/chat/${THREAD}`);
    let screen = app(page);
    expect(await circles(screen)).toEqual({ label: "Step 1 of 5", labels: ["Request", "Meet", "Confirm", "Pay", "Care"] });
    // The Meet & Greet card is not there yet: it comes with the sitter's yes in her own words (judged by the model).
    await expect(screen.getByTestId("chat-next-interest")).toHaveCount(0);
    await expect(screen.getByTestId("meet-greet")).toHaveCount(0);
    await page.route("**/api/ai/chat-yes", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ yes: true, for_message_id: "x" }) }));
    await screen.getByTestId("chat-input").fill("Yes, I can take Max for those days!");
    await screen.getByTestId("chat-send").click();
    await expect(screen.getByTestId("meet-greet")).toBeVisible();
    expect((await circles(screen)).label).toBe("Step 2 of 5");

    // She requests a Meet & Greet on the card; the other side answers there.
    await screen.getByTestId("meet-request").click();
    await screen.getByTestId("meet-spot-Christie Pits — east entrance").click();
    await screen.getByTestId("meet-send").click();
    await expect(screen.getByTestId("meet-greet")).toContainText("Waiting for Robert");
    expect(db.meetGreetCalls.find((c) => c.fn === "propose_meet_greet")).toBeTruthy();

    // Robert accepts on the card; it offers Done right away and asks first while it is early (#229).
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("meet-accept")).toHaveText("Accept");
    await screen.getByTestId("meet-accept").click();
    await expect(screen.getByTestId("meet-greet")).toContainText("Meet & Greet set");
    await screen.getByTestId("meet-done").click();
    await screen.getByTestId("meet-done-early-confirm").click();
    await expect(screen.getByTestId("chat-mg-update").last()).toContainText("Meet & Greet done");
    expect((await circles(screen)).label).toBe("Step 3 of 5");

    // Both say yes: the owner after reading the summary, the sitter with one tap, in either order.
    await screen.getByTestId("chat-next-agree").click();
    await expect(screen.getByTestId("agree-sheet")).toContainText("Max");
    await expect(screen.getByTestId("agree-price")).toHaveText("$268.13");
    await screen.getByTestId("agree-submit").click();
    await expect(screen.getByTestId("chat-next-pay")).toHaveCount(0); // nobody pays before both said yes
    expect(db.bookings[0].status).toBe("requested");

    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-next-accept")).toHaveText("Accept");
    await screen.getByTestId("chat-next-accept").click();
    await expect(screen.getByTestId("chat-agreement-card")).toContainText("Booked, you both agreed");
    expect(db.bookings[0].status).toBe("confirmed");
    expect((await circles(screen)).label).toBe("Step 4 of 5");

    // The sitter sends the final quote and adds a fee.
    await expect(screen.getByTestId("chat-payment-card")).toContainText("Waiting for Robert to pay");
    await screen.getByTestId("chat-next-final_quote").click();
    await expect(screen.getByTestId("send-quote-sheet")).toContainText("Send final quote");
    // The final quote prices the booking's own service; there is no service to pick.
    await expect(screen.getByTestId("send-quote-fixed-service")).toHaveText("Boarding");
    await expect(screen.getByTestId("send-quote-service")).toHaveCount(0);
    await screen.getByTestId("send-quote-submit").click();
    await expect(screen.getByTestId("chat-quote-card")).toContainText("$268.13");
    await expect(screen.getByTestId("quote-title")).toHaveText("Final quote"); // after the Meet & Greet and the agreement
    await expect(screen.getByTestId("quote-add-fee")).toHaveCount(0); // one all-inclusive price (#265)

    // The owner confirms the quote and only then can pay; Checkout shows the same total.
    screen = await openChatAs(page, OWNER);
    await screen.getByTestId("chat-quote-card").last().getByTestId("quote-confirm").click(); // on the card only (#289)
    await expect(screen.getByTestId("chat-next-pay")).toHaveText("Pay $268.13");
    await expect(screen.getByTestId("payment-total")).toHaveText("$268.13");
    await screen.getByTestId("chat-next-pay").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}/checkout$`));
    await expect(screen.getByTestId("quote-extra-0")).toHaveCount(0);
    await expect(screen.getByTestId("checkout-quote").getByTestId("quote-total")).toHaveText("$268.13 CAD");
    await expect(screen.getByTestId("checkout-pay")).toContainText("Confirm and pay $268.13");
    for (const kind of ["emergency_vet", "safe_return", "handoff_rules", "cohabitation"]) {
      await screen.getByTestId(`consent-${kind}-check`).click();
    }
    await screen.getByTestId("checkout-signer").fill("Robert");
    await screen.getByTestId("checkout-pay").click();
    await expect(screen.getByTestId("toast")).toContainText("You're all set");
    expect((db.bookings[0].price_snapshot as { total: number }).total).toBe(268.13);
    expect((db.bookings[0].price_snapshot as { extras?: unknown[] }).extras ?? []).toEqual([]);

    await page.goto(`/chat/${THREAD}`);
    await expect(screen.getByTestId("chat-payment-card")).toContainText("Held until the stay ends");
    expect((await circles(screen)).label).toBe("Step 5 of 5");
  });

  test("the owner's yes to book shows in the sitter's open chat without a refresh (#235)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);

    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);
    await screen.getByTestId("chat-next-accept").click();

    // Robert taps I'd like to book on his phone; the sitter's chat follows.
    db.bookings[0].owner_agreed_at = new Date().toISOString();
    await expect(screen.getByTestId("chat-agreement-card")).toContainText("you both agreed", { timeout: 15_000 });
  });

  test("a pair that has met skips the Meet & Greet: Meet is already checked and both only say yes", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);

    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/chat/${THREAD}`);
    let screen = app(page);
    expect(await circles(screen)).toEqual({ label: "Step 3 of 5", labels: ["Request", "Meet", "Confirm", "Pay", "Care"] });
    await expect(screen.getByTestId("chat-next-interest")).toHaveCount(0);
    await expect(screen.getByTestId("meet-greet")).toHaveCount(0);
    await screen.getByTestId("chat-next-accept").click();
    expect(db.bookings[0].status).toBe("requested"); // one yes is not a booking

    screen = await openChatAs(page, OWNER);
    await screen.getByTestId("chat-next-agree").click();
    await screen.getByTestId("agree-submit").click();
    await expect(screen.getByTestId("chat-agreement-card")).toContainText("Booked, you both agreed");
    expect(db.bookings[0].status).toBe("confirmed");
    // The sitter has no final quote yet: the owner waits and cannot pay.
    await expect(screen.getByTestId("chat-next-pay")).toHaveCount(0);
  });

  // #364 (Owner-019): a request whose drop-off passed while it waited can't be agreed; Try again never works.
  test("a request whose drop-off has passed says so and offers new times instead of Accept, on the booking (#364)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);
    db.bookings[0].sitter_accepted_at = "2026-10-02T19:00:00Z";
    const drop = db.booking_handoffs.find((h) => h.kind === "drop_off");
    if (drop) drop.scheduled_at = new Date(Date.now() - 3_600_000).toISOString();
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/bookings/${BOOKING}`);
    const screen = app(page);

    await screen.getByTestId("agree-booking").click();
    await expect(screen.getByTestId("agree-expired")).toHaveText("Drop-off time has passed.");
    await expect(screen.getByTestId("agree-submit")).toHaveCount(0);
    await screen.getByTestId("agree-new-times").click();
    await expect(screen.getByTestId("change-sheet")).toBeVisible();
    await expect(screen.getByTestId("change-kind-drop_off")).toHaveAttribute("aria-checked", "true");
    await screen.getByTestId("change-day-plus").click(); // tomorrow, same time
    await screen.getByTestId("change-send").click();
    await expect(screen.getByTestId("toast")).toContainText("Sent to Chloe");
    expect(db.proposals.at(-1)).toMatchObject({ p_booking: BOOKING, p_kind: "drop_off" });

    // Still on the booking, now with a time ahead: Accept is back and goes through.
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}$`));
    await expect(screen.getByTestId("agree-expired")).toHaveCount(0);
    await screen.getByTestId("agree-submit").click();
    await expect.poll(() => db.bookings[0].owner_agreed_at).toBeTruthy();
  });

  test("when the server says the time has passed, the chat's agree sheet offers new times, not Try again (#364)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);
    db.bookings[0].sitter_accepted_at = "2026-10-02T19:00:00Z";
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);
    // The drop-off passed between opening the chat and the tap (the 009c guard).
    await page.route("**/rpc/agree_to_book", (route) =>
      route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "P0001", message: "proposal_expired", details: null }) }),
    );

    await screen.getByTestId("chat-next-agree").click();
    await screen.getByTestId("agree-submit").click();
    await expect(screen.getByTestId("agree-expired")).toHaveText("That time has passed.");
    await expect(screen.getByTestId("error-dialog")).toHaveCount(0);
    await screen.getByTestId("agree-new-times").click();
    await expect(screen.getByTestId("change-sheet")).toBeVisible();
  });

  test("the owner can say no at the agreement step: Decline next to I'd like to book ends the request with a reason (#230)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);

    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);
    await expect(screen.getByTestId("chat-next-agree")).toBeVisible();
    await screen.getByTestId("chat-decline").click();
    const sheet = screen.getByTestId("chat-decline-sheet");
    await expect(sheet).toContainText("Not this sitter?");
    await expect(sheet).toContainText("Chloe gets a notice and the dates are free again.");
    await screen.getByTestId("chat-decline-reason-1").click(); // Found another sitter
    await screen.getByTestId("chat-decline-confirm").click();

    await expect(screen.getByTestId("toast")).toContainText("Request ended");
    expect(db.bookings[0]).toMatchObject({ status: "cancelled", cancelled_by: OWNER.id, cancel_reason: "Found another sitter" });
    // The request is over: the owner can ask again, and nothing asks for a yes any more.
    await expect(screen.getByTestId("chat-next-meet_start")).toBeVisible();
    await expect(screen.getByTestId("chat-decline")).toHaveCount(0);
  });

  test("the sitter can say no at the agreement step: Decline next to I accept declines the request (#230)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);

    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);
    await expect(screen.getByTestId("chat-next-accept")).toBeVisible();
    await screen.getByTestId("chat-decline").click();
    await expect(screen.getByTestId("chat-decline-sheet")).toContainText("Decline this booking?");
    await screen.getByTestId("chat-decline-reason-0").click(); // Fully booked those dates
    await screen.getByTestId("chat-decline-confirm").click();

    await expect(screen.getByTestId("toast")).toContainText("Request declined");
    expect(db.bookings[0]).toMatchObject({ status: "declined", sitter_note: "Fully booked those dates" });
    await expect(screen.getByTestId("chat-decline")).toHaveCount(0);
  });

  test("the owner can decline the final quote from the card or the footer (#230)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, false);

    // Both say yes, then the sitter sends the final quote.
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto(`/chat/${THREAD}`);
    let screen = app(page);
    await screen.getByTestId("chat-next-accept").click();
    screen = await openChatAs(page, OWNER);
    await screen.getByTestId("chat-next-agree").click();
    await screen.getByTestId("agree-submit").click();
    await expect(screen.getByTestId("chat-agreement-card")).toContainText("Booked, you both agreed");
    screen = await openChatAs(page, SITTER);
    await screen.getByTestId("chat-next-final_quote").click();
    await screen.getByTestId("send-quote-submit").click();
    await expect(screen.getByTestId("quote-title")).toHaveText("Final quote");
    // The sitter has no Decline on the final quote; that is the owner's answer.
    await expect(screen.getByTestId("quote-decline")).toHaveCount(0);

    screen = await openChatAs(page, OWNER);
    // The final quote's two answers show once, on the card; the footer does not repeat them (#289).
    await expect(screen.getByTestId("quote-confirm")).toBeVisible();
    await expect(screen.getByTestId("quote-decline")).toBeVisible();
    await expect(screen.getByTestId("chat-next-confirm_quote")).toHaveCount(0);
    await expect(screen.getByTestId("chat-decline")).toHaveCount(0);
    await screen.getByTestId("quote-decline").click();
    const sheet = screen.getByTestId("chat-decline-sheet");
    await expect(sheet).toContainText("Decline the final quote?");
    await expect(screen.getByTestId("chat-decline-reason-0")).toContainText("The price doesn't work");
    await screen.getByTestId("chat-decline-reason-0").click();
    await screen.getByTestId("chat-decline-confirm").click();

    await expect(screen.getByTestId("toast")).toContainText("Request ended");
    expect(db.bookings[0]).toMatchObject({ status: "cancelled", cancelled_by: OWNER.id, cancel_reason: "The price doesn't work" });
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
    expect(await circles(app(page))).toEqual({ label: "Step 1 of 5", labels: ["Request", "Meet", "Confirm", "Pay", "Care"] });
    await expect(app(page).getByTestId("chat-next-meet_start")).toBeVisible();
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
    await expect(screen.getByTestId("meet-skip-sheet")).toContainText("Chloe can accept, ask to meet, or decline.");
    expect(db.meetGreetCalls.find((c) => c.fn === "request_skip_meet_greet")).toBeUndefined();
    await screen.getByTestId("meet-skip-confirm").click();
    await expect.poll(() => db.meetGreetCalls.some((c) => c.fn === "request_skip_meet_greet")).toBe(true);
  });

  test("once the sitter said yes the chat's Meet & Greet card offers Skip or Request to both (#236)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, true);
    // post_booking_request_card (015f) posts the Meet & Greet card under the request card.
    db.chat_messages.push({ id: "mg0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: { type: "meet_greet", booking_id: BOOKING, rev: 0 }, created_at: "2026-10-10T09:59:01.000Z" });
    db.bookings[0].sitter_interest_at = new Date().toISOString(); // her yes already brought the card up
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    let screen = app(page);
    await expect(screen.getByTestId("meet-request")).toBeVisible();
    await expect(screen.getByTestId("meet-skip")).toBeVisible();
    await expect(screen.getByTestId("chat-waiting")).toHaveCount(0);
    await screen.getByTestId("meet-skip").click();
    await screen.getByTestId("meet-skip-confirm").click();
    await expect(screen.getByTestId("meet-greet")).toContainText("You asked to skip the Meet & Greet.");

    // Chloe answers on the card: Accept, and the booking moves on without a Meet & Greet.
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("meet-skip-accept")).toHaveText("Accept");
    await screen.getByTestId("meet-skip-accept").click();
    await expect(screen.getByTestId("meet-greet")).toContainText("Meet & Greet skipped");
    expect(db.bookings[0].sitter_interest_at).toBeTruthy();
    await expect(screen.getByTestId("chat-next-accept")).toHaveText("Accept");
  });

  test("a Meet & Greet answer arrives as a new line at the bottom for both sides; the list follows it (#264)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, true);
    db.chat_messages.push({ id: "mg0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: { type: "meet_greet", booking_id: BOOKING, rev: 0 }, created_at: "2026-10-10T09:59:01.000Z" });
    db.chat_messages.push({ id: "t1", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "Free tomorrow evening?", card: null, created_at: "2026-10-10T10:00:00.000Z" });
    db.bookings[0].sitter_interest_at = new Date().toISOString(); // her yes already brought the card up

    // Robert suggests a video call: his own line says "You".
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    let screen = app(page);
    await screen.getByTestId("meet-request").click();
    await screen.getByTestId("meet-mode-video").click();
    await screen.getByTestId("meet-send").click();
    await expect(screen.getByTestId("chat-mg-update").last()).toContainText("You sent a Meet & Greet Request");
    await expect(screen.getByTestId("chat-mg-update").last()).toContainText("Online");

    // Chloe: the newest thing in the list and in the chat is the update.
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-mg-update").last()).toContainText("Robert sent a Meet & Greet Request");
    await screen.getByTestId("meet-accept").click();
    await expect(screen.getByTestId("chat-mg-update").last()).toContainText("You accepted the Meet & Greet");
    const last = db.chat_messages.at(-1);
    expect(last).toMatchObject({ sender_id: SITTER.id, card: { type: "meet_greet_update", event: "agreed" } });

    // Robert's list: the update is the preview and it is unread; in the chat it is the last line, the old card stays.
    await page.evaluate(() => localStorage.clear());
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    screen = app(page);
    await screen.getByRole("tab").getByText("Chat", { exact: true }).click();
    await expect(screen.getByTestId("chat-row-Chloe")).toContainText("Meet & Greet update");
    await expect(screen.getByTestId("chat-unread-Chloe")).toBeVisible();
    await screen.getByTestId("chat-row-Chloe").click();
    await expect(screen.getByTestId("chat-mg-update").last()).toContainText("Chloe accepted the Meet & Greet");
    await expect(screen.getByTestId("meet-greet")).toContainText("Meet & Greet set");
    expect(db.chat_messages.filter((m) => (m.card as { type?: string } | null)?.type === "meet_greet")).toHaveLength(1);
  });

  test("cards take sides like the bubbles: mine green on the right, theirs white on the left (#289)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedBooking(db, true);
    db.chat_messages.push({ id: "s0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: { type: "stay", drop_off_at: "2030-10-24T13:00:00Z", pick_up_at: "2030-10-27T21:00:00Z", pets: [{ id: MAX, name: "Max" }] }, created_at: "2026-10-10T09:58:00.000Z" });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/chat/${THREAD}`);
    const screen = app(page);
    const card = screen.getByTestId("chat-stay-card");
    await expect(card).toHaveCSS("background-color", "rgb(27, 67, 50)"); // my stay: the green of my side
    const frame = await box(page.locator("iframe"));
    const mine = await box(card);
    expect(mine.x + mine.width / 2).toBeGreaterThan(frame.x + frame.width / 2);

    await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-stay-card")).toHaveCSS("background-color", "rgb(255, 255, 255)"); // theirs: white
    const theirs = await box(screen.getByTestId("chat-stay-card"));
    expect(theirs.x + theirs.width / 2).toBeLessThan(frame.x + frame.width / 2);
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
