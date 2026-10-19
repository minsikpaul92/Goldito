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

    await screen.getByTestId("open-menu").click();
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
    expect(db.sitter_availability).toHaveLength(3); // morning + afternoon open, overnight blocked
    expect(db.sitter_availability.filter((r) => r.kind === "blocked")).toEqual([
      expect.objectContaining({ slot: "overnight", start_date: from, end_date: to }),
    ]);
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

    await expect(screen.getByTestId(`day-${mid}`)).toHaveAttribute("aria-label", /Morning open, Afternoon open, Night blocked/);
    await screen.getByTestId(`day-${mid}`).click();
    await expect(screen.getByTestId("summary-morning")).toHaveText("Morning: Open · 9:30 AM–1:00 PM · 0/3 booked");
    // Opening only some slots closes the others on those days, even though a sitter is open by default (014d).
    await expect(screen.getByTestId("summary-overnight")).toHaveText("Night: Blocked");

    // The day cell has no M · A · N letters: only the date, and only the closed overnight band is hatched (#134).
    await expect(screen.getByTestId(`day-${mid}`)).toHaveText(String(Number(mid.slice(8))));
    const hatched = async (slot: string) =>
      // One hatch covers the cell; an open band is a plain layer over it, so a hatched band is one with no fill.
      screen.getByTestId(`third-${mid}-${slot}`).evaluate((el) => {
        const cellHatched = getComputedStyle(el.parentElement!).backgroundImage.includes("repeating-linear-gradient");
        return cellHatched && getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)";
      });
    expect(await hatched("morning")).toBe(false);
    expect(await hatched("afternoon")).toBe(false);
    expect(await hatched("overnight")).toBe(true);
    await expect(screen.getByText("Not available", { exact: true })).toBeVisible();
  });

  test("a sitter picks a range by dragging across days, and clicking still works", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ ...SITTER_DEFAULTS });
    await signIn(page, SITTER);
    const screen = app(page);
    await screen.getByTestId("open-menu").click();
    await screen.getByTestId("open-schedule").click();
    await screen.getByTestId("calendar-next").click();

    const [a, b, c] = [nextMonthDay(10), nextMonthDay(12), nextMonthDay(20)];
    const center = async (day: string) => {
      const box = await screen.getByTestId(`day-${day}`).boundingBox();
      return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    };
    // Mouse: press on the 10th, drag across the 11th to the 12th, release.
    const from = await center(a);
    const to = await center(b);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    await expect(screen.getByTestId("schedule-summary")).toContainText("3 days");
    await expect(screen.getByTestId(`day-${a}`)).toHaveAttribute("aria-selected", "true");
    await expect(screen.getByTestId(`day-${b}`)).toHaveAttribute("aria-selected", "true");

    // Dragging backwards works too, and the click that ends a drag does not restart the selection.
    await page.mouse.move(to.x, to.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y, { steps: 6 });
    await page.mouse.up();
    await expect(screen.getByTestId("schedule-summary")).toContainText("3 days");

    // A plain click is still one day, and two clicks still make a range.
    await screen.getByTestId(`day-${a}`).click();
    await expect(screen.getByTestId("schedule-summary")).not.toContainText("days");
    await screen.getByTestId(`day-${c}`).click();
    await expect(screen.getByTestId("schedule-summary")).toContainText("11 days");
  });

  test("the gear closes weekdays by rule and sets the slot hours; nothing set means open", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ ...SITTER_DEFAULTS });
    await signIn(page, SITTER);
    await expect(page).toHaveURL(/\/sitter$/);
    await page.goto("/sitter/schedule");
    const screen = app(page);
    await screen.getByTestId("calendar-next").click();

    const day = nextMonthDay(10);
    const weekNext = nextMonthDay(17);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const label = (d: string) => screen.getByTestId(`day-${d}`);
    const hatched = (d: string, slot: string) =>
      screen.getByTestId(`third-${d}-${slot}`).evaluate((el) => {
        const cell = getComputedStyle(el.parentElement!).backgroundImage.includes("repeating-linear-gradient");
        return cell && getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)";
      });

    // Nothing set: every slot is open.
    await expect(label(day)).toHaveAttribute("aria-label", /Morning open, Afternoon open, Night open/);

    // Close that weekday's morning and overnight, and start the morning half an hour later.
    await screen.getByTestId("schedule-rules").click();
    await expect(screen.getByTestId("rules-sheet")).toBeVisible();
    await screen.getByTestId(`rule-morning-${weekday}`).click();
    await screen.getByTestId(`rule-overnight-${weekday}`).click();
    await screen.getByTestId("rules-morning-start-plus").click();
    await screen.getByTestId("rules-apply").click();
    await expect(screen.getByTestId("toast")).toContainText("Rules applied");
    await expect(screen.getByTestId("rules-sheet")).toBeHidden();

    expect(db.sitter_closing_rules).toEqual([
      expect.objectContaining({ sitter_id: SITTER.id, weekday, slot: "morning" }),
      expect.objectContaining({ sitter_id: SITTER.id, weekday, slot: "overnight" }),
    ]);
    expect(db.sitter_profiles[0].default_hours).toMatchObject({ morning: ["09:30", "13:00"] });

    // The rule applies to every such weekday, and only to those slots.
    await expect(label(day)).toHaveAttribute("aria-label", /Morning closed, Afternoon open, Night closed/);
    await expect(label(weekNext)).toHaveAttribute("aria-label", /Morning closed, Afternoon open, Night closed/);
    await expect(label(nextMonthDay(11))).toHaveAttribute("aria-label", /Morning open, Afternoon open, Night open/);
    expect(await hatched(day, "morning")).toBe(true);
    expect(await hatched(day, "afternoon")).toBe(false);
    expect(await hatched(day, "overnight")).toBe(true);
    // A day closed by hand stays closed next to the rules.
    await screen.getByTestId(`day-${nextMonthDay(12)}`).click();
    await screen.getByTestId("schedule-edit").click();
    await screen.getByTestId("schedule-mode-block").click();
    await screen.getByTestId("schedule-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Schedule saved");
    await expect(label(nextMonthDay(12))).toHaveAttribute("aria-label", /Morning blocked, Afternoon blocked, Night blocked/);

    // Tapping a rule-closed slot says why (a later day first, so the click starts a new selection).
    await label(day).click();
    await expect(screen.getByTestId("summary-morning")).toHaveText("Morning: Closed · weekly rule");
    await expect(screen.getByTestId("summary-afternoon")).toContainText("Afternoon: Open");

    // The sheet starts from what is saved; Open everything + Apply removes the rules (the hand-closed day stays).
    await screen.getByTestId("schedule-rules").click();
    await expect(screen.getByTestId(`rule-morning-${weekday}`)).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId(`rule-afternoon-${weekday}`)).toHaveAttribute("aria-checked", "false");
    await expect(screen.getByTestId("rules-morning-start-value")).toHaveText("9:30 AM");
    await screen.getByTestId("rules-clear").click();
    await screen.getByTestId("rules-apply").click();
    await expect(screen.getByTestId("rules-sheet")).toBeHidden();
    expect(db.sitter_closing_rules).toEqual([]);
    await expect(label(day)).toHaveAttribute("aria-label", /Morning open, Afternoon open, Night open/);
    await expect(label(nextMonthDay(12))).toHaveAttribute("aria-label", /Morning blocked/);
  });

  test("a weekday can have its own hours, and Same as every day takes them back", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ ...SITTER_DEFAULTS });
    await signIn(page, SITTER);
    await page.goto("/sitter/schedule");
    const screen = app(page);
    await screen.getByTestId("calendar-next").click();

    // A Monday in the middle of next month, and the Tuesday before it (so the second click starts a new selection).
    const monday = [10, 11, 12, 13, 14, 15, 16].map(nextMonthDay).find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1)!;
    const tuesday = nextMonthDay(Number(monday.slice(8)) - 6);

    await screen.getByTestId("schedule-rules").click();
    // Every day: morning 9:00 AM – 1:00 PM. Give Mondays a morning that starts half an hour later.
    await screen.getByTestId("rules-hours-day-1").click();
    await expect(screen.getByTestId("rules-morning-start-value")).toHaveText("9:00 AM");
    await screen.getByTestId("rules-morning-start-plus").click();
    await expect(screen.getByTestId("rules-morning-start-value")).toHaveText("9:30 AM");
    await expect(screen.getByTestId("rules-hours-day-1")).toContainText("Mon •");
    await screen.getByTestId("rules-hours-day-2").click(); // another weekday still shows the every-day hours
    await expect(screen.getByTestId("rules-morning-start-value")).toHaveText("9:00 AM");
    await screen.getByTestId("rules-hours-day-all").click();
    await expect(screen.getByTestId("rules-morning-start-value")).toHaveText("9:00 AM");
    await screen.getByTestId("rules-apply").click();
    await expect(screen.getByTestId("toast")).toContainText("Rules applied");

    expect(db.sitter_weekday_hours).toEqual([
      expect.objectContaining({ sitter_id: SITTER.id, weekday: 1, slot: "morning", starts_at: "09:30", ends_at: "13:00" }),
    ]);
    expect(db.sitter_profiles[0].default_hours).toMatchObject({ morning: ["09:00", "13:00"] });

    await screen.getByTestId(`day-${monday}`).click();
    await expect(screen.getByTestId("summary-morning")).toHaveText("Morning: Open · 9:30 AM–1:00 PM · 0/2 booked");
    await screen.getByTestId(`day-${tuesday}`).click();
    await expect(screen.getByTestId("summary-morning")).toHaveText("Morning: Open · 9:00 AM–1:00 PM · 0/2 booked");

    // The sheet starts from what is saved; Same as every day removes the weekday's own hours.
    await screen.getByTestId("schedule-rules").click();
    await expect(screen.getByTestId("rules-hours-day-1")).toContainText("Mon •");
    await screen.getByTestId("rules-hours-day-1").click();
    await screen.getByTestId("rules-hours-reset").click();
    await expect(screen.getByTestId("rules-morning-start-value")).toHaveText("9:00 AM");
    await expect(screen.getByTestId("rules-hours-day-1")).not.toContainText("•");
    await screen.getByTestId("rules-apply").click();
    await expect(screen.getByTestId("rules-sheet")).toBeHidden();
    expect(db.sitter_weekday_hours).toEqual([]);
  });

  test("a weekday's hours that end before they start cannot be applied", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ ...SITTER_DEFAULTS });
    await signIn(page, SITTER);
    await page.goto("/sitter/schedule");
    const screen = app(page);
    await screen.getByTestId("schedule-rules").click();
    await screen.getByTestId("rules-hours-day-3").click();
    for (let i = 0; i < 8; i++) await screen.getByTestId("rules-morning-end-minus").click();
    await expect(screen.getByTestId("rules-problem")).toHaveText("Morning on Wednesdays needs different start and end times.");
    await expect(screen.getByTestId("rules-apply")).toBeDisabled();
    expect(db.sitter_weekday_hours).toEqual([]);
  });

  test("slot hours that end before they start cannot be applied in the gear", async ({ page }) => {
    const { db } = await mockSupabase(page, [SITTER]);
    db.sitter_profiles.push({ ...SITTER_DEFAULTS });
    await signIn(page, SITTER);
    await page.goto("/sitter/schedule");
    const screen = app(page);
    await screen.getByTestId("schedule-rules").click();
    // Morning is 9:00 AM – 1:00 PM; bring the end back to the start.
    for (let i = 0; i < 8; i++) await screen.getByTestId("rules-morning-end-minus").click();
    await expect(screen.getByTestId("rules-problem")).toHaveText("Morning needs different start and end times.");
    await expect(screen.getByTestId("rules-apply")).toBeDisabled();
    expect(db.sitter_closing_rules).toEqual([]);
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
    // Every slot is open by default, so all three start checked; keep only the morning.
    await expect(screen.getByTestId("schedule-morning")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("schedule-afternoon")).toHaveAttribute("aria-checked", "true");
    await expect(screen.getByTestId("schedule-overnight")).toHaveAttribute("aria-checked", "true");
    await screen.getByTestId("schedule-afternoon").click();
    await screen.getByTestId("schedule-overnight").click();
    await screen.getByTestId("schedule-save").click();

    const conflicts = screen.getByTestId("schedule-conflicts");
    await expect(conflicts).toContainText("This overlaps Robert's booking (");
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
    // Open only the afternoon on the 12th: it is opened again, and the morning and overnight (unchecked) are closed.
    await screen.getByTestId("schedule-morning").click();
    await screen.getByTestId("schedule-overnight").click();
    await screen.getByTestId("schedule-afternoon").click();
    await screen.getByTestId("schedule-save").click();
    await expect(screen.getByTestId("toast")).toContainText("Schedule saved");

    const afternoonBlocks = db.sitter_availability
      .filter((r) => r.kind === "blocked" && r.slot === "afternoon")
      .map((r) => [r.start_date, r.end_date])
      .sort();
    expect(afternoonBlocks).toEqual([
      [nextMonthDay(10), nextMonthDay(11)],
      [nextMonthDay(13), nextMonthDay(14)],
    ]);
    await expect(screen.getByTestId(`day-${nextMonthDay(12)}`)).toHaveAttribute(
      "aria-label",
      /Morning blocked, Afternoon open, Night blocked/,
    );
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
