import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// An owner opens a sitter's profile and month schedule (phase-03b 3B.2).

const PAUL: MockUser = {
  id: "00000000-0000-4000-8000-000000000003",
  email: "paul@goldito.test",
  password: "nap-time",
  role: "sitter",
  displayName: "Paul",
};

/** `YYYY-MM-DD` for day `n` of next month in the app timezone (always in the future). */
function nextMonthDay(n: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m, n)).toISOString().slice(0, 10);
}

const MINA_BOOKING = "00000000-0000-4000-8000-0000000000e1";
const OTHER_BOOKING = "00000000-0000-4000-8000-0000000000e2";

test.describe("your sitters", () => {
  test("an owner opens a sitter they booked and reads their month", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER, PAUL]);
    db.sitter_profiles.push({
      id: SITTER.id,
      bio: "Retired vet tech who loves small dogs and shy cats.",
      service_area: "North York",
      experience_years: 3,
      home_notes: "Fenced yard, no other pets.",
      home_address: "12 Maple St",
      services: ["boarding", "house_sitting"],
    });
    db.bookings.push(
      {
        id: MINA_BOOKING,
        owner_id: OWNER.id,
        sitter_id: SITTER.id,
        status: "confirmed",
        responded_at: "2026-09-01T00:00:00Z",
        created_at: "2026-08-30T00:00:00Z",
      },
      // Paul declined → not one of "your sitters".
      {
        id: "00000000-0000-4000-8000-0000000000e3",
        owner_id: OWNER.id,
        sitter_id: PAUL.id,
        status: "declined",
        responded_at: null,
        created_at: "2026-08-31T00:00:00Z",
      },
      // Another owner's booking fills Chloe's morning on day 11.
      {
        id: OTHER_BOOKING,
        owner_id: "00000000-0000-4000-8000-0000000000aa",
        sitter_id: SITTER.id,
        status: "confirmed",
        created_at: "2026-09-02T00:00:00Z",
      },
    );
    db.sitter_availability.push(
      {
        id: "00000000-0000-4000-8000-0000000000f1",
        sitter_id: SITTER.id,
        kind: "open",
        start_date: nextMonthDay(1),
        end_date: nextMonthDay(28),
        slot: "morning",
        starts_at: "08:00",
        ends_at: "12:00",
        max_pets: 2,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-0000000000f2",
        sitter_id: SITTER.id,
        kind: "blocked",
        start_date: nextMonthDay(10),
        end_date: nextMonthDay(10),
        slot: "afternoon",
        created_at: "2026-01-02T00:00:00.000Z",
      },
    );
    db.booking_slots.push(
      { booking_id: MINA_BOOKING, day: nextMonthDay(10), slot: "morning" },
      { booking_id: OTHER_BOOKING, day: nextMonthDay(11), slot: "morning" },
      { booking_id: OTHER_BOOKING, day: nextMonthDay(11), slot: "morning" },
    );

    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    const screen = app(page);
    // The Bookings tab lists sitters as tiles now (sitter-search.spec); the profile opens from there or by link.
    await page.goto(`/owner/sitters/${SITTER.id}`);
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}$`));
    await expect(screen.getByTestId("sitter-name")).toHaveText("Chloe");
    await expect(screen.getByText("Fenced yard, no other pets.")).toBeVisible();
    await expect(screen.getByTestId("sitter-service-house_sitting")).toBeVisible();
    await expect(screen.getByText("12 Maple St")).toHaveCount(0);

    // #120: See schedule opens the month, and each day opens as its own page; the profile has no openings list.
    await expect(screen.getByTestId(/^sitter-opening-/)).toHaveCount(0);
    await expect(screen.getByText("Next openings")).toHaveCount(0);
    await expect(screen.getByTestId("ask-about-stay")).toHaveCount(0);
    await expect(screen.getByTestId("book-this-sitter")).toHaveCount(0);
    await expect(screen.getByTestId("start-chat")).toHaveText("Start chat");
    await screen.getByTestId("sitter-see-schedule").click();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}/calendar$`));
    await screen.getByTestId("calendar-next").click();
    // A blocked slot reads as not available to owners; a slot nobody touched is open by default (014d).
    await expect(screen.getByTestId(`day-${nextMonthDay(10)}`)).toHaveAttribute(
      "aria-label",
      /Morning open, Afternoon closed, Night open/,
    );
    await screen.getByTestId(`day-${nextMonthDay(10)}`).click();
    await expect(page).toHaveURL(new RegExp(`/day/${nextMonthDay(10)}$`));
    await expect(screen.getByTestId("sitter-day-morning")).toContainText("Morning");
    await expect(screen.getByTestId("sitter-day-morning")).toContainText("8 AM to 12 PM");
    await expect(screen.getByTestId("sitter-day-morning")).toContainText("1 spot left");
    await expect(screen.getByTestId("sitter-day-afternoon")).toContainText("Not available");
    await expect(screen.getByTestId("sitter-day-overnight")).toContainText("6 PM to 8 AM");
    await expect(screen.getByTestId("sitter-day-overnight")).toContainText("2 spots left");

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}/calendar$`));
    // Back keeps the month that was open.
    await screen.getByTestId(`day-${nextMonthDay(11)}`).click();
    await expect(screen.getByTestId("sitter-day-morning")).toContainText("Full");
    await expect(screen.getByTestId("sitter-day")).not.toContainText("Robert");
  });

  test("an unknown sitter link shows a friendly empty state", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/sitters/${OWNER.id}`);
    await expect(app(page).getByText("Sitter not found")).toBeVisible();
  });
});
