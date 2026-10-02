import { expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Sitter schedule (phase-03b 3B.1): open with own hours + spots, block, overlap → cancel → save.

/** `YYYY-MM-DD` for day `n` of next month in the app timezone (always in the future). */
function nextMonthDay(n: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m] = today.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, n));
  return next.toISOString().slice(0, 10);
}

const SITTER_DEFAULTS = {
  id: SITTER.id,
  bio: null,
  service_area: null,
  experience_years: null,
  home_notes: null,
  home_address: null,
  default_max_pets: 2,
  default_hours: { morning: ["09:00", "13:00"], afternoon: ["13:00", "17:00"], overnight: ["18:00", "08:00"] },
};

test.describe("sitter schedule", () => {
  test("a sitter opens a range with their own hours and spots", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ ...SITTER_DEFAULTS });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    const screen = app(page);

    await screen.getByTestId("open-schedule").click();
    await expect(page).toHaveURL(/\/sitter\/schedule$/);
    await expect(screen.getByTestId("calendar-prev")).toBeDisabled();
    await screen.getByTestId("calendar-next").click();

    const [from, mid, to] = [nextMonthDay(10), nextMonthDay(11), nextMonthDay(12)];
    await screen.getByTestId(`day-${from}`).click();
    await screen.getByTestId(`day-${to}`).click();
    await expect(screen.getByTestId("schedule-summary")).toContainText("3 days");

    await screen.getByTestId("schedule-edit").click();
    const sheet = screen.getByTestId("schedule-sheet");
    await expect(sheet).toBeVisible();
    // Nothing open yet → every slot starts checked with the profile's default hours.
    await expect(screen.getByTestId("schedule-morning-start-value")).toHaveText("9:00 AM");
    await expect(screen.getByTestId("schedule-morning-end-value")).toHaveText("1:00 PM");
    await expect(screen.getByTestId("schedule-pets-value")).toHaveText("2");

    await screen.getByTestId("schedule-overnight").click();
    await expect(screen.getByTestId("schedule-overnight")).toHaveAttribute("aria-checked", "false");
    await screen.getByTestId("schedule-morning-start-plus").click();
    await screen.getByTestId("schedule-pets-plus").click();
    await screen.getByTestId("schedule-save").click();

    await expect(screen.getByTestId("toast")).toContainText("Schedule saved");
    await expect(sheet).toBeHidden();
    expect(db.sitter_availability).toHaveLength(2);
    expect(db.sitter_availability).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sitter_id: SITTER.id,
          kind: "open",
          start_date: from,
          end_date: to,
          slot: "morning",
          starts_at: "09:30",
          ends_at: "13:00",
          max_pets: 3,
        }),
        expect.objectContaining({ kind: "open", slot: "afternoon", starts_at: "13:00", ends_at: "17:00", max_pets: 3 }),
      ]),
    );

    await expect(screen.getByTestId(`day-${mid}`)).toHaveAttribute("aria-label", /Morning open, Afternoon open, Overnight closed/);
    await screen.getByTestId(`day-${mid}`).click();
    await expect(screen.getByTestId("summary-morning")).toHaveText("Morning: Open · 9:30 AM–1:00 PM · 0/3 booked");
    await expect(screen.getByTestId("summary-overnight")).toHaveText("Overnight: Closed");
  });

  test("blocking a booked slot offers to cancel the booking, then saves", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.sitter_profiles.push({ ...SITTER_DEFAULTS });
    const [day, next] = [nextMonthDay(10), nextMonthDay(11)];
    db.sitter_availability.push({
      id: "00000000-0000-4000-8000-0000000000f1",
      sitter_id: SITTER.id,
      kind: "open",
      start_date: nextMonthDay(1),
      end_date: nextMonthDay(28),
      slot: "morning",
      starts_at: "08:00",
      ends_at: "12:00",
      max_pets: 2,
      note: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const bookingId = "00000000-0000-4000-8000-0000000000e1";
    db.bookings.push({
      id: bookingId,
      owner_id: OWNER.id,
      sitter_id: SITTER.id,
      status: "confirmed",
      start_date: day,
      end_date: next,
    });
    db.booking_slots.push({ booking_id: bookingId, day, slot: "morning" });

    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto("/sitter/schedule");
    const screen = app(page);
    await screen.getByTestId("calendar-next").click();

    await expect(screen.getByTestId(`day-${day}`)).toHaveAttribute("aria-label", /Morning open/);
    await screen.getByTestId(`day-${day}`).click();
    await expect(screen.getByTestId("summary-morning")).toHaveText("Morning: Open · 8:00 AM–12:00 PM · 1/2 booked");

    await screen.getByTestId("schedule-edit").click();
    await screen.getByTestId("schedule-mode-block").click();
    // Only the slot that is open on that day starts checked.
    await expect(screen.getByTestId("schedule-morning")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("schedule-afternoon")).toHaveAttribute("aria-checked", "false");
    await expect(screen.getByTestId("schedule-overnight")).toHaveAttribute("aria-checked", "false");
    await screen.getByTestId("schedule-save").click();

    const conflicts = screen.getByTestId("schedule-conflicts");
    await expect(conflicts).toContainText("This overlaps Chloe's booking (");
    await expect(conflicts).toContainText("Cancel that booking?");
    expect(db.sitter_availability).toHaveLength(1);
    await expect(screen.getByTestId("schedule-save")).toBeDisabled();

    await screen.getByTestId(`cancel-booking-${bookingId}`).click();
    await expect(screen.getByTestId("toast")).toContainText("Schedule saved");
    expect(db.cancellations).toEqual([{ p_booking: bookingId, p_reason: "Sitter schedule change" }]);
    expect(db.bookings[0].status).toBe("cancelled");
    const blocked = db.sitter_availability.filter((r) => r.kind === "blocked");
    expect(blocked).toEqual([expect.objectContaining({ start_date: day, end_date: day, slot: "morning" })]);
    await expect(screen.getByTestId(`day-${day}`)).toHaveAttribute("aria-label", /Morning blocked/);
  });

  test("opening a blocked day again keeps the rest of the block", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ ...SITTER_DEFAULTS });
    db.sitter_availability.push({
      id: "00000000-0000-4000-8000-0000000000f2",
      sitter_id: SITTER.id,
      kind: "blocked",
      start_date: nextMonthDay(10),
      end_date: nextMonthDay(14),
      slot: "afternoon",
      starts_at: null,
      ends_at: null,
      max_pets: null,
      note: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto("/sitter/schedule");
    const screen = app(page);
    await screen.getByTestId("calendar-next").click();

    await screen.getByTestId(`day-${nextMonthDay(12)}`).click();
    await screen.getByTestId("schedule-edit").click();
    await screen.getByTestId("schedule-morning").click();
    await screen.getByTestId("schedule-overnight").click();
    await screen.getByTestId("schedule-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Schedule saved");

    const blocks = db.sitter_availability
      .filter((r) => r.kind === "blocked")
      .map((r) => [r.start_date, r.end_date])
      .sort();
    expect(blocks).toEqual([
      [nextMonthDay(10), nextMonthDay(11)],
      [nextMonthDay(13), nextMonthDay(14)],
    ]);
    await expect(screen.getByTestId(`day-${nextMonthDay(12)}`)).toHaveAttribute("aria-label", /Afternoon open/);
    await expect(screen.getByTestId(`day-${nextMonthDay(13)}`)).toHaveAttribute("aria-label", /Afternoon blocked/);
  });

  test("hours that end before they start cannot be saved", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ ...SITTER_DEFAULTS });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);

    const screen = app(page);
    await screen.getByRole("button", { name: "Open your schedule" }).click();
    await expect(page).toHaveURL(/\/sitter\/schedule$/);
    await screen.getByTestId("calendar-next").click();
    await screen.getByTestId(`day-${nextMonthDay(5)}`).click();
    await screen.getByTestId("schedule-edit").click();

    // 9:00 AM – 1:00 PM → move the end back 8 × 30 min to 9:00 AM, then once more.
    for (let i = 0; i < 8; i++) await screen.getByTestId("schedule-morning-end-minus").click();
    await expect(screen.getByTestId("schedule-problem")).toHaveText("Morning needs different start and end times.");
    await screen.getByTestId("schedule-morning-end-minus").click();
    await expect(screen.getByTestId("schedule-problem")).toHaveText("Morning must end after it starts.");
    await expect(screen.getByTestId("schedule-save")).toBeDisabled();

    // Overnight may end the next morning.
    await screen.getByTestId("schedule-morning").click();
    await screen.getByTestId("schedule-afternoon").click();
    await expect(screen.getByTestId("schedule-problem")).toHaveCount(0);
    await screen.getByTestId("schedule-sheet-close").click();
    await expect(screen.getByTestId("schedule-sheet")).toBeHidden();
    expect(db.sitter_availability).toHaveLength(0);
  });
});
