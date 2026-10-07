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
    await expect(screen.getByTestId("inquiry-waiting")).toContainText("Lucy will reply soon");

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
      body: "Hi Chloe! I'm available. The total is $268.13 CAD. 🐾",
      visible_at: new Date().toISOString(), created_at: new Date().toISOString(),
      grounding: { quote: QUOTE, sources: [{ id: "policy-0", type: "sitter_policy", label: "From Lucy's policies", text: "x" }], availability: { can_host: true } },
    });
    await expect(screen.getByTestId("inquiry-reply-bubble")).toContainText("268.13", { timeout: 8000 });
    await expect(screen.getByTestId("inquiry-waiting")).toHaveCount(0);
    await expect(screen.getByTestId("inquiry-quote")).toContainText("268.13");
    await expect(screen.getByTestId("inquiry-sources")).toContainText("From Lucy's policies");

    await screen.getByTestId("inquiry-request-booking").click();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/new\\?inquiry=${inquiryId}`));
    await expect(screen.getByTestId("pick-pet-Max")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("pick-pet-Mochi")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("pick-sitter-Lucy")).toHaveAttribute("aria-checked", "true");
    await screen.getByTestId("request-booking").click();
    await expect(screen.getByTestId("toast")).toContainText("Request sent to Lucy");
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
      body: "Hi Chloe! I can't take Max on Oct 10 — want me to look at other dates?",
      visible_at: new Date().toISOString(), created_at: new Date().toISOString(),
      grounding: { quote: null, sources: [], availability: { can_host: false, unavailable_days: [] } },
    });
    await expect(screen.getByTestId("inquiry-find-others")).toBeVisible({ timeout: 8000 });
    await expect(screen.getByTestId("inquiry-request-booking")).toHaveCount(0);
    await expect(screen.getByTestId("inquiry-quote")).toHaveCount(0);
    await screen.getByTestId("inquiry-find-others").click();
    await expect(page).toHaveURL(/inquiry=.+&other=1/);
    await expect(screen.getByTestId("pick-pet-Max")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("pick-sitter-Lucy")).not.toHaveAttribute("aria-checked", "true");
  });

  test("nobody else can open the conversation", async ({ page }) => {
    await mockSupabase(page, [OWNER, SITTER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto("/owner/inquiries/00000000-0000-4000-8000-0000000000ff");
    await expect(app(page).getByText("Conversation not found")).toBeVisible();
  });
});
