import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// The handoff in the chat (03D 3D.8, #145 · #169): defaults, one suggestion for the drop-off and the pick-up (a pair,
// one notice, answered together). The pair rules themselves are tested in rls_smoke.sql (014r); the mock keeps them.

const MAX = "00000000-0000-4000-8000-0000000000c1";
const THREAD = "00000000-0000-4000-8000-0000000000f1";
const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const DROP = "2030-10-24T13:00:00.000Z";
const PICK = "2030-10-27T21:00:00.000Z";

const handoff = (kind: "drop_off" | "pick_up", at: string, place: string, by: string, status: string, extra: Record<string, unknown> = {}) => ({
  id: `h-${kind}-${status}-${by === OWNER.id ? "o" : "s"}`,
  booking_id: BOOKING,
  kind,
  scheduled_at: at,
  location_type: place,
  location_note: null,
  within_sitter_hours: true,
  status,
  proposed_by: by,
  completed_at: null,
  created_at: "2026-10-02T18:00:00Z",
  ...extra,
});

/** A request in the chat: a repeat pair, so it is waiting for both yes. The owner asked for `place`. */
function seed(db: MockDb, place: string, status: "requested" | "confirmed" = "requested") {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  db.owner_profiles.push({ id: OWNER.id, home_address: null, home_lat: null, home_lng: null });
  db.sitter_profiles.push({ id: SITTER.id, service_area: "Toronto M4W", services: ["boarding"] });
  db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status,
    service_type: "boarding",
    meet_greet_status: "not_needed",
    created_at: "2026-10-02T18:00:00Z",
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
  const st = status === "confirmed" ? "agreed" : "proposed";
  db.booking_handoffs.push(handoff("drop_off", DROP, place, OWNER.id, st), handoff("pick_up", PICK, place, OWNER.id, st));
  db.chat_messages.push({ id: "m1", thread_id: THREAD, sender_id: OWNER.id, kind: "text", body: "Hi Chloe", card: null, created_at: "2026-10-10T10:00:00.000Z" });
}

const answer = (choice: string) => ({ sitter_id: SITTER.id, question_key: "handoff", question_text: null, answer: null, choice, source: "typed", quote: null, position: 0 });

async function openChatAs(page: Page, user: MockUser) {
  await page.evaluate(() => localStorage.clear()).catch(() => undefined);
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  await page.goto(`/chat/${THREAD}`);
  return app(page);
}

test.describe("handoff in the chat", () => {
  test("a request that differs from the sitter's default asks her; her one suggestion for both is a pair the owner answers with one Accept", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "owner_home");
    db.sitter_profile_answers.push(answer("owner_brings"));
    let screen = await openChatAs(page, SITTER);

    await expect(screen.getByTestId("chat-handoff-card")).toContainText("Handoff differs from your default");
    await expect(screen.getByTestId("chat-handoff-line").first()).toContainText("Robert's place");
    await expect(screen.getByTestId("chat-handoff-accept")).toHaveCount(0); // the footer's Accept booking is hers

    // She suggests her place and a day later for both; it goes as ONE pair.
    await screen.getByTestId("chat-handoff-suggest").click();
    await expect(screen.getByTestId("change-sheet")).toBeVisible();
    await screen.getByTestId("change-place-sitter_home").click();
    await screen.getByTestId("change-day-plus").click();
    await screen.getByTestId("change-kind-pick_up").click();
    await screen.getByTestId("change-place-sitter_home").click();
    await screen.getByTestId("change-day-plus").click();
    await screen.getByTestId("change-send").click();
    await expect(screen.getByTestId("change-sheet")).toBeHidden();

    expect(db.proposals).toHaveLength(1);
    expect(db.proposals[0]).toMatchObject({ pair: true, p_drop_type: "sitter_home", p_pick_type: "sitter_home" });
    const open = db.booking_handoffs.filter((h) => h.status === "proposed");
    expect(open).toHaveLength(2);
    expect(open[0].pair_id).toBeTruthy();
    expect(open[0].pair_id).toBe(open[1].pair_id);
    await expect(screen.getByTestId("chat-handoff-card")).toContainText("Waiting for Robert");

    // Robert reads one card for both and answers both with one tap.
    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-handoff-card")).toContainText("Chloe suggested a new drop-off and pick-up");
    await expect(screen.getByTestId("chat-handoff-line")).toHaveCount(2);
    await screen.getByTestId("chat-handoff-accept").click();
    await expect(screen.getByTestId("chat-handoff-card")).toHaveCount(0);
    expect(db.responses).toHaveLength(1);
    expect(db.booking_handoffs.filter((h) => h.status === "agreed")).toHaveLength(2);
  });

  test("matching defaults, a sitter who goes either way, and no answer at all show no card", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home");
    db.sitter_profile_answers.push(answer("owner_brings"));
    let screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-bubble-them")).toBeVisible();
    await expect(screen.getByTestId("chat-handoff-card")).toHaveCount(0);

    for (const h of db.booking_handoffs) h.location_type = "owner_home";
    db.sitter_profile_answers[0].choice = "sitter_picks_up,owner_brings";
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-bubble-them")).toBeVisible();
    await expect(screen.getByTestId("chat-handoff-card")).toHaveCount(0);

    db.sitter_profile_answers.length = 0;
    screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-bubble-them")).toBeVisible();
    await expect(screen.getByTestId("chat-handoff-card")).toHaveCount(0);
  });

  test("after confirm the owner answers the sitter's pair with one Accept, and the sitter sees it as waiting", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, "sitter_home", "confirmed");
    const pair = "pair-1";
    db.booking_handoffs.push(
      handoff("drop_off", "2030-10-25T13:00:00.000Z", "sitter_home", SITTER.id, "proposed", { pair_id: pair }),
      handoff("pick_up", "2030-10-28T21:00:00.000Z", "sitter_home", SITTER.id, "proposed", { pair_id: pair }),
    );
    let screen = await openChatAs(page, SITTER);
    await expect(screen.getByTestId("chat-handoff-card")).toContainText("Waiting for Robert");
    await expect(screen.getByTestId("chat-handoff-accept")).toHaveCount(0);

    screen = await openChatAs(page, OWNER);
    await expect(screen.getByTestId("chat-handoff-card")).toContainText("Chloe suggested a new drop-off and pick-up");
    await screen.getByTestId("chat-handoff-accept").click();
    await expect(screen.getByTestId("chat-handoff-card")).toHaveCount(0);
    expect(db.responses).toHaveLength(1);
    expect(db.booking_handoffs.filter((h) => h.status === "agreed" && h.scheduled_at.startsWith("2030-10-2") && h.proposed_by === SITTER.id)).toHaveLength(2);
    expect(db.booking_handoffs.filter((h) => h.status === "superseded")).toHaveLength(2);
  });

  // The request opens on the owner's usual place, else the sitter's one preference, and remembers the last request.
  const STAY = { type: "stay", drop_off_at: DROP, pick_up_at: PICK, pets: [{ id: MAX, name: "Max" }] };
  function seedChat(db: MockDb) {
    db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
    db.owner_profiles.push({ id: OWNER.id, home_address: "9 Oak Ave", home_lat: null, home_lng: null });
    db.sitter_profiles.push({ id: SITTER.id, service_area: "Toronto M4W", services: ["boarding"] });
    db.chat_threads.push({ id: THREAD, owner_id: OWNER.id, sitter_id: SITTER.id, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null });
    db.chat_messages.push({ id: "c0", thread_id: THREAD, sender_id: OWNER.id, kind: "card", body: null, card: STAY, created_at: "2026-10-10T09:59:00.000Z" });
  }

  test("the booking made from the chat's stay opens on the sitter's one preference, and the owner's own default wins over it", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedChat(db);
    db.sitter_profile_answers.push(answer("sitter_picks_up"));
    const screen = await openChatAs(page, OWNER);

    // Request makes the booking from the stay: both places are the sitter's one way (she comes to the owner).
    await screen.getByTestId("chat-next-meet_start").click();
    await expect.poll(() => db.requests.length).toBe(1);
    expect(db.requests[0]).toMatchObject({ p_drop_off_location_type: "owner_home", p_pick_up_location_type: "owner_home" });

    // The next request (after the first ended) opens on my default, not on her preference.
    db.owner_profiles[0].default_handoff = "sitter_home";
    db.bookings[0].status = "declined";
    await page.reload();
    await expect(screen.getByTestId("chat-next-meet_start")).toBeVisible();
    await screen.getByTestId("chat-next-meet_start").click();
    await expect.poll(() => db.requests.length).toBe(2);
    expect(db.requests[1]).toMatchObject({ p_drop_off_location_type: "sitter_home", p_pick_up_location_type: "sitter_home" });
  });
});
