import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Owner inquiry (phase-07B 7B.5): Ask about a stay → the thread → the sitter's sent reply with the quote → Request booking.
// The AI endpoint is mocked (covered by pytest); a sitter reply is added to the mock DB the way the 010 RPC will.

const MAX = "00000000-0000-4000-8000-0000000000c1";
const MOCHI = "00000000-0000-4000-8000-0000000000c2";
const QUOTE = {
  service: "boarding", nights: 3, days: 0, unit_price: 55, base: 165, extra_pets: 82.5,
  holiday_days: [{ day: "2026-10-12", name: "Thanksgiving" }], holiday_surcharge: 20.63,
  total: 268.13, currency: "CAD", rate_version: "e2e",
};

function seed(db: MockDb) {
  db.pets.push(
    { id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-01-01T00:00:00Z" },
    { id: MOCHI, owner_id: OWNER.id, species: "cat", name: "Mochi", breed: null, birthdate: null, weight_kg: null, notes: null, created_at: "2026-01-02T00:00:00Z" },
  );
  db.sitter_profiles.push({
    id: SITTER.id, bio: "Cozy home", service_area: "North York", experience_years: 3, home_notes: null, home_address: "12 Maple St",
    services: ["boarding", "house_sitting"],
  });
  db.search_results.push({
    sitter_id: SITTER.id, display_name: SITTER.displayName, bio: null, service_area: null, experience_years: null,
    services: ["boarding", "house_sitting"], is_my_sitter: false, covered_slots: 11, total_slots: 11,
    drop_off_within_hours: true, pick_up_within_hours: true,
  });
}

async function openProfile(page: import("@playwright/test").Page) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  seed(db);
  const replyRequests: Record<string, unknown>[] = [];
  await page.route("**/api/ai/inquiry-reply", (route) => {
    replyRequests.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await signIn(page, OWNER);
  await expect(page).toHaveURL(/\/owner$/);
  await page.goto(`/owner/sitters/${SITTER.id}`);
  await app(page).getByTestId("ask-about-stay").click();
  return { db, replyRequests };
}

test.describe("owner inquiry", () => {
  test("ask → thread waits for the sitter → the sent reply shows with the quote → Request booking is prefilled", async ({ page }) => {
    const { db, replyRequests } = await openProfile(page);
    const screen = app(page);

    await expect(screen.getByTestId("inquiry-send")).toBeDisabled(); // nobody picked yet
    await screen.getByTestId("inquiry-pet-Max").click();
    await screen.getByTestId("inquiry-pet-Mochi").click();
    await screen.getByTestId("inquiry-question").fill("Can you give Max his pill at 2 PM?");
    await screen.getByTestId("inquiry-send").click();

    await expect(page).toHaveURL(/\/owner\/inquiries\/.+/);
    expect(db.inquiries).toHaveLength(1);
    expect(db.inquiries[0]).toMatchObject({ owner_id: OWNER.id, sitter_id: SITTER.id, service_type: "boarding", pet_ids: [MAX, MOCHI], status: "open" });
    expect(db.inquiry_messages[0]).toMatchObject({ author: "owner", sender_id: OWNER.id, body: "Can you give Max his pill at 2 PM?" });
    await expect.poll(() => replyRequests.length).toBe(1);
    expect(replyRequests[0]).toMatchObject({ inquiry_id: db.inquiries[0].id });

    await expect(screen.getByTestId("inquiry-question-bubble")).toContainText("pill at 2 PM");
    await expect(screen.getByTestId("inquiry-waiting")).toContainText("Chloe will reply soon");

    // A draft is invisible to the owner; the sent reply appears (poll).
    const inquiryId = db.inquiries[0].id as string;
    db.inquiry_messages.push({
      id: "draft1", inquiry_id: inquiryId, author: "ai", sender_id: null, body: "SECRET DRAFT", status: "draft", drafted_by_ai: true,
      visible_at: new Date().toISOString(), created_at: new Date().toISOString(), grounding: { quote: QUOTE },
    });
    await page.waitForTimeout(3500);
    await expect(screen.getByText("SECRET DRAFT")).toHaveCount(0);
    await expect(screen.getByTestId("inquiry-waiting")).toBeVisible();

    db.inquiry_messages.push({
      id: "reply1", inquiry_id: inquiryId, author: "sitter", sender_id: SITTER.id, status: "sent", drafted_by_ai: true,
      body: "Hi Robert! I'm available. The total is $268.13 CAD. 🐾",
      visible_at: new Date().toISOString(), created_at: new Date().toISOString(),
      grounding: { quote: QUOTE, sources: [{ id: "policy-0", type: "sitter_policy", label: "From Chloe's policies", text: "x" }], availability: { can_host: true } },
    });
    await expect(screen.getByTestId("inquiry-reply-bubble")).toContainText("268.13", { timeout: 8000 });
    await expect(screen.getByTestId("inquiry-waiting")).toHaveCount(0);
    await expect(screen.getByTestId("inquiry-quote")).toContainText("268.13");
    await expect(screen.getByTestId("inquiry-sources")).toContainText("From Chloe's policies");

    await screen.getByTestId("inquiry-request-booking").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/new\\?inquiry=${inquiryId}`));
    await expect(screen.getByTestId("pick-pet-Max")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("pick-pet-Mochi")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("pick-sitter-Chloe")).toHaveAttribute("aria-checked", "true");
    await screen.getByTestId("request-booking").click();
    await expect(screen.getByTestId("toast")).toContainText("Request sent to Chloe");
    expect(db.requests[0]).toMatchObject({ p_sitter: SITTER.id, p_pets: [MAX, MOCHI] });
    await expect.poll(() => db.inquiries[0].status).toBe("booked");
    expect(db.inquiries[0].booking_id).toBe(db.bookings.at(-1)?.id);
  });

  test("with no question a one-line summary of the trip is sent", async ({ page }) => {
    const { db } = await openProfile(page);
    const screen = app(page);
    await screen.getByTestId("inquiry-pet-Max").click();
    await screen.getByTestId("inquiry-send").click();
    await expect(page).toHaveURL(/\/owner\/inquiries\/.+/);
    expect(String(db.inquiry_messages[0].body)).toMatch(/^Boarding · .+ – .+ · Max$/);
  });

  test("a reply for dates the sitter can't take points to other sitters, with no Request booking", async ({ page }) => {
    const { db } = await openProfile(page);
    const screen = app(page);
    await screen.getByTestId("inquiry-pet-Max").click();
    await screen.getByTestId("inquiry-send").click();
    await expect(page).toHaveURL(/\/owner\/inquiries\/.+/);
    const inquiryId = db.inquiries[0].id as string;
    db.inquiry_messages.push({
      id: "reply2", inquiry_id: inquiryId, author: "sitter", sender_id: SITTER.id, status: "sent", drafted_by_ai: true,
      body: "Hi Robert! I can't take Max on Oct 10 — want me to look at other dates?",
      visible_at: new Date().toISOString(), created_at: new Date().toISOString(),
      grounding: { quote: null, sources: [], availability: { can_host: false, unavailable_days: [] } },
    });
    await expect(screen.getByTestId("inquiry-find-others")).toBeVisible({ timeout: 8000 });
    await expect(screen.getByTestId("inquiry-request-booking")).toHaveCount(0);
    await expect(screen.getByTestId("inquiry-quote")).toHaveCount(0);
    await screen.getByTestId("inquiry-find-others").click();
    await expect(page).toHaveURL(/inquiry=.+&other=1/);
    await expect(screen.getByTestId("pick-pet-Max")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("pick-sitter-Chloe")).not.toHaveAttribute("aria-checked", "true");
  });

  test("nobody else can open the conversation", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto("/owner/inquiries/00000000-0000-4000-8000-0000000000ff");
    await expect(app(page).getByText("Conversation not found")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
// Sitter side (7B.6)
// ---------------------------------------------------------------------------------------------

const INQ = "00000000-0000-4000-8000-0000000000d1";

function seedThread(db: MockDb, extra: Record<string, unknown> = {}) {
  seed(db);
  db.inquiries.push({
    id: INQ, owner_id: OWNER.id, sitter_id: SITTER.id, service_type: "boarding",
    drop_off_at: "2030-10-09T11:30:00.000Z", pick_up_at: "2030-10-12T21:00:00.000Z",
    drop_off_location_type: "sitter_home", pick_up_location_type: "sitter_home",
    pet_ids: [MAX], status: "open", booking_id: null, created_at: "2026-10-06T10:00:00Z",
  });
  db.inquiry_messages.push(
    { id: "q1", inquiry_id: INQ, author: "owner", sender_id: OWNER.id, body: "Can you give Max his pill at 2 PM?", status: "sent", drafted_by_ai: false, visible_at: "2026-10-06T10:00:00Z", read_at: null, created_at: "2026-10-06T10:00:00Z", grounding: null },
    {
      id: "draft1", inquiry_id: INQ, author: "ai", sender_id: null, body: "Hi Robert! I'm available. The total is $268.13 CAD. 🐾", status: "draft", drafted_by_ai: true,
      visible_at: "2026-10-06T10:00:05Z", read_at: null, created_at: "2026-10-06T10:00:05Z",
      grounding: { quote: QUOTE, sources: [{ id: "policy-0", type: "sitter_policy", label: "From Chloe's policies", text: "x" }], availability: { can_host: true }, needs_sitter: false, intent: null, policy_conflicts: [] },
      ...extra,
    },
  );
}

async function openSitterThread(page: import("@playwright/test").Page, extra: Record<string, unknown> = {}) {
  const { db } = await mockSupabase(page, [OWNER, SITTER]);
  seedThread(db, extra);
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/ai/inquiry-reply", (route) => {
    const body = route.request().postDataJSON();
    asked.push(body);
    db.inquiry_messages.push({
      id: `draft-${asked.length + 1}`, inquiry_id: INQ, author: "ai", sender_id: null, status: "draft", drafted_by_ai: true,
      body: body.intent === "decline" ? "Hi Robert! I'm sorry, I can't this time." : "Hi Robert! A fresh take: $268.13 CAD.",
      visible_at: new Date().toISOString(), read_at: null, created_at: new Date(Date.now() + 1000 * asked.length).toISOString(),
      grounding: { quote: QUOTE, sources: [], availability: { can_host: true }, needs_sitter: false, intent: body.intent ?? null },
    });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await signIn(page, SITTER);
  await app(page).getByRole("heading", { name: "Home" }).waitFor();
  await page.goto("/sitter/bookings");
  await app(page).getByTestId("sitter-bookings-tabs-inquiries").click();
  return { db, asked };
}

test.describe("sitter inquiry", () => {
  test("Questions lists the thread with a draft ready; one tap on Send keeps the quote and tells the owner", async ({ page }) => {
    const learned: Record<string, unknown>[] = [];
    await page.route("**/api/tone/record-reply", (route) => {
      learned.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ recorded: 1 }) });
    });
    const { db } = await openSitterThread(page);
    const screen = app(page);
    await expect(screen.getByTestId("sitter-bookings-tabs-inquiries")).toContainText("Questions (1)");
    await expect(screen.getByTestId(`inquiry-card-${INQ}`)).toContainText("Draft ready");
    await screen.getByTestId(`inquiry-card-${INQ}`).click();

    await expect(screen.getByTestId("inquiry-warning")).toHaveText("AI drafts can be wrong. You're responsible for what you send.");
    await expect(screen.getByTestId("inquiry-draft-body")).toContainText("$268.13");
    await expect(screen.getByTestId("inquiry-draft-quote")).toContainText("268.13");
    await expect(screen.getByTestId("inquiry-draft-sources")).toContainText("From Chloe's policies");
    await expect(screen.getByTestId("inquiry-needs-you")).toHaveCount(0);
    // Opening the thread is the read mark.
    await expect.poll(() => db.inquiry_messages.find((m) => m.id === "q1")?.read_at).toBeTruthy();

    await screen.getByTestId("inquiry-send").click(); // no typing at all
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅ Robert was told");
    const sent = db.inquiry_messages.find((m) => m.author === "sitter");
    expect(sent).toMatchObject({ drafted_by_ai: true, sender_id: SITTER.id, body: "Hi Robert! I'm available. The total is $268.13 CAD. 🐾" });
    expect((sent?.grounding as { quote: { total: number } }).quote.total).toBe(268.13);
    expect(sent?.grounding).not.toHaveProperty("needs_sitter");
    expect(db.notifications.find((n) => n.type === "inquiry_replied")?.user_id).toBe(OWNER.id);
    await expect(screen.getByTestId("inquiry-replied")).toContainText("Robert was told");
    await expect(screen.getByTestId("inquiry-draft")).toHaveCount(0);
    await expect.poll(() => learned.length).toBe(1); // the assistant is asked to learn from this send
    expect(learned[0]).toEqual({ inquiry_id: INQ });
  });

  test("Edit / Add sends the sitter's own text, and a needs-you draft says so", async ({ page }) => {
    const { db } = await openSitterThread(page);
    db.inquiry_messages.find((m) => m.id === "draft1")!.grounding = {
      quote: QUOTE, sources: [], availability: { can_host: true }, needs_sitter: true, intent: null,
    };
    const screen = app(page);
    await screen.getByTestId(`inquiry-card-${INQ}`).click();
    await expect(screen.getByTestId("inquiry-needs-you")).toBeVisible();
    await screen.getByTestId("inquiry-edit-toggle").click();
    await screen.getByTestId("inquiry-edit").fill("Hi Robert! Yes — pill at 2 PM works. $268.13 CAD total.");
    await screen.getByTestId("inquiry-send").click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
    expect(db.inquiry_messages.find((m) => m.author === "sitter")?.body).toBe("Hi Robert! Yes — pill at 2 PM works. $268.13 CAD total.");
  });

  test("Regenerate and the intent chips ask for another draft (the newest one is shown)", async ({ page }) => {
    const { asked } = await openSitterThread(page);
    const screen = app(page);
    await screen.getByTestId(`inquiry-card-${INQ}`).click();
    await screen.getByTestId("inquiry-regenerate").click();
    await expect(screen.getByTestId("inquiry-draft-body")).toContainText("A fresh take");
    expect(asked[0]).toEqual({ inquiry_id: INQ, regenerate: true });
    await screen.getByTestId("inquiry-intent-decline").click();
    await expect(screen.getByTestId("inquiry-draft-body")).toContainText("I can't this time");
    expect(asked[1]).toEqual({ inquiry_id: INQ, regenerate: true, intent: "decline" });
  });

  test("with no draft yet the sitter sees it is being written and can write it themselves", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    db.inquiry_messages.splice(db.inquiry_messages.findIndex((m) => m.id === "draft1"), 1);
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto(`/sitter/inquiries/${INQ}`);
    const screen = app(page);
    await expect(screen.getByTestId("inquiry-no-draft")).toContainText("Your draft is being written");
    await screen.getByTestId("inquiry-write-myself").click();
    await screen.getByTestId("inquiry-edit").fill("Hi Robert! I'll check and reply properly soon.");
    await screen.getByTestId("inquiry-send").click();
    await expect(screen.getByTestId("toast")).toContainText("Sent ✅");
    expect(db.inquiry_messages.find((m) => m.author === "sitter")).toMatchObject({ drafted_by_ai: false, grounding: null });
  });

  test("the sitter's policies are saved and handed to the assistant", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, service_area: null, experience_years: null, home_notes: null, home_address: null, services: ["boarding"], policies: null });
    const reindex: number[] = [];
    await page.route("**/api/rag/reindex-sitter", (route) => {
      reindex.push(1);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chunks: 1 }) });
    });
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto("/profile");
    const screen = app(page);
    await screen.getByLabel("House rules & policies (optional)").fill("No dogs over 20 kg.");
    await screen.getByRole("button", { name: "Save" }).click();
    await expect(screen.getByTestId("toast")).toContainText("Profile saved");
    expect(db.sitter_profiles[0].policies).toBe("No dogs over 20 kg.");
    await expect.poll(() => reindex.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Auto-send at a human pace (7B.10)
// ---------------------------------------------------------------------------------------------

test.describe("auto-send", () => {
  test("the owner sees nothing, then \"typing…\", then the reply — and Read only once the sitter opened the thread", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    // The AI draft is the sitter's; the auto reply is stored now but only appears at visible_at.
    const now = Date.now();
    const visible = new Date(now + 7000).toISOString();
    db.inquiries[0].reply_typing_at = new Date(now + 2000).toISOString();
    db.inquiries[0].reply_visible_at = visible;
    db.inquiry_messages.push({
      id: "auto1", inquiry_id: INQ, author: "sitter", sender_id: SITTER.id, status: "sent", drafted_by_ai: true, confirmed_by_sitter_at: null,
      body: "Hi Robert! I'm available. The total is $268.13 CAD. 🐾", visible_at: visible, read_at: null,
      created_at: new Date(now).toISOString(), grounding: { quote: QUOTE, sources: [], availability: { can_host: true } },
    });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/inquiries/${INQ}`);
    const screen = app(page);

    await expect(screen.getByTestId("inquiry-waiting")).toContainText("will reply soon");
    await expect(screen.getByTestId("inquiry-typing")).toHaveText("Chloe is typing…", { timeout: 6000 });
    await expect(screen.getByTestId("inquiry-reply-bubble")).toContainText("268.13", { timeout: 9000 });
    await expect(screen.getByTestId("inquiry-typing")).toHaveCount(0);
    // Nobody has opened the thread: no "Read", whatever the screen was doing.
    await expect(screen.getByTestId("inquiry-question-bubble")).not.toContainText("Read");

    db.inquiry_messages.find((m) => m.id === "q1")!.read_at = new Date().toISOString(); // the sitter opened it
    await page.reload();
    await expect(screen.getByTestId("inquiry-question-bubble")).toContainText("· Read");
  });

  test("the sitter sees the auto reply marked as sent automatically, with no draft to approve", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seedThread(db);
    db.inquiry_messages.push({
      id: "auto1", inquiry_id: INQ, author: "sitter", sender_id: SITTER.id, status: "sent", drafted_by_ai: true, confirmed_by_sitter_at: null,
      body: "Hi Robert! I'm available.", visible_at: new Date(Date.now() + 20000).toISOString(), read_at: null,
      created_at: "2026-10-06T10:00:06Z", grounding: null,
    });
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto(`/sitter/inquiries/${INQ}`);
    const screen = app(page);
    await expect(screen.getByTestId("inquiry-message-sitter")).toContainText("Sent automatically");
    await expect(screen.getByTestId("inquiry-draft")).toHaveCount(0);
    await expect(screen.getByTestId("inquiry-replied")).toBeVisible();
  });

  test("the sitter turns auto-send on only after the responsibility modal, and off again freely", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, service_area: null, experience_years: null, home_notes: null, home_address: null, services: ["boarding"], policies: null });
    await signIn(page, SITTER);
    await app(page).getByRole("heading", { name: "Home" }).waitFor();
    await page.goto("/profile");
    const screen = app(page);
    await expect(screen.getByTestId("profile-ai-replies")).toContainText("You read each drafted reply");
    await screen.getByTestId("profile-ai-mode-auto").click();
    await expect(screen.getByTestId("ai-consent-sheet")).toContainText("Replies go out in your name. You're responsible for what's sent.");
    expect(db.sitter_profiles[0].ai_reply_mode).toBeUndefined(); // nothing changed yet
    await screen.getByTestId("ai-consent-confirm").click();
    await expect(screen.getByTestId("profile-ai-replies")).toContainText("go out in your name");
    expect(db.sitter_profiles[0]).toMatchObject({ ai_reply_mode: "auto" });
    expect(db.sitter_profiles[0].ai_consent_at).toBeTruthy();

    await screen.getByTestId("profile-ai-mode-manual").click();
    await expect(screen.getByTestId("profile-ai-replies")).toContainText("You read each drafted reply");
    await screen.getByTestId("profile-ai-mode-auto").click(); // consented once: no second modal
    await expect(screen.getByTestId("ai-consent-sheet")).toHaveCount(0);
    await expect(screen.getByTestId("profile-ai-replies")).toContainText("go out in your name");
  });
});
