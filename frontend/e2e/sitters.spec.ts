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

    // #120: See schedule opens the month (a day's hours show under it, #268); the profile has no openings list.
    await expect(screen.getByTestId(/^sitter-opening-/)).toHaveCount(0);
    await expect(screen.getByText("Next openings")).toHaveCount(0);
    await expect(screen.getByTestId("ask-about-stay")).toHaveCount(0);
    await expect(screen.getByTestId("book-this-sitter")).toHaveCount(0);
    await expect(screen.getByTestId("start-chat")).toHaveText("Start chat");
    await screen.getByTestId("sitter-see-schedule").click();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}/calendar$`));
    // It opens with today's hours under the month, no hint text to read.
    await expect(screen.getByTestId("sitter-day-hours")).toBeVisible();
    await expect(screen.getByText("Tap a day to see its hours.")).toHaveCount(0);
    await screen.getByTestId("calendar-next").click();
    // A blocked slot reads as not available to owners; a slot nobody touched is open by default (014d).
    await expect(screen.getByTestId(`day-${nextMonthDay(10)}`)).toHaveAttribute(
      "aria-label",
      /Morning open, Afternoon closed, Night open/,
    );
    // #268: a day's hours show right under the month, no new page and no sheet; Start chat stays on the page.
    await screen.getByTestId(`day-${nextMonthDay(10)}`).click();
    await expect(page).toHaveURL(new RegExp(`/owner/sitters/${SITTER.id}/calendar$`));
    await expect(screen.getByTestId("sitter-day-hours")).toBeVisible();
    await expect(screen.getByTestId("sitter-day-morning")).toBeInViewport(); // scrolled into view on a short screen
    await expect(screen.getByTestId("start-chat").last()).toBeVisible(); // the profile underneath has its own
    await expect(screen.getByTestId("sitter-day-morning")).toContainText("Morning");
    await expect(screen.getByTestId("sitter-day-morning")).toContainText("8 AM to 12 PM");
    await expect(screen.getByTestId("sitter-day-morning")).toContainText("1 spot left");
    await expect(screen.getByTestId("sitter-day-afternoon")).toContainText("Not available");
    await expect(screen.getByTestId("sitter-day-overnight")).toContainText("6 PM to 8 AM");
    await expect(screen.getByTestId("sitter-day-overnight")).toContainText("2 spots left");

    // Another day in the same month replaces the hours under it.
    await screen.getByTestId(`day-${nextMonthDay(11)}`).click();
    await expect(screen.getByTestId("sitter-day-morning")).toContainText("Full");
    await expect(screen.getByTestId("sitter-day")).not.toContainText("Robert");
  });

  test("photo, name and heart share one row; the heart saves and survives a reload (#136)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, service_area: "North York", experience_years: 3, services: ["boarding"] });
    db.profile_photos.push({ id: "ph-1", profile_id: SITTER.id, public_id: "goldito/profiles/chloe-1", position: 0 });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/sitters/${SITTER.id}`);
    const screen = app(page);

    // One line at phone width: the photo, the name and the heart sit side by side.
    const photo = await screen.getByTestId("sitter-photo").boundingBox();
    const name = await screen.getByTestId("sitter-name").boundingBox();
    const heart = await screen.getByTestId("sitter-favorite").boundingBox();
    expect(photo && name && heart).toBeTruthy();
    expect(photo!.x + photo!.width).toBeLessThanOrEqual(name!.x);
    expect(name!.x + name!.width).toBeLessThanOrEqual(heart!.x);
    for (const box of [name!, heart!]) {
      expect(box.y).toBeLessThan(photo!.y + photo!.height);
      expect(box.y + box.height).toBeGreaterThan(photo!.y);
    }
    await expect(screen.getByText("Add to favorites", { exact: true })).toHaveCount(0); // no separate row

    await screen.getByTestId("sitter-favorite").click();
    await expect(screen.getByTestId("toast")).toContainText("Added to favorites");
    await expect.poll(() => db.owner_favorite_sitters.length).toBe(1);
    await page.reload();
    await expect(app(page).getByTestId("sitter-favorite")).toHaveAttribute("aria-label", "Remove from favorites");
    await app(page).getByTestId("sitter-favorite").click();
    await expect(app(page).getByTestId("toast")).toContainText("Removed from favorites");
    await expect.poll(() => db.owner_favorite_sitters.length).toBe(0);
  });

  test("the photo opens a full-screen viewer: cover first, arrows, keys and swipe move, Escape closes (#136)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, service_area: "North York", experience_years: 3, services: ["boarding"] });
    // The mock keeps insert order (no order=position), so the rows go in by position.
    db.profile_photos.push(
      { id: "ph-1", profile_id: SITTER.id, public_id: "goldito/profiles/chloe-1", position: 0 },
      { id: "ph-2", profile_id: SITTER.id, public_id: "goldito/profiles/chloe-2", position: 1 },
      { id: "ph-3", profile_id: SITTER.id, public_id: "goldito/profiles/chloe-3", position: 2 },
    );
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/sitters/${SITTER.id}`);
    const screen = app(page);

    await screen.getByTestId("sitter-photo").click();
    const viewer = screen.getByTestId("photo-viewer");
    await expect(viewer).toBeVisible();
    await expect(screen.getByTestId("photo-viewer-photo-ph-1")).toBeVisible(); // the cover first
    await expect(screen.getByTestId("photo-viewer-count")).toHaveText("1 / 3");
    await expect(screen.getByTestId("photo-viewer-prev")).toHaveCount(0);

    await screen.getByTestId("photo-viewer-next").click();
    await expect(screen.getByTestId("photo-viewer-photo-ph-2")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(screen.getByTestId("photo-viewer-count")).toHaveText("3 / 3");
    await expect(screen.getByTestId("photo-viewer-next")).toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
    await expect(screen.getByTestId("photo-viewer-photo-ph-2")).toBeVisible();

    // A mouse drag to the right goes back one (the frame turns mouse drags into touches).
    const box = (await viewer.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 8 });
    await page.mouse.up();
    await expect(screen.getByTestId("photo-viewer-photo-ph-1")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await screen.getByTestId("sitter-photo").click();
    await screen.getByTestId("photo-viewer-close").click();
    await expect(screen.getByTestId("photo-viewer")).toHaveCount(0);
  });

  test("a sitter with no photos shows their initial, and it opens nothing (#136)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    db.sitter_profiles.push({ id: SITTER.id, bio: null, service_area: "North York", experience_years: 3, services: ["boarding"] });
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/sitters/${SITTER.id}`);
    const screen = app(page);

    await expect(screen.getByTestId("sitter-photo-initial")).toHaveText("C");
    await expect(screen.getByTestId("sitter-photo")).toHaveCount(0);
    await screen.getByTestId("sitter-photo-initial").click();
    await expect(screen.getByTestId("photo-viewer")).toHaveCount(0);
  });

  test("an unknown sitter link shows a friendly empty state", async ({ page }) => {
    await mockSupabase(page, [OWNER]);
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/owner$/);
    await page.goto(`/owner/sitters/${OWNER.id}`);
    await expect(app(page).getByText("Sitter not found")).toBeVisible();
  });
});
