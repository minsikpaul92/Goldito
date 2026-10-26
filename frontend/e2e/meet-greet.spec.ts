import { Page, expect, test } from "@playwright/test";

import { app, signIn } from "./helpers";
import { MockDb, MockUser, OWNER, SITTER, mockSupabase } from "./supabaseMock";

// Meet & Greet for a first-time pair (phase-03b 3B.9, D44): in person, video, done, skip.

const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const MAX = "00000000-0000-4000-8000-0000000000c1";

function seed(db: MockDb, meetGreet: Record<string, unknown>) {
  db.pets.push({ id: MAX, owner_id: OWNER.id, species: "dog", name: "Max", breed: null, notes: null });
  db.owner_profiles.push({ id: OWNER.id, meet_spots: ["Trinity Bellwoods — north gate"] });
  db.sitter_profiles.push({ id: SITTER.id, meet_spots: ["Christie Pits — east entrance"] });
  db.bookings.push({
    id: BOOKING,
    owner_id: OWNER.id,
    sitter_id: SITTER.id,
    status: "requested",
    service_type: "boarding",
    created_at: "2026-10-02T18:00:00Z",
    meet_greet_status: "required",
    // The sitter already said "Yes, let's meet" (011l) — the dates are held, the Meet & Greet can be planned.
    sitter_interest_at: new Date().toISOString(),
    meet_greet_due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    ...meetGreet,
  });
  db.booking_pets.push({ booking_id: BOOKING, pet_id: MAX });
  for (const [kind, at] of [
    ["drop_off", "2030-10-05T13:30:00.000Z"],
    ["pick_up", "2030-10-08T21:00:00.000Z"],
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
}

async function openDetail(page: Page, user: MockUser) {
  await signIn(page, user);
  await expect(page).toHaveURL(user.role === "owner" ? /\/owner$/ : /\/sitter$/);
  await page.goto(`/${user.role}/bookings/${BOOKING}`);
  const screen = app(page);
  await expect(screen.getByTestId("meet-greet")).toBeVisible();
  return screen;
}

test.describe("meet & greet", () => {
  test("the owner suggests meeting in person at the sitter's spot", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {});
    const screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("meet-greet")).toContainText("Chloe is holding your dates");
    await expect(screen.getByTestId("meet-greet")).toContainText("Pick a time with Chloe");

    await screen.getByTestId("meet-schedule").click();
    await expect(screen.getByTestId("meet-time-value")).toHaveText("7:00 PM");
    await expect(screen.getByTestId("meet-spot-Trinity Bellwoods — north gate")).toContainText("Robert's spot");
    await screen.getByTestId("meet-spot-Christie Pits — east entrance").click();

    // #229: the day from the calendar, the time to the minute from the clock (no 15 minute steps).
    await screen.getByTestId("meet-day-open").click();
    await expect(screen.getByTestId("meet-calendar-sheet")).toBeVisible();
    await screen.getByTestId("meet-calendar-sheet-next").click();
    const firstNextMonth = await screen.locator('[data-testid^="meet-calendar-sheet-20"]').first().getAttribute("data-testid");
    const day = firstNextMonth!.replace("meet-calendar-sheet-", "");
    await screen.getByTestId(`meet-calendar-sheet-${day}`).click();
    await screen.getByTestId("meet-time-open").click();
    await screen.getByTestId("time-hour-3").click();
    await screen.getByTestId("time-min-07").click();
    await screen.getByTestId("time-ampm-pm").click();
    await expect(screen.getByTestId("meet-clock-set")).toHaveText("Set 3:07 PM");
    await screen.getByTestId("meet-clock-set").click();
    await expect(screen.getByTestId("meet-time-value")).toHaveText("3:07 PM");
    await screen.getByTestId("meet-send").click();

    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet sent to Chloe");
    const call = db.meetGreetCalls.find((c) => c.fn === "propose_meet_greet");
    expect(call).toMatchObject({ p_mode: "in_person", p_place: "Christie Pits — east entrance" });
    // 3:07 PM in Toronto on the picked day (EDT in the fall, UTC-4; EST from November, UTC-5).
    const at = new Date(String(call!.p_at));
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(at)).toBe(day);
    expect(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }).format(at)).toBe("3:07 PM");
    await expect(screen.getByTestId("meet-greet")).toContainText("Waiting for Chloe");
    await expect(screen.getByTestId("meet-greet")).toContainText("In person · Christie Pits — east entrance");
  });

  test("the sitter accepts, marks it done (before the time it asks first), and can then accept; the booking waits for the owner's yes", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {
      meet_greet_status: "proposed",
      meet_greet_mode: "in_person",
      meet_greet_place: "Christie Pits — east entrance",
      meet_greet_at: "2030-10-04T23:00:00.000Z",
      meet_greet_proposed_by: OWNER.id,
    });
    const screen = await openDetail(page, SITTER);
    await expect(screen.getByTestId("accept-booking")).toBeDisabled();
    await expect(screen.getByTestId("meet-greet")).toContainText("Robert suggested a Meet & Greet");
    await expect(screen.getByTestId("meet-greet")).toContainText("Oct 4, 7:00 PM");

    await screen.getByTestId("meet-accept").click();
    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet set with Robert");
    await expect(screen.getByTestId("meet-greet")).toContainText("Meet & Greet set");
    await expect(screen.getByTestId("meet-greet")).not.toContainText("After you meet");
    await screen.getByTestId("meet-check-Care needs").click();
    await expect(screen.getByTestId("meet-check-Care needs")).toHaveAttribute("aria-checked", "true");

    // #229: Done shows before the agreed time; pressed early it asks first, and Cancel changes nothing.
    await screen.getByTestId("meet-done").click();
    await expect(screen.getByTestId("meet-done-early-sheet")).toContainText("Did you already meet Robert?");
    await screen.getByTestId("meet-done-early-cancel").click();
    expect(db.bookings[0].meet_greet_status).toBe("agreed");
    await screen.getByTestId("meet-done").click();
    await screen.getByTestId("meet-done-early-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet done");
    await expect(screen.getByTestId("meet-greet")).toContainText("Met");
    await expect(screen.getByTestId("accept-booking")).toBeEnabled();
    await screen.getByTestId("accept-booking").click();
    // 014o: the sitter's yes is half of the agreement; the owner still has to say "I'd like to book".
    await expect(screen.getByTestId("accepted-waiting")).toContainText("Waiting for Robert to book");
    expect(db.bookings[0].status).toBe("requested");
    expect(db.bookings[0].sitter_accepted_at).toBeTruthy();
  });

  test("an agreed video Meet & Greet shows Join Google Meet once the link exists", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {
      meet_greet_status: "agreed",
      meet_greet_mode: "video",
      meet_greet_at: "2030-10-04T23:00:00.000Z",
      meet_greet_proposed_by: SITTER.id,
    });
    const screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("meet-greet")).toContainText("Online · Oct 4, 7:00 PM");
    await expect(screen.getByTestId("meet-greet")).toContainText("No Google Meet link yet");
    // #229: a video call has nothing to go over together.
    await expect(screen.getByTestId("meet-greet")).not.toContainText("Go over together");
    await expect(screen.getByTestId(/^meet-check-/)).toHaveCount(0);
    await expect(screen.getByTestId("meet-join")).toHaveCount(0);

    db.bookings[0].meet_greet_link = "https://meet.google.com/abc-defg-hij";
    await page.reload();
    await expect(screen.getByTestId("meet-join")).toBeVisible();
    // A real link, not a script call: Safari blocks the second kind but never a plain link click.
    await expect(screen.getByTestId("meet-join")).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    await expect(screen.getByTestId("meet-join")).toHaveAttribute("target", "_blank");
    await expect(screen.getByTestId("meet-join")).toHaveAttribute("rel", /noopener/);
    // #229: a click opens a new tab and the app stays where it was.
    await page.context().route("https://meet.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html>meet</html>" }));
    const [meet] = await Promise.all([page.context().waitForEvent("page"), screen.getByTestId("meet-join").click()]);
    expect(meet.url()).toBe("https://meet.google.com/abc-defg-hij");
    await meet.close();
    await expect(page).toHaveURL(new RegExp(`/owner/bookings/${BOOKING}$`));
    await expect(screen.getByTestId("meet-greet")).toBeVisible();
    await expect(screen.getByTestId("meet-calendar")).toBeVisible();
    // #170: a Google Calendar event page in a new tab, as a real link (no .ics download).
    const calendar = screen.getByTestId("meet-calendar");
    await expect(calendar).toHaveAttribute("target", "_blank");
    const href = new URL((await calendar.getAttribute("href"))!);
    expect(href.origin + href.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(href.searchParams.get("action")).toBe("TEMPLATE");
    expect(href.searchParams.get("text")).toBe("Goldito Meet & Greet: Max with Robert & Chloe");
    expect(href.searchParams.get("dates")).toBe("20301004T230000Z/20301004T233000Z");
    expect(href.searchParams.get("location")).toBe("https://meet.google.com/abc-defg-hij");
    expect(href.searchParams.get("details")).toBe("Join: https://meet.google.com/abc-defg-hij");
  });

  test("a skip needs the other side: Continue unlocks Accept", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {});
    const owner = await openDetail(page, OWNER);
    await owner.getByTestId("meet-skip").click();
    await expect(owner.getByTestId("meet-skip-sheet")).toContainText("Chloe can accept, ask to meet, or decline.");
    await owner.getByTestId("meet-skip-confirm").click();
    await expect(owner.getByTestId("toast")).toContainText("Asked Chloe to skip the Meet & Greet");
    expect(db.bookings[0].meet_greet_status).toBe("skip_requested");
    await expect(owner.getByTestId("meet-greet")).toContainText("Waiting for Chloe");

    // Switch phones: drop the owner's stored session, then sign in as the sitter.
    await page.evaluate(() => localStorage.clear());
    const sitter = await openDetail(page, SITTER);
    await expect(sitter.getByTestId("meet-greet")).toContainText("Robert would like to skip the Meet & Greet");
    await sitter.getByTestId("meet-skip-accept").click();
    await expect(sitter.getByTestId("toast")).toContainText("Meet & Greet skipped");
    await expect(sitter.getByTestId("meet-greet")).toContainText("Meet & Greet skipped, you both agreed");
    await expect(sitter.getByTestId("accept-booking")).toBeEnabled();
  });

  test("right after the request the owner picks Request or Skip Meet & Greet; nothing is held yet (#236)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { sitter_interest_at: null, meet_greet_due_at: null });
    const screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("meet-request")).toHaveText("Request");
    await expect(screen.getByTestId("meet-skip")).toHaveText("Skip");
    await expect(screen.getByTestId("hold-note")).toHaveCount(0);

    await screen.getByTestId("meet-request").click();
    await screen.getByTestId("meet-mode-video").click();
    await screen.getByTestId("meet-send").click();
    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet sent to Chloe");
    expect(db.bookings[0]).toMatchObject({ meet_greet_status: "proposed", meet_greet_proposed_by: OWNER.id, sitter_interest_at: null });
    await expect(screen.getByTestId("meet-greet")).toContainText("Waiting for Chloe");
  });

  test("the Meet & Greet time stops before the drop-off (#236)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    // Chloe suggested 7 PM on the drop-off day (Oct 5, 2030, drop-off 9:30 AM); Robert suggests another time.
    seed(db, {
      meet_greet_status: "proposed",
      meet_greet_mode: "video",
      meet_greet_at: "2030-10-05T23:00:00.000Z",
      meet_greet_proposed_by: SITTER.id,
    });
    const screen = await openDetail(page, OWNER);
    await screen.getByTestId("meet-counter").click();
    await expect(screen.getByTestId("meet-day-value")).toHaveText("Oct 5");
    await expect(screen.getByTestId("meet-day-plus")).toBeDisabled();
    await expect(screen.getByTestId("meet-sheet")).toContainText("Pick a time before the drop-off.");
    await expect(screen.getByTestId("meet-send")).toBeDisabled();
    await screen.getByTestId("meet-day-value").click();
    await expect(screen.getByTestId("meet-calendar-sheet-2030-10-06")).toBeDisabled();
    await screen.getByTestId("meet-calendar-sheet-2030-10-04").click();
    await expect(screen.getByTestId("meet-day-value")).toHaveText("Oct 4");
    await expect(screen.getByTestId("meet-send")).toBeEnabled();
  });

  test("the sitter answers the owner's time: Accept holds the dates (#236)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {
      sitter_interest_at: null,
      meet_greet_due_at: null,
      meet_greet_status: "proposed",
      meet_greet_mode: "video",
      meet_greet_at: "2030-10-04T23:00:00.000Z",
      meet_greet_proposed_by: OWNER.id,
    });
    const screen = await openDetail(page, SITTER);
    await expect(screen.getByTestId("meet-greet")).toContainText("Robert suggested a Meet & Greet");
    await expect(screen.getByTestId("meet-skip")).toHaveText("Request skip");
    await expect(screen.getByTestId("meet-decline")).toHaveText("Decline");
    await screen.getByTestId("meet-accept").click();
    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet set with Robert");
    expect(db.bookings[0].meet_greet_status).toBe("agreed");
    expect(db.bookings[0].sitter_interest_at).toBeTruthy();
  });

  test("the sitter can ask to skip the owner's time instead, which holds the dates (#236)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {
      sitter_interest_at: null,
      meet_greet_due_at: null,
      meet_greet_status: "proposed",
      meet_greet_mode: "video",
      meet_greet_at: "2030-10-04T23:00:00.000Z",
      meet_greet_proposed_by: OWNER.id,
    });
    const screen = await openDetail(page, SITTER);
    await screen.getByTestId("meet-skip").click();
    await screen.getByTestId("meet-skip-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Asked Robert to skip the Meet & Greet");
    expect(db.bookings[0]).toMatchObject({ meet_greet_status: "skip_requested", meet_greet_skip_requested_by: SITTER.id });
    expect(db.bookings[0].sitter_interest_at).toBeTruthy();
  });

  test("Decline on a Meet & Greet time asks first and ends the request (#236)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {
      sitter_interest_at: null,
      meet_greet_due_at: null,
      meet_greet_status: "proposed",
      meet_greet_mode: "video",
      meet_greet_at: "2030-10-04T23:00:00.000Z",
      meet_greet_proposed_by: OWNER.id,
    });
    const screen = await openDetail(page, SITTER);
    await screen.getByTestId("meet-decline").click();
    await expect(screen.getByTestId("meet-decline-sheet")).toContainText("This ends Robert's booking request.");
    expect(db.meetGreetCalls.find((c) => c.fn === "decline_meet_greet")).toBeUndefined();
    await screen.getByTestId("meet-decline-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Request declined");
    expect(db.bookings[0]).toMatchObject({ status: "cancelled", cancel_reason: "meet_greet_declined", cancelled_by: SITTER.id });
  });

  test("a skip request can be answered with a new time (#236)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { meet_greet_status: "skip_requested", meet_greet_skip_requested_by: SITTER.id });
    const screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("meet-greet")).toContainText("Chloe would like to skip the Meet & Greet");
    await expect(screen.getByTestId("meet-skip-accept")).toHaveText("Accept skip");
    await screen.getByTestId("meet-skip-counter").click();
    await screen.getByTestId("meet-mode-video").click();
    await screen.getByTestId("meet-send").click();
    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet sent to Chloe");
    expect(db.bookings[0]).toMatchObject({ meet_greet_status: "proposed", meet_greet_proposed_by: OWNER.id, meet_greet_skip_requested_by: null });
  });

  test("the sitter's Next holds the dates and opens the Meet & Greet; a disabled I accept says why (#170)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { sitter_interest_at: null, meet_greet_due_at: null });
    const screen = await openDetail(page, SITTER);
    await expect(screen.getByTestId("accept-booking")).toHaveCount(0);
    await expect(screen.getByTestId("meet-greet")).toContainText("Tap Next to hold these dates");
    await expect(screen.getByTestId("interest-booking")).toHaveText("Next");

    await screen.getByTestId("interest-booking").click();
    await expect(screen.getByTestId("toast")).toContainText("Dates held");
    expect(db.bookings[0].sitter_interest_at).toBeTruthy();
    expect(db.notifications.find((n) => n.type === "booking_interest")).toMatchObject({ user_id: OWNER.id });
    await expect(screen.getByTestId("meet-greet")).toContainText("These dates are on hold for Robert");
    await expect(screen.getByTestId("stage-caption")).toContainText("Day 1");
    await expect(screen.getByTestId("accept-booking")).toHaveText("I accept");
    await expect(screen.getByTestId("accept-booking")).toBeDisabled();
    await expect(screen.getByTestId("accept-reason")).toHaveText("Meet Robert first, or agree to skip the Meet & Greet.");
  });

  test("two days without a time: the card asks for a time, a skip or a decline", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { meet_greet_due_at: new Date(Date.now() - 3_600_000).toISOString() });
    const screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("meet-greet")).toContainText("Still no time to meet");
    await expect(screen.getByTestId("meet-greet")).toContainText("With no answer in 3 days the booking is cancelled");
  });

  test("after the first yes the owner can still say \"Not this sitter\" with a reason, which frees the dates", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, {});
    const screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("hold-note")).toContainText("Chloe is holding your dates");
    await expect(screen.getByTestId("cancel-booking")).toHaveText("Not this sitter");
    await screen.getByTestId("cancel-booking").click();
    await screen.getByTestId("pass-reason-1").click();
    await screen.getByTestId("pass-note").fill("We went with a neighbour");
    await screen.getByTestId("cancel-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Booking cancelled");
    expect(db.cancellations.at(-1)).toMatchObject({ p_reason: "Found another sitter\nWe went with a neighbour" });
    expect(db.bookings[0].status).toBe("cancelled");
  });

  test("the sitter answers the owner's skip with a time instead, which holds the dates (#236)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { sitter_interest_at: null, meet_greet_due_at: null, meet_greet_status: "skip_requested", meet_greet_skip_requested_by: OWNER.id });
    const screen = await openDetail(page, SITTER);
    await expect(screen.getByTestId("meet-greet")).toContainText("Robert would like to skip the Meet & Greet");
    await expect(screen.getByTestId("meet-skip-counter")).toHaveText("Request Meet & Greet");
    await screen.getByTestId("meet-skip-counter").click();
    await screen.getByTestId("meet-mode-video").click();
    await screen.getByTestId("meet-send").click();
    await expect(screen.getByTestId("toast")).toContainText("Meet & Greet sent to Robert");
    expect(db.bookings[0]).toMatchObject({ meet_greet_status: "proposed", meet_greet_proposed_by: SITTER.id, meet_greet_skip_requested_by: null });
    expect(db.bookings[0].sitter_interest_at).toBeTruthy();
  });

  test("the stage bar says Scheduled under Meet & Greet once a time is agreed, and Skipped without a check (#237)", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { meet_greet_status: "agreed", meet_greet_mode: "video", meet_greet_at: "2030-10-04T23:00:00.000Z", meet_greet_proposed_by: SITTER.id });
    let screen = await openDetail(page, OWNER);
    await expect(screen.getByTestId("stage-step-1")).toHaveText("Meet");
    await expect(screen.getByTestId("stage-step-1")).toHaveAttribute("aria-label", "Meet & Greet");
    await expect(screen.getByTestId("stage-note-1")).toHaveText("Scheduled");

    db.bookings[0].meet_greet_status = "skipped";
    await page.reload();
    screen = app(page);
    await expect(screen.getByTestId("stage-note-1")).toHaveText("Skipped");
    // The step is passed without a check: "–" in its circle (Request keeps its ✓).
    await expect(screen.getByTestId("stage-bar")).toContainText("✓Request–Meet");
  });

  test("declining a skip asks first and ends the request", async ({ page }) => {
    const { db } = await mockSupabase(page, [OWNER, SITTER]);
    seed(db, { meet_greet_status: "skip_requested", meet_greet_skip_requested_by: OWNER.id });
    const screen = await openDetail(page, SITTER);
    await screen.getByTestId("meet-skip-decline").click();
    await expect(screen.getByTestId("meet-decline-sheet")).toContainText("This ends Robert's booking request.");
    await screen.getByTestId("meet-decline-confirm").click();
    await expect(screen.getByTestId("toast")).toContainText("Request declined");
    expect(db.bookings[0]).toMatchObject({ status: "cancelled", cancel_reason: "meet_greet_declined" });
  });
});
