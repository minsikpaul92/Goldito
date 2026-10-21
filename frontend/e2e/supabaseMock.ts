import type { Page, Route } from "@playwright/test";

import { distanceMeters } from "../lib/location";
import { addDays, appToday, zonedToIso } from "../features/schedule/dates";

/**
 * Fake Supabase Auth + `profiles` for e2e (no real project, no secrets).
 * The e2e build points EXPO_PUBLIC_SUPABASE_URL at the test server itself, so every
 * request is same-origin and handled here by path.
 */

export type MockUser = {
  id: string;
  email: string;
  password: string;
  role: "owner" | "sitter";
  displayName: string;
};

export const OWNER: MockUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@goldito.test",
  password: "max-and-mochi",
  role: "owner",
  displayName: "Robert",
};

export const SITTER: MockUser = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "sitter@goldito.test",
  password: "care-snap-tap",
  role: "sitter",
  displayName: "Chloe",
};

// "Now" for the mock's own rules and timestamps: the real clock, or the fixed time a test passes to
// mockSupabase({ now }) so it matches the browser clock (page.clock) the test installs.
let fixedNow: number | null = null;
function nowMs(): number {
  return fixedNow ?? Date.now();
}

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sessionFor(user: MockUser) {
  const now = Math.floor(nowMs() / 1000);
  const claims = { sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 };
  const timestamp = new Date(nowMs()).toISOString();
  return {
    access_token: `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(claims)}.e2e-signature`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: `refresh-${user.id}`,
    user: {
      id: user.id,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      email_confirmed_at: timestamp,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { role: user.role, display_name: user.displayName },
      created_at: timestamp,
      updated_at: timestamp,
    },
  };
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

export async function mockSupabase(page: Page, initialUsers: MockUser[], options: { now?: Date; db?: MockDb } = {}) {
  fixedNow = options.now ? options.now.getTime() : null;
  // Copies, so a test that edits a user (e.g. display name) never leaks into the next one.
  const users = initialUsers.map((user) => ({ ...user }));
  const signups: { email: string; role: string; display_name: string }[] = [];

  await page.route("**/auth/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const grant = url.searchParams.get("grant_type");

    if (url.pathname.endsWith("/token") && grant === "password") {
      const { email, password } = request.postDataJSON();
      const user = users.find((u) => u.email === email && u.password === password);
      if (!user) {
        return json(route, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return json(route, 200, sessionFor(user));
    }
    if (url.pathname.endsWith("/token") && grant === "refresh_token") {
      const { refresh_token } = request.postDataJSON();
      const user = users.find((u) => `refresh-${u.id}` === refresh_token);
      return user ? json(route, 200, sessionFor(user)) : json(route, 400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    }
    if (url.pathname.endsWith("/signup")) {
      const { email, password, data } = request.postDataJSON();
      if (users.some((u) => u.email === email)) {
        return json(route, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
      }
      const user: MockUser = { id: crypto.randomUUID(), email, password, role: data.role, displayName: data.display_name };
      users.push(user);
      signups.push({ email, role: data.role, display_name: data.display_name });
      return json(route, 200, sessionFor(user));
    }
    if (url.pathname.endsWith("/logout")) {
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith("/user")) {
      // auth.getUser() — used by signConsent / saveOwnerHomeAccess (03C).
      const auth = request.headers().authorization ?? "";
      const token = auth.replace(/^Bearer /, "");
      const payload = token.split(".")[1];
      let sub: string | null = null;
      try {
        sub = payload
          ? (JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string }).sub ?? null
          : null;
      } catch {
        sub = null;
      }
      const user = users.find((u) => u.id === sub);
      if (!user) return json(route, 401, { msg: "Invalid JWT" });
      return json(route, 200, { user: sessionFor(user).user });
    }
    return json(route, 404, { msg: `Not mocked: ${request.method()} ${url.pathname}` });
  });

  // `options.db` lets two browser contexts (an owner and a sitter) work on the same data.
  const db = options.db ?? createMockDb();
  await page.route("**/rest/v1/**", (route) => handleRest(route, users, db));

  return { signups, db };
}

// ---------------------------------------------------------------------------
// A tiny in-memory PostgREST: only the request shapes the app sends.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export type MockDb = {
  /** rpc/stay_capacity_check answer: null = the stay fits. */
  stayShortfall?: string | null;
  /** rpc/get_booking_stages fails (CR-8: the app falls back to its own reading of the booking). */
  stagesFail?: boolean;
  /** rpc/stay_capacity_check calls with their parameters. */
  stayChecks: Row[];
  pets: Row[];
  pet_allergies: Row[];
  /** 014v: public_id and position per pet. */
  pet_photos: Row[];
  owner_profiles: Row[];
  sitter_profiles: Row[];
  sitter_availability: Row[];
  sitter_closing_rules: Row[];
  sitter_weekday_hours: Row[];
  sitter_profile_answers: Row[];
  /** 014g: { id, profile_id, public_id }, in the person's order (first = cover). */
  profile_photos: Row[];
  /** 014j: one thread per owner and sitter, and its messages (text or card). */
  chat_threads: Row[];
  chat_messages: Row[];
  /** The 014o trigger, in memory: what each booking looked like when its step cards were last brought up to date. */
  cardSigs: Record<string, string>;
  /** Who made the last RPC call: the sender of the step cards that call caused. */
  lastActor: string | null;
  bookings: Row[];
  /** Capacity units of a booking: { booking_id, day, slot } (phase-02 booking_slots). */
  booking_slots: Row[];
  /** cancel_booking calls: { p_booking, p_reason }. */
  cancellations: Row[];
  booking_handoffs: Row[];
  booking_pets: Row[];
  /** What rpc/search_sitters returns (rows in the 004 shape); calls land in `searches`. */
  search_results: Row[];
  searches: Row[];
  /** Sitters rpc/search_sitters_nearby (014c) can return, in its shape: each row's `distance_km` is the exact
   * distance; the handler keeps rows within p_radius_km and rounds it. Calls land in `nearbySearches`. */
  nearby_sitters: Row[];
  nearbySearches: Row[];
  /** Forces rpc/search_sitters_nearby to fail with this code (e.g. "no_home_point"). */
  nearby_error: string | null;
  /** request_booking calls with their parameters. */
  requests: Row[];
  care_tasks: Row[];
  /** Today's instances of care tasks (phase 06). */
  task_logs: Row[];
  /** log_care_checkin rows (phase 06). */
  care_checkins: Row[];
  /** Care request notes and Heads-ups (phase 06 6.13). */
  care_requests: Row[];
  pet_cautions: Row[];
  /** send_care_change_request / respond_care_change_request (phase 06 6.20). */
  care_change_requests: Row[];
  /** respond_booking / propose_handoff calls with their parameters. */
  responses: Row[];
  proposals: Row[];
  /** Meet & Greet RPC calls: { fn, ...params }. */
  meetGreetCalls: Row[];
  /** create_pet_with_profile calls (014v) with their parameters. */
  createPetCalls: Row[];
  /** complete_handoff calls. */
  completions: Row[];
  /** Pet Transit (012): the trips of the two parties; the RPCs below follow the SQL rules. */
  trips: Row[];
  /** complete_task_log calls (phase 06). */
  taskCompletions: Row[];
  /** save_care_request calls, even refused ones (phase 06 6.13). */
  saves: Row[];
  /** Owner consent signatures (03C). */
  booking_consents: Row[];
  /** Owner entry codes (03C) — sitters only via get_home_access. */
  owner_home_access: Row[];
  /** pay_booking_demo calls. */
  payments: Row[];
  /** agree_to_book calls: { p_booking }. */
  agreements: Row[];
  /** Unread / Realtime notices (Phase 05) — empty in e2e unless a test seeds rows. */
  notifications: Row[];
  /** Feed posts + media rows (Phase 05 upload path). */
  feed_posts: Row[];
  media: Row[];
  /** AI drafts (private to the sitter) and sent reports (Phase 07). */
  daily_reports: Row[];
  /** Reviews of finished stays (Phase 07C). */
  reviews: Row[];
  sitter_owner_notes: Row[];
  owner_favorite_sitters: Row[];
  /** Pet Life Records (Phase 07C): written by the backend, read by the owner. */
  pet_life_records: Row[];
  /** Pet medals (015b): given by the sitter after a stay, read by the owner. */
  pet_medals: Row[];
  /** Prices a sitter set (006). Empty = nobody has any, like a fresh sitter. */
  sitter_rates: Row[];
  /** Treat checks (12.1, 013): written by the backend (tests push the row the API would insert); clients set acknowledged_at. */
  safety_checks: Row[];
  photo_requests: Row[];
  /** Stickers of a pet (12.3, 013b): rows point at a `media` row; read newest first with the media embedded. */
  pet_stickers: Row[];
  /** Sticker layers on a report (12.3b, 013b): one row per report and person; an upsert replaces it. */
  report_decor: Row[];
  /** Pages an owner hid from their own book (014t). */
  diary_page_hidden: Row[];
  /** When set, quote_booking fails with this code (the real one throws before it prices anything). */
  quote_error: string | null;
  /** RPC detail sent with quote_error (rates_not_set names the service, 014k). */
  quote_error_detail: string | null;
  /** When set, quote_booking returns this instead of DEMO_QUOTE. */
  quote: Record<string, unknown> | null;
};

const OWNER_PROFILE_FIELDS = ["home_address", "home_lat", "home_lng", "emergency_contact_name", "emergency_contact_phone", "vet_clinic_name", "vet_clinic_phone"];
const SITTER_PROFILE_FIELDS = ["bio", "service_area", "experience_years", "home_notes", "home_address", "home_lat", "home_lng"];

function emptyRow(id: string, fields: string[]): Row {
  return Object.fromEntries([["id", id], ...fields.map((f) => [f, null])]);
}

function createMockDb(): MockDb {
  return {
    pets: [],
    pet_allergies: [],
    pet_photos: [],
    owner_profiles: [],
    sitter_profiles: [],
    sitter_availability: [],
    sitter_closing_rules: [],
    sitter_weekday_hours: [],
    sitter_profile_answers: [],
    profile_photos: [],
    chat_threads: [],
    chat_messages: [],
    cardSigs: {},
    lastActor: null,
    bookings: [],
    booking_slots: [],
    cancellations: [],
    booking_handoffs: [],
    booking_pets: [],
    search_results: [],
    searches: [],
    nearby_sitters: [],
    nearbySearches: [],
    nearby_error: null,
    requests: [],
    care_tasks: [],
    task_logs: [],
    care_checkins: [],
    care_requests: [],
    pet_cautions: [],
    care_change_requests: [],
    responses: [],
    proposals: [],
    stayChecks: [],
    meetGreetCalls: [],
    createPetCalls: [],
    completions: [],
    trips: [],
    taskCompletions: [],
    saves: [],
    booking_consents: [],
    owner_home_access: [],
    payments: [],
    agreements: [],
    notifications: [],
    feed_posts: [],
    media: [],
    daily_reports: [],
    reviews: [],
    sitter_owner_notes: [],
    owner_favorite_sitters: [],
    pet_life_records: [],
    pet_medals: [],
    sitter_rates: [],
    safety_checks: [],
    photo_requests: [],
    pet_stickers: [],
    report_decor: [],
    diary_page_hidden: [],
    quote_error: null,
    quote_error_detail: null,
    quote: null,
  };
}

/** Fixed quote shape matching Goal boarding 2 pets + Thanksgiving (3C.1 / Checkout). */
export const DEMO_QUOTE = {
  service: "boarding",
  nights: 3,
  days: 3,
  unit_price: 55,
  base: 165,
  extra_pets: 82.5,
  holiday_days: [{ day: "2026-10-12", name: "Thanksgiving" }],
  holiday_surcharge: 20.63,
  total: 268.13,
  currency: "CAD",
  rate_version: "e2e",
};

function requiredKinds(db: MockDb, bookingId: string): string[] {
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) return [];
  const kinds = ["emergency_vet", "safe_return"];
  if (booking.service_type === "boarding") kinds.push("handoff_rules", "cohabitation");
  const ownerHome = db.booking_handoffs.some(
    (h) =>
      h.booking_id === bookingId &&
      h.location_type === "owner_home" &&
      (h.status === "proposed" || h.status === "agreed"),
  );
  if (booking.service_type === "house_sitting" || ownerHome) kinds.push("home_access");
  return kinds;
}

const SLOT_NAMES = ["morning", "afternoon", "overnight"];

function* daysBetween(from: string, to: string) {
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

function coversDay(row: Row, day: string): boolean {
  return String(row.start_date) <= day && day <= String(row.end_date);
}

/** Confirmed pets in a sitter's day × slot. */
function usedSpots(db: MockDb, sitterId: string, day: string, slot: string): string[] {
  const confirmed = new Set(
    db.bookings.filter((b) => b.sitter_id === sitterId && b.status === "confirmed").map((b) => String(b.id)),
  );
  return db.booking_slots
    .filter((s) => confirmed.has(String(s.booking_id)) && s.day === day && s.slot === slot)
    .map((s) => String(s.booking_id));
}

/**
 * get_sitter_schedule (003 · 014d · 014e): open by default with the weekday's or the profile's hours and spots; an open row overrides them,
 * any blocked row closes the slot, a weekly closing rule closes it too — unless a stay is already booked there, which
 * then reads full (capacity = what is booked).
 */
function sitterSchedule(db: MockDb, sitterId: string, from: string, to: string): Row[] {
  const rows = db.sitter_availability.filter((r) => r.sitter_id === sitterId);
  const rules = db.sitter_closing_rules.filter((r) => r.sitter_id === sitterId);
  const weekdayHours = db.sitter_weekday_hours.filter((r) => r.sitter_id === sitterId);
  const profile = db.sitter_profiles.find((p) => p.id === sitterId);
  const defaultHours = (profile?.default_hours ?? {}) as Record<string, string[]>;
  const defaultSpots = Number(profile?.default_max_pets ?? 2);
  const fallback: Record<string, string[]> = {
    morning: ["08:00", "12:00"],
    afternoon: ["12:00", "18:00"],
    overnight: ["18:00", "08:00"],
  };
  const out: Row[] = [];
  for (const day of daysBetween(from, to)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    for (const slot of SLOT_NAMES) {
      const here = rows.filter((r) => r.slot === slot && coversDay(r, day));
      const blocked = here.some((r) => r.kind === "blocked");
      const open = here
        .filter((r) => r.kind === "open")
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      const used = usedSpots(db, sitterId, day, slot).length;
      const byRule = rules.some((r) => r.slot === slot && Number(r.weekday) === weekday);
      const own = weekdayHours.find((r) => r.slot === slot && Number(r.weekday) === weekday);
      const hours = open
        ? [String(open.starts_at), String(open.ends_at)]
        : own
          ? [String(own.starts_at), String(own.ends_at)]
          : (defaultHours[slot] ?? fallback[slot]);
      const capacity = byRule ? used : open ? Number(open.max_pets) : defaultSpots;
      const remaining = Math.max(capacity - used, 0);
      const shut = blocked || (byRule && used === 0);
      out.push({
        day,
        slot,
        starts_at: `${hours[0]}:00`,
        ends_at: `${hours[1]}:00`,
        state: blocked ? "blocked" : shut ? "closed" : remaining === 0 ? "full" : "open",
        remaining: shut ? 0 : remaining,
      });
    }
  }
  return out;
}

/** guard_availability_change (003), blocks only: a block over a confirmed booking is refused. */
function blockConflicts(db: MockDb, inserted: Row[]): string[] {
  const ids = new Set<string>();
  for (const row of inserted.filter((r) => r.kind === "blocked")) {
    for (const day of daysBetween(String(row.start_date), String(row.end_date))) {
      for (const id of usedSpots(db, String(row.sitter_id), day, String(row.slot))) ids.add(id);
    }
  }
  return [...ids];
}

/** Role rows the signup trigger would have created (phase-02 handle_new_user). */
function ensureRoleRows(users: MockUser[], db: MockDb) {
  for (const user of users) {
    const table = user.role === "owner" ? db.owner_profiles : db.sitter_profiles;
    if (!table.some((row) => row.id === user.id)) {
      table.push(emptyRow(user.id, user.role === "owner" ? OWNER_PROFILE_FIELDS : SITTER_PROFILE_FIELDS));
    }
  }
}

function callerId(authorization: string | undefined): string | null {
  const token = (authorization ?? "").replace(/^Bearer /, "");
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

/** Meet & Greet RPCs (005): the same state machine, minus notifications. */
function handleMeetGreet(route: Route, fn: string, args: Row, me: string | null, db: MockDb) {
  db.meetGreetCalls.push({ fn, ...args });
  const fail = (message: string) => json(route, 400, { code: "P0001", message, details: null });
  const b = db.bookings.find((x) => x.id === args.p_booking);
  if (!b || ![b.owner_id, b.sitter_id].includes(me)) return fail("not_allowed");

  if (fn === "get_meet_greet_options") {
    return json(route, 200, {
      owner_name: "Robert",
      owner_spots: db.owner_profiles.find((p) => p.id === b.owner_id)?.meet_spots ?? [],
      sitter_name: "Chloe",
      sitter_spots: db.sitter_profiles.find((p) => p.id === b.sitter_id)?.meet_spots ?? [],
    });
  }
  if (b.status !== "requested") return fail("invalid_status");
  const status = String(b.meet_greet_status ?? "not_needed");
  const done = () => route.fulfill({ status: 204 });

  switch (fn) {
    case "propose_meet_greet": {
      if (!["required", "proposed", "agreed"].includes(status)) return fail("invalid_status");
      if (status === "required" && !b.sitter_interest_at) return fail("interest_required"); // 011l guard
      if (args.p_mode === "in_person" && !String(args.p_place ?? "").trim()) return fail("place_required");
      if (Date.parse(String(args.p_at)) <= nowMs()) return fail("invalid_window");
      Object.assign(b, {
        meet_greet_status: "proposed",
        meet_greet_mode: args.p_mode,
        meet_greet_at: args.p_at,
        meet_greet_place: args.p_mode === "in_person" ? args.p_place : null,
        meet_greet_link: null,
        meet_greet_proposed_by: me,
        meet_greet_skip_requested_by: null,
      });
      return done();
    }
    case "respond_meet_greet": {
      if (status !== "proposed") return fail("invalid_status");
      if (b.meet_greet_proposed_by === me) return fail("not_allowed");
      if (args.p_accept) b.meet_greet_status = "agreed";
      else
        Object.assign(b, {
          meet_greet_status: "required",
          meet_greet_mode: null,
          meet_greet_at: null,
          meet_greet_place: null,
          meet_greet_proposed_by: null,
        });
      return done();
    }
    case "complete_meet_greet": {
      // 014s: any time after it is agreed, and a second press is a no-op.
      if (status === "done") return done();
      if (status !== "agreed") return fail("invalid_status");
      b.meet_greet_status = "done";
      return done();
    }
    case "request_skip_meet_greet": {
      if (!["required", "proposed", "agreed"].includes(status)) return fail("invalid_status");
      Object.assign(b, { meet_greet_status: "skip_requested", meet_greet_skip_requested_by: me });
      return done();
    }
    case "respond_skip_meet_greet": {
      if (status !== "skip_requested") return fail("invalid_status");
      if (b.meet_greet_skip_requested_by === me) return fail("not_allowed");
      if (args.p_accept) b.meet_greet_status = "skipped";
      else Object.assign(b, { status: "cancelled", cancel_reason: "meet_greet_declined", cancelled_by: me });
      return done();
    }
  }
  return fail("not_mocked");
}

/** `col=eq.value`, `col=lte.value`, `col=gte.value` and `col=in.(a,b)` filters. */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(key)) continue;
    if (raw.startsWith("eq.")) {
      if (String(row[key]) !== raw.slice(3)) return false;
    } else if (raw.startsWith("lte.")) {
      if (!(String(row[key]) <= raw.slice(4))) return false;
    } else if (raw.startsWith("gte.")) {
      if (!(String(row[key]) >= raw.slice(4))) return false;
    } else if (raw.startsWith("lt.")) {
      if (!(String(row[key]) < raw.slice(3))) return false;
    } else if (raw.startsWith("in.(")) {
      const values = raw.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, ""));
      if (!values.includes(String(row[key]))) return false;
    } else if (raw === "is.null") {
      if (row[key] != null) return false;
    } else if (raw === "not.is.null") {
      if (row[key] == null) return false;
    }
  }
  return true;
}

/** start_trip / update_trip_position / end_trip (012): the same rules as the SQL, in the order it checks them. */
function handleTrip(route: Route, name: string, args: Record<string, unknown>, me: string | null, db: MockDb) {
  const fail = (message: string) => json(route, 400, { code: "P0001", message, details: null });
  const iso = () => new Date(nowMs()).toISOString();
  const eta = (m: number) => new Date(nowMs() + ((m * 1.3) / (30000 / 3600)) * 1000).toISOString();

  if (name === "start_trip") {
    const booking = db.bookings.find((b) => b.id === args.p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking) return fail("not_allowed");
    if (booking.status !== "confirmed") return fail("invalid_status");
    if (!booking.paid_at) return fail("not_paid");
    const handoff = db.booking_handoffs.find((h) => h.booking_id === booking.id && h.kind === args.p_kind && h.status === "agreed");
    if (!handoff) return fail("handoff_missing");
    if (handoff.completed_at) return fail("handoff_completed");
    if (args.p_kind === "pick_up" && !db.booking_handoffs.find((h) => h.booking_id === booking.id && h.kind === "drop_off" && h.status === "agreed")?.completed_at) {
      return fail("drop_off_not_completed");
    }
    if (nowMs() < Date.parse(String(handoff.scheduled_at)) - 2 * 3_600_000) return fail("trip_too_early");
    if ((handoff.location_type === "sitter_home" && me !== booking.owner_id) || (handoff.location_type === "owner_home" && me !== booking.sitter_id)) {
      return fail("not_traveler");
    }
    if (db.trips.some((t) => t.booking_id === booking.id && t.handoff_kind === args.p_kind && ["en_route", "arrived"].includes(String(t.status)))) {
      return fail("trip_active");
    }
    const home =
      handoff.location_type === "sitter_home"
        ? db.sitter_profiles.find((p) => p.id === booking.sitter_id)
        : handoff.location_type === "owner_home"
          ? db.owner_profiles.find((p) => p.id === booking.owner_id)
          : undefined;
    const dest = home?.home_lat != null ? { lat: Number(home.home_lat), lng: Number(home.home_lng) } : null;
    const share = args.p_share !== false;
    const first = share && args.p_lat != null ? { lat: Number(args.p_lat), lng: Number(args.p_lng) } : null;
    const distance = first && dest ? distanceMeters(first, dest) : null;
    const trip: Row = {
      id: crypto.randomUUID(),
      booking_id: booking.id,
      handoff_kind: args.p_kind,
      traveler_id: me,
      status: "en_route",
      dest_lat: dest?.lat ?? null,
      dest_lng: dest?.lng ?? null,
      last_lat: first?.lat ?? null,
      last_lng: first?.lng ?? null,
      last_at: first ? iso() : null,
      eta_at: distance != null ? eta(distance) : null,
      distance_m: distance != null ? Math.round(distance) : null,
      simulated: !!args.p_simulated,
      sharing: share,
      started_at: iso(),
      arrived_at: null,
      ended_at: null,
    };
    db.trips.push(trip);
    return json(route, 200, trip);
  }

  const trip = db.trips.find((t) => t.id === args.p_trip);
  if (!trip || trip.traveler_id !== me) return fail("not_allowed");

  if (name === "update_trip_position") {
    if (!["en_route", "arrived"].includes(String(trip.status))) return fail("trip_not_active");
    if (trip.sharing === false) return fail("not_sharing");
    if (trip.status === "arrived" || (trip.last_at && nowMs() - Date.parse(String(trip.last_at)) < 1000)) return json(route, 200, trip);
    const at = { lat: Number(args.p_lat), lng: Number(args.p_lng) };
    const distance = trip.dest_lat != null ? distanceMeters(at, { lat: Number(trip.dest_lat), lng: Number(trip.dest_lng) }) : null;
    Object.assign(trip, {
      last_lat: at.lat,
      last_lng: at.lng,
      last_at: iso(),
      distance_m: distance != null ? Math.round(distance) : null,
      eta_at: distance != null ? eta(distance) : null,
    });
    if (distance != null && distance <= 150) Object.assign(trip, { status: "arrived", arrived_at: iso() });
    return json(route, 200, trip);
  }

  // end_trip
  if (!["completed", "cancelled"].includes(String(trip.status))) {
    Object.assign(trip, {
      status: args.p_cancel ? "cancelled" : "completed",
      last_lat: null,
      last_lng: null,
      last_at: null,
      eta_at: null,
      distance_m: null,
      ended_at: iso(),
    });
  }
  return json(route, 200, trip);
}

/** Same as the SQL `pet_has_open_stay`. */
function hasOpenStay(db: MockDb, petId: unknown): boolean {
  return db.bookings.some(
    (b) =>
      b.status === "confirmed" &&
      db.booking_pets.some((bp) => bp.booking_id === b.id && bp.pet_id === petId) &&
      !db.booking_handoffs.some((h) => h.booking_id === b.id && h.kind === "pick_up" && h.completed_at),
  );
}

/** Same as the SQL `apply_care_change_request`: the tasks (minus the ones the owner does) and the Heads-ups. */
function applyChangeRequest(db: MockDb, req: Row) {
  const skip = (req.counter_owner_tasks as number[] | undefined) ?? [];
  (req.tasks as Record<string, string | boolean | null>[]).forEach((t, i) => {
    if (skip.includes(i)) return;
    db.care_tasks.push({
      id: crypto.randomUUID(),
      pet_id: req.pet_id,
      type: t.type,
      title: t.title,
      dose: t.dose ?? null,
      scheduled_time: `${t.time}:00`,
      notes: t.notes ?? null,
      repeat_daily: t.repeat ?? true,
      active: true,
      created_at: new Date(nowMs()).toISOString(),
    });
  });
  for (const text of req.cautions as string[]) {
    db.pet_cautions.push({ id: crypto.randomUUID(), pet_id: req.pet_id, text, active: true });
  }
}

function respond(route: Route, rows: Row[], wantsObject: boolean, status = 200, count?: number) {
  if (wantsObject) {
    if (rows.length !== 1) {
      return json(route, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    }
    return json(route, status, rows[0]);
  }
  const headers: Record<string, string> = {};
  if (count != null) {
    headers["content-range"] =
      count === 0 ? "*/0" : `0-${Math.max(rows.length - 1, 0)}/${count}`;
  }
  return route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(rows),
  });
}

/** Chat RPCs (014j): the same rules, in memory. Message times step by one ms so their order is stable. */
function handleChat(route: Route, fn: string, users: MockUser[], db: MockDb, me: string | null) {
  const args = route.request().postDataJSON() ?? {};
  const fail = (message: string) => json(route, 400, { code: "P0001", message, details: null });
  const meUser = users.find((u) => u.id === me);
  if (!meUser || !me) return fail("not_authenticated");
  const stamp = () => new Date(nowMs() + db.chat_messages.length).toISOString();
  const post = (thread: Row, sender: string, kind: string, body: string | null, card: unknown) => {
    const row = { id: crypto.randomUUID(), thread_id: thread.id, sender_id: sender, kind, body, card, created_at: stamp() };
    db.chat_messages.push(row);
    thread[sender === thread.owner_id ? "owner_read_at" : "sitter_read_at"] = row.created_at;
    return row;
  };
  const mine = (t: Row) => t.owner_id === me || t.sitter_id === me;
  const side = (t: Row) => (t.owner_id === me ? "owner" : "sitter");
  const nameOf = (id: unknown) => users.find((u) => u.id === id)?.displayName ?? "";
  const threadOf = (id: unknown) => db.chat_threads.find((t) => t.id === id && mine(t));
  const messagesOf = (t: Row) => db.chat_messages.filter((m) => m.thread_id === t.id);

  if (fn === "open_chat_thread") {
    const other = users.find((u) => u.id === args.p_other);
    if (!other || other.id === me) return fail("forbidden");
    let owner: string;
    let sitter: string;
    if (meUser.role === "owner") {
      if (other.role !== "sitter") return fail("forbidden");
      owner = me;
      sitter = other.id;
    } else {
      owner = other.id;
      sitter = me;
      if (!db.chat_threads.some((t) => t.owner_id === owner && t.sitter_id === sitter)) return fail("forbidden");
    }
    let thread = db.chat_threads.find((t) => t.owner_id === owner && t.sitter_id === sitter);
    if (!thread) {
      thread = { id: crypto.randomUUID(), owner_id: owner, sitter_id: sitter, owner_read_at: null, sitter_read_at: null, owner_left_at: null, sitter_left_at: null };
      db.chat_threads.push(thread);
    }
    thread[`${side(thread)}_left_at`] = null;
    if (meUser.role === "owner" && args.p_drop_off_at) {
      const pets = (args.p_pet_ids as string[]).map((id) => db.pets.find((p) => p.id === id)).filter(Boolean) as Row[];
      if (!args.p_pick_up_at || Date.parse(args.p_pick_up_at) <= Date.parse(args.p_drop_off_at) || pets.length === 0) return fail("invalid_stay");
      const card = {
        type: "stay",
        drop_off_at: args.p_drop_off_at,
        pick_up_at: args.p_pick_up_at,
        pets: pets.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
      };
      const end = messagesOf(thread).at(-1);
      if (end && end.kind === "card" && (end.card as Row).type === "stay" && end.sender_id === me) {
        // 014l: nothing was said after my last stay card, so it becomes the new stay.
        end.card = card;
      } else {
        const last = messagesOf(thread).filter((m) => m.kind === "card" && (m.card as Row).type === "stay").at(-1);
        if (JSON.stringify(last?.card) !== JSON.stringify(card)) post(thread, me, "card", null, card);
      }
    }
    return json(route, 200, thread);
  }

  if (fn === "send_chat_message") {
    const thread = threadOf(args.p_thread);
    if (!thread) return fail("forbidden");
    const body = String(args.p_body ?? "").trim();
    if (!body) return fail("body_required");
    if (body.length > 2000) return fail("body_too_long");
    return json(route, 200, post(thread, me, "text", body, null));
  }

  if (fn === "mark_chat_read") {
    const thread = threadOf(args.p_thread);
    if (!thread) return fail("forbidden");
    thread[`${side(thread)}_read_at`] = messagesOf(thread).at(-1)?.created_at ?? null;
    return route.fulfill({ status: 204 });
  }

  if (fn === "leave_chat") {
    const thread = threadOf(args.p_thread);
    if (!thread) return fail("forbidden");
    thread[`${side(thread)}_left_at`] = messagesOf(thread).at(-1)?.created_at ?? new Date(nowMs()).toISOString();
    return route.fulfill({ status: 204 });
  }

  if (fn === "post_booking_request_card") {
    const thread = db.chat_threads.find((t) => t.id === args.p_thread && t.owner_id === me);
    const booking = db.bookings.find((b) => b.id === args.p_booking);
    if (!thread || !booking || booking.owner_id !== me || booking.sitter_id !== thread.sitter_id) return fail("forbidden");
    const existing = messagesOf(thread).find((m) => m.kind === "card" && (m.card as Row).type === "request" && (m.card as Row).booking_id === booking.id);
    if (existing) return json(route, 200, existing);
    const handoff = (kind: string) => db.booking_handoffs.find((h) => h.booking_id === booking.id && h.kind === kind);
    const place = (kind: string) => ({ type: handoff(kind)?.location_type, note: handoff(kind)?.location_note ?? null });
    const petRows = db.booking_pets
      .filter((bp) => bp.booking_id === booking.id)
      .map((bp) => db.pets.find((p) => p.id === bp.pet_id))
      .filter(Boolean) as Row[];
    const card = {
      type: "request",
      booking_id: booking.id,
      service_type: booking.service_type,
      note: booking.owner_note ?? null,
      drop_off_at: handoff("drop_off")?.scheduled_at,
      drop_off_place: place("drop_off"),
      pick_up_at: handoff("pick_up")?.scheduled_at,
      pick_up_place: place("pick_up"),
      pets: petRows.map((p) => ({ id: p.id, name: p.name })),
    };
    return json(route, 200, post(thread, me, "card", null, card));
  }

  // 014n quotes: the card holds the negotiation; totals are recomputed here as in SQL.
  const quoteMessage = (role: "owner" | "sitter") => {
    const row = db.chat_messages.find((m) => m.id === args.p_message && (m.card as Row | null)?.type === "quote");
    const thread = row && db.chat_threads.find((t) => t.id === row.thread_id);
    if (!row || !thread || thread[`${role}_id`] !== me) return { error: "forbidden" } as const;
    if ((row.card as Row).status !== "sent") return { error: "quote_closed" } as const;
    return { row, card: row.card as Row & { extras: Row[] } } as const;
  };
  const retotal = (card: Row & { extras: Row[] }) => {
    const accepted = card.extras.filter((e) => e.status === "accepted").reduce((sum, e) => sum + Number(e.amount), 0);
    card.total = Math.round((Number((card.quote as Row).total) + accepted) * 100) / 100;
  };

  if (fn === "send_chat_quote") {
    const thread = db.chat_threads.find((t) => t.id === args.p_thread && t.sitter_id === me);
    if (!thread) return fail("forbidden");
    const petIds = (args.p_pet_ids ?? []) as string[];
    if (petIds.length < 1 || !petIds.every((id) => db.pets.some((p) => p.id === id && p.owner_id === thread.owner_id))) return fail("invalid_stay");
    if (db.quote_error) return json(route, 400, { code: "P0001", message: db.quote_error, details: db.quote_error_detail });
    for (const m of messagesOf(thread)) {
      const c = m.card as Row | null;
      if (c?.type === "quote" && c.status === "sent") c.status = "replaced";
    }
    const quote = (db.quote ?? DEMO_QUOTE) as Row;
    const card = {
      type: "quote",
      service_type: args.p_service,
      drop_off_at: args.p_drop_off_at,
      pick_up_at: args.p_pick_up_at,
      pets: petIds.map((id) => ({ id, name: db.pets.find((p) => p.id === id)?.name })),
      quote,
      extras: [],
      total: Number(quote.total),
      status: "sent",
    };
    return json(route, 200, post(thread, me, "card", null, card));
  }

  if (fn === "add_chat_quote_extra") {
    const found = quoteMessage("sitter");
    if ("error" in found) return fail(found.error);
    const label = String(args.p_label ?? "").trim();
    const amount = Number(args.p_amount);
    if (!label || label.length > 40 || !(amount > 0) || amount > 500) return fail("invalid_extra");
    if (found.card.extras.length >= 5) return fail("too_many_extras");
    found.card.extras.push({ id: crypto.randomUUID(), label, amount: Math.round(amount * 100) / 100, status: "offered" });
    retotal(found.card);
    return json(route, 200, found.row);
  }

  if (fn === "answer_chat_quote_extra") {
    const found = quoteMessage("owner");
    if ("error" in found) return fail(found.error);
    const extra = found.card.extras.find((e) => e.id === args.p_extra && e.status === "offered");
    if (!extra) return fail("invalid_extra");
    extra.status = args.p_accept ? "accepted" : "declined";
    retotal(found.card);
    return json(route, 200, found.row);
  }

  if (fn === "confirm_chat_quote") {
    const found = quoteMessage("owner");
    if ("error" in found) return fail(found.error);
    if (found.card.extras.some((e) => e.status === "offered")) return fail("extras_pending");
    found.card.status = "confirmed";
    return json(route, 200, found.row);
  }

  if (fn === "get_chat_thread") {
    const thread = threadOf(args.p_thread);
    if (!thread) return json(route, 200, []);
    const other = thread.owner_id === me ? thread.sitter_id : thread.owner_id;
    return json(route, 200, [
      { thread_id: thread.id, owner_id: thread.owner_id, sitter_id: thread.sitter_id, other_id: other, other_name: nameOf(other), my_role: side(thread) },
    ]);
  }

  // list_my_chats
  const rows = db.chat_threads
    .filter(mine)
    .flatMap((t) => {
      const all = messagesOf(t);
      const last = all.at(-1);
      const left = t[`${side(t)}_left_at`] as string | null;
      if (!last || (left && String(last.created_at) <= left)) return [];
      const read = t[`${side(t)}_read_at`] as string | null;
      const other = t.owner_id === me ? t.sitter_id : t.owner_id;
      return [
        {
          thread_id: t.id,
          other_id: other,
          other_name: nameOf(other),
          last_kind: last.kind,
          last_body: last.body,
          last_card_type: last.kind === "card" ? (last.card as Row).type : null,
          last_at: last.created_at,
          unread_count: all.filter((m) => m.sender_id !== me && (!read || String(m.created_at) > read)).length,
        },
      ];
    })
    .sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));
  return json(route, 200, rows);
}

/** The booking's current handoff, as current_handoff (003). */
function currentHandoffRow(db: MockDb, b: Row, kind: string): Row | undefined {
  const rows = db.booking_handoffs.filter((h) => h.booking_id === b.id && h.kind === kind);
  return (
    (b.status === "requested" ? rows.find((h) => h.status === "proposed") : undefined) ?? rows.find((h) => h.status === "agreed")
  );
}

/** booking_extra_fees (014o): the accepted fees of the pair's newest CONFIRMED chat quote for this very stay. */
function acceptedFees(db: MockDb, b: Row): { label: string; amount: number }[] {
  const thread = db.chat_threads.find((t) => t.owner_id === b.owner_id && t.sitter_id === b.sitter_id);
  const drop = currentHandoffRow(db, b, "drop_off");
  const pick = currentHandoffRow(db, b, "pick_up");
  if (!thread || !drop || !pick) return [];
  const pets = db.booking_pets.filter((bp) => bp.booking_id === b.id).map((bp) => String(bp.pet_id)).sort().join(",");
  const card = db.chat_messages
    .filter((m) => m.thread_id === thread.id && (m.card as Row | null)?.type === "quote")
    .map((m) => ({ at: String(m.created_at), card: m.card as Row & { extras: Row[]; pets: Row[] } }))
    .filter(
      ({ card: c }) =>
        c.status === "confirmed" &&
        c.service_type === b.service_type &&
        Date.parse(String(c.drop_off_at)) === Date.parse(String(drop.scheduled_at)) &&
        Date.parse(String(c.pick_up_at)) === Date.parse(String(pick.scheduled_at)) &&
        c.pets.map((p) => String(p.id)).sort().join(",") === pets,
    )
    .sort((x, y) => y.at.localeCompare(x.at))[0]?.card;
  return (card?.extras ?? []).filter((e) => e.status === "accepted").map((e) => ({ label: String(e.label), amount: Number(e.amount) }));
}

/** price_with_fees (014o). */
function priceWithFees(db: MockDb, b: Row, quote: Row): Row {
  const extras = acceptedFees(db, b);
  const sum = extras.reduce((total, e) => total + e.amount, 0);
  return { ...quote, extras, extras_total: sum, subtotal: quote.total, total: Math.round((Number(quote.total) + sum) * 100) / 100 };
}

/** The agreed state of a request: the Meet & Greet is over (or never was) and both said yes, in any order (014o). */
function confirmBooking(db: MockDb, b: Row, by: string, users: MockUser[]) {
  const open = db.booking_handoffs.filter((h) => h.booking_id === b.id && h.status === "proposed");
  b.status = "confirmed";
  b.responded_at = new Date(nowMs()).toISOString();
  for (const h of open) h.status = "agreed";
  const name = users.find((u) => u.id === by)?.displayName;
  db.notifications.push({
    id: crypto.randomUUID(),
    user_id: by === b.sitter_id ? b.owner_id : b.sitter_id,
    type: "booking_confirmed",
    title: by === b.sitter_id ? `${name} confirmed your booking` : `${name} agreed to book`,
    body: null,
    pet_id: null,
    booking_id: b.id,
    ref_id: b.id,
    read_at: null,
    created_at: new Date(nowMs()).toISOString(),
  });
}

/**
 * The 014o trigger: when a booking changes, its Meet & Greet, agreement and payment cards appear in the pair's chat
 * (once each, holding only the booking id) and every existing one is touched (`rev`). A booking is first seen as it
 * is (nothing changed yet), like a row that existed before the trigger.
 */
function syncBookingCards(db: MockDb) {
  for (const b of db.bookings) {
    const sig = JSON.stringify([
      b.status, b.sitter_interest_at, b.meet_greet_status, b.meet_greet_mode, b.meet_greet_at, b.meet_greet_place,
      b.meet_greet_link, b.owner_agreed_at, b.sitter_accepted_at, b.paid_at,
    ]);
    const before = db.cardSigs[String(b.id)];
    db.cardSigs[String(b.id)] = sig;
    if (before === undefined || before === sig) continue;
    const thread = db.chat_threads.find((t) => t.owner_id === b.owner_id && t.sitter_id === b.sitter_id);
    if (!thread) continue;
    const mg = String(b.meet_greet_status ?? "not_needed");
    const wanted = [
      b.sitter_interest_at && mg !== "not_needed" ? "meet_greet" : null,
      ["requested", "confirmed"].includes(String(b.status)) && ["not_needed", "done", "skipped"].includes(mg) ? "agreement" : null,
      b.status === "confirmed" ? "payment" : null,
    ].filter((x): x is string => !!x);
    const sender = db.lastActor && [b.owner_id, b.sitter_id].includes(db.lastActor) ? db.lastActor : null;
    for (const type of wanted) {
      const has = db.chat_messages.some((m) => m.thread_id === thread.id && (m.card as Row | null)?.type === type && (m.card as Row).booking_id === b.id);
      if (!has) {
        db.chat_messages.push({
          id: crypto.randomUUID(),
          thread_id: thread.id,
          sender_id: sender,
          kind: "card",
          body: null,
          card: { type, booking_id: b.id, rev: 0 },
          created_at: new Date(nowMs() + db.chat_messages.length).toISOString(),
        });
      }
    }
    for (const m of db.chat_messages) {
      const c = m.card as Row | null;
      if (m.thread_id === thread.id && c && ["meet_greet", "agreement", "payment"].includes(String(c.type)) && c.booking_id === b.id) {
        c.rev = Number(c.rev ?? 0) + 1;
      }
    }
  }
}

async function handleRest(route: Route, users: MockUser[], db: MockDb) {
  ensureRoleRows(users, db);
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.split("/rest/v1/")[1] ?? "";
  const params = url.searchParams;
  const method = request.method();
  const headers = request.headers();
  const wantsObject = (headers.accept ?? "").includes("vnd.pgrst.object");
  const wantsRows = (headers.prefer ?? "").includes("return=representation");
  const me = callerId(headers.authorization);
  // The trigger of the previous call has run by now; this call's actor is the sender of what it causes.
  syncBookingCards(db);
  if (path.startsWith("rpc/") && me) db.lastActor = me;

  if (path.startsWith("rpc/") && /^rpc\/(open_chat_thread|send_chat_message|mark_chat_read|leave_chat|list_my_chats|get_chat_thread|post_booking_request_card|send_chat_quote|add_chat_quote_extra|answer_chat_quote_extra|confirm_chat_quote)$/.test(path)) {
    return handleChat(route, path.slice(4), users, db, me);
  }

  if (path === "rpc/get_my_sitter_profile") {
    return respond(route, db.sitter_profiles.filter((row) => row.id === me), wantsObject);
  }

  if (path === "rpc/get_sitter_schedule") {
    const { p_sitter, p_from, p_to } = request.postDataJSON();
    return json(route, 200, sitterSchedule(db, p_sitter, p_from, p_to));
  }

  if (path === "rpc/save_closing_rules") {
    const { p_rules } = request.postDataJSON();
    if (!Array.isArray(p_rules)) return fail("invalid_rules");
    const kept = db.sitter_closing_rules.filter((r) => r.sitter_id !== me);
    const added = (p_rules as Row[]).map((r) => ({ sitter_id: me, weekday: r.weekday, slot: r.slot }));
    db.sitter_closing_rules.splice(0, db.sitter_closing_rules.length, ...kept, ...added);
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/reorder_profile_photos") {
    const { p_ids } = request.postDataJSON();
    const mine = db.profile_photos.filter((r) => r.profile_id === me);
    const same = Array.isArray(p_ids) && p_ids.length === mine.length && p_ids.every((id: string) => mine.some((r) => r.id === id));
    if (!same) return fail("invalid_photos");
    const others = db.profile_photos.filter((r) => r.profile_id !== me);
    const ordered = (p_ids as string[]).map((id) => mine.find((r) => r.id === id)!);
    db.profile_photos.splice(0, db.profile_photos.length, ...others, ...ordered);
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/save_sitter_answers") {
    const { p_answers, p_intro, p_finish } = request.postDataJSON();
    if (!Array.isArray(p_answers)) return fail("invalid_answers");
    const kept = db.sitter_profile_answers.filter((r) => r.sitter_id !== me);
    const added = (p_answers as Row[]).map((r, position) => ({
      sitter_id: me,
      question_key: r.key,
      question_text: r.question ?? null,
      answer: r.answer ?? null,
      choice: r.choice ?? null,
      position,
    }));
    db.sitter_profile_answers.splice(0, db.sitter_profile_answers.length, ...kept, ...added);
    const profile = db.sitter_profiles.find((p) => p.id === me);
    if (profile) {
      if (typeof p_intro === "string") profile.bio = p_intro.trim() || null;
      if (p_finish) profile.onboarded_at = profile.onboarded_at ?? new Date(nowMs()).toISOString();
    }
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/create_pet_with_profile") {
    const a = request.postDataJSON();
    if (!me || !a.p_id || !String(a.p_name ?? "").trim()) return fail("invalid_pet");
    db.createPetCalls.push(a);
    const row = {
      id: a.p_id,
      owner_id: me,
      species: a.p_species,
      name: a.p_name,
      breed: a.p_breed,
      birthdate: a.p_birthdate,
      weight_kg: a.p_weight_kg,
      notes: a.p_notes,
      profile: a.p_profile ?? {},
      created_at: new Date(nowMs()).toISOString(),
    };
    const at = db.pets.findIndex((p) => p.id === a.p_id);
    if (at >= 0) db.pets[at] = { ...db.pets[at], ...row };
    else db.pets.push(row);
    db.pet_allergies.splice(0, db.pet_allergies.length, ...db.pet_allergies.filter((x) => x.pet_id !== a.p_id));
    for (const allergen of a.p_allergens ?? []) db.pet_allergies.push({ id: `al-${a.p_id}-${allergen}`, pet_id: a.p_id, allergen });
    return json(route, 200, a.p_id);
  }

  if (path === "rpc/save_weekday_hours") {
    const { p_hours } = request.postDataJSON();
    if (!Array.isArray(p_hours)) return fail("invalid_hours");
    const kept = db.sitter_weekday_hours.filter((r) => r.sitter_id !== me);
    const added = (p_hours as Row[]).map((r) => ({ sitter_id: me, weekday: r.weekday, slot: r.slot, starts_at: r.starts_at, ends_at: r.ends_at }));
    db.sitter_weekday_hours.splice(0, db.sitter_weekday_hours.length, ...kept, ...added);
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/list_my_sitters") {
    // Sitters with a confirmed booking (or one confirmed and later cancelled) — 003/004.
    const counted = db.bookings.filter(
      (b) => b.owner_id === me && (b.status === "confirmed" || (b.status === "cancelled" && b.responded_at)),
    );
    const sitterIds = [...new Set(counted.map((b) => String(b.sitter_id)))];
    return json(
      route,
      200,
      sitterIds.map((id) => {
        const details = db.sitter_profiles.find((p) => p.id === id) ?? {};
        const mine = counted.filter((b) => b.sitter_id === id);
        return {
          sitter_id: id,
          display_name: users.find((u) => u.id === id)?.displayName ?? null,
          bio: details.bio ?? null,
          service_area: details.service_area ?? null,
          experience_years: details.experience_years ?? null,
          services: details.services ?? ["boarding"],
          booking_count: mine.length,
          last_booking_at: mine.map((b) => String(b.created_at ?? "")).sort().pop() ?? null,
        };
      }),
    );
  }

  if (path === "rpc/search_sitters_nearby") {
    const args = request.postDataJSON();
    db.nearbySearches.push(args);
    if (db.nearby_error) return json(route, 400, { message: db.nearby_error });
    const radius = Number(args.p_radius_km);
    if (!(radius >= 1 && radius <= 100)) return json(route, 400, { message: "invalid_radius" });
    if (args.p_lat == null) {
      const home = db.owner_profiles.find((p) => p.id === me);
      if (home?.home_lat == null) return json(route, 400, { message: "no_home_point" });
    }
    return json(
      route,
      200,
      db.nearby_sitters
        .filter((row) => Number(row.distance_km) <= radius)
        .sort((a, b) => Number(a.distance_km) - Number(b.distance_km))
        .map((row) => ({ ...row, distance_km: Math.max(1, Math.round(Number(row.distance_km))) })),
    );
  }

  if (path === "rpc/search_sitters") {
    db.searches.push(request.postDataJSON());
    return json(route, 200, db.search_results);
  }

  if (path === "rpc/request_booking") {
    // request_booking (004): booking + two proposed handoffs + pets. Errors can be forced
    // by setting `request_error` on the sitter's search row.
    const args = request.postDataJSON();
    db.requests.push(args);
    const forced = db.search_results.find((r) => r.sitter_id === args.p_sitter)?.request_error;
    if (forced) return json(route, 400, { code: "P0001", message: forced, details: null });
    const id = crypto.randomUUID();
    const created = new Date(nowMs()).toISOString();
    db.bookings.push({
      id,
      owner_id: me,
      sitter_id: args.p_sitter,
      status: "requested",
      service_type: args.p_service_type ?? "boarding",
      owner_note: args.p_note ?? null,
      created_at: created,
    });
    for (const [kind, at, type, note] of [
      ["drop_off", args.p_drop_off_at, args.p_drop_off_location_type, args.p_drop_off_note],
      ["pick_up", args.p_pick_up_at, args.p_pick_up_location_type, args.p_pick_up_note],
    ]) {
      db.booking_handoffs.push({
        id: crypto.randomUUID(),
        booking_id: id,
        kind,
        scheduled_at: at,
        location_type: type,
        location_note: note,
        within_sitter_hours: true,
        status: "proposed",
        proposed_by: me,
        completed_at: null,
        created_at: created,
      });
    }
    for (const petId of args.p_pets) db.booking_pets.push({ booking_id: id, pet_id: petId });
    return json(route, 200, id);
  }

  if (path === "rpc/get_booking_pets") {
    const { p_booking } = request.postDataJSON();
    const rows = db.booking_pets
      .filter((bp) => bp.booking_id === p_booking)
      .map((bp) => db.pets.find((p) => p.id === bp.pet_id))
      .filter((p): p is Row => !!p)
      .map((p) => ({ pet_id: p.id, name: p.name, species: p.species, breed: p.breed ?? null }));
    return json(route, 200, rows);
  }

  if (path === "rpc/respond_booking") {
    // respond_booking (003 + 004 guard): decline ends it; accept needs the Meet & Greet and no
    // pending sitter counter-offer, then agrees the owner's proposals.
    const args = request.postDataJSON();
    db.responses.push(args);
    const booking = db.bookings.find((b) => b.id === args.p_booking && b.sitter_id === me);
    const fail = (message: string) => json(route, 400, { code: "P0001", message, details: null });
    if (!booking) return fail("not_allowed");
    if (booking.status !== "requested") return fail("invalid_status");
    const open = db.booking_handoffs.filter((h) => h.booking_id === booking.id && h.status === "proposed");
    if (!args.p_accept) {
      booking.status = "declined";
      booking.sitter_note = args.p_note ?? null;
      for (const h of open) h.status = "rejected";
      db.notifications.push({
        id: crypto.randomUUID(),
        user_id: booking.owner_id,
        type: "booking_declined",
        title: `${users.find((u) => u.id === me)?.displayName} declined your booking request`,
        body: args.p_note ?? null,
        pet_id: null,
        booking_id: booking.id,
        ref_id: booking.id,
        read_at: null,
        created_at: new Date(nowMs()).toISOString(),
      });
      return route.fulfill({ status: 204 });
    }
    if (!["not_needed", "done", "skipped", undefined].includes(booking.meet_greet_status as string | undefined)) {
      return fail("meet_greet_required");
    }
    if (open.some((h) => h.proposed_by === me)) return fail("handoff_pending");
    // 014o: the sitter's yes is half of the agreement; the booking is confirmed when the owner said yes too.
    booking.sitter_accepted_at = booking.sitter_accepted_at ?? new Date(nowMs()).toISOString();
    booking.sitter_note = args.p_note ?? booking.sitter_note ?? null;
    if (!booking.owner_agreed_at) {
      db.notifications.push({
        id: crypto.randomUUID(),
        user_id: booking.owner_id,
        type: "booking_sitter_accepted",
        title: `${users.find((u) => u.id === me)?.displayName} accepted. Your turn to book`,
        body: null,
        pet_id: null,
        booking_id: booking.id,
        ref_id: booking.id,
        read_at: null,
        created_at: new Date(nowMs()).toISOString(),
      });
      return route.fulfill({ status: 204 });
    }
    confirmBooking(db, booking, me, users);
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/agree_to_book") {
    // agree_to_book (014o): the owner's "I'd like to book", once the Meet & Greet is over or never needed.
    const { p_booking } = request.postDataJSON();
    db.agreements.push({ p_booking });
    const fail = (message: string) => json(route, 400, { code: "P0001", message, details: null });
    const booking = db.bookings.find((b) => b.id === p_booking && b.owner_id === me);
    if (!booking) return fail("not_allowed");
    if (booking.owner_agreed_at) return route.fulfill({ status: 204 });
    if (booking.status !== "requested") return fail("invalid_status");
    if (!["not_needed", "done", "skipped", undefined].includes(booking.meet_greet_status as string | undefined)) {
      return fail("meet_greet_required");
    }
    if (db.booking_handoffs.some((h) => h.booking_id === booking.id && h.status === "proposed" && h.proposed_by === booking.sitter_id)) {
      return fail("handoff_pending");
    }
    booking.owner_agreed_at = new Date(nowMs()).toISOString();
    if (!booking.sitter_accepted_at) {
      db.notifications.push({
        id: crypto.randomUUID(),
        user_id: booking.sitter_id,
        type: "booking_agree_requested",
        title: `${users.find((u) => u.id === me)?.displayName} would like to book`,
        body: null,
        pet_id: null,
        booking_id: booking.id,
        ref_id: booking.id,
        read_at: null,
        created_at: new Date(nowMs()).toISOString(),
      });
      return route.fulfill({ status: 204 });
    }
    confirmBooking(db, booking, me, users);
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/propose_handoff") {
    const args = request.postDataJSON();
    db.proposals.push(args);
    const booking = db.bookings.find((b) => b.id === args.p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking) return json(route, 400, { code: "P0001", message: "not_allowed", details: null });
    const current = db.booking_handoffs.filter((h) => h.booking_id === booking.id && h.kind === args.p_kind);
    const base = current.find((h) => h.status === "proposed") ?? current.find((h) => h.status === "agreed");
    for (const h of current) {
      if (h.status !== "proposed") continue;
      h.status = "superseded";
      // 014r: the other row of a pair becomes a single suggestion.
      if (h.pair_id) for (const x of db.booking_handoffs) if (x.pair_id === h.pair_id && x.status === "proposed") x.pair_id = null;
    }
    // 014o: new terms on a request clear both yes.
    if (booking.status === "requested") {
      booking.owner_agreed_at = null;
      booking.sitter_accepted_at = null;
    }
    const id = crypto.randomUUID();
    db.booking_handoffs.push({
      id,
      booking_id: booking.id,
      kind: args.p_kind,
      scheduled_at: args.p_at,
      // A time-only offer keeps the place (p_location_type omitted, 003).
      location_type: args.p_location_type ?? base?.location_type ?? "sitter_home",
      location_note: args.p_location_type ? (args.p_note ?? null) : (base?.location_note ?? null),
      within_sitter_hours: true,
      status: "proposed",
      proposed_by: me,
      completed_at: null,
      created_at: new Date(nowMs()).toISOString(),
    });
    return json(route, 200, id);
  }

  if (path === "rpc/propose_handoff_pair") {
    // propose_handoff_pair (014r): the drop-off and the pick-up as one suggestion, one key.
    const args = request.postDataJSON();
    db.proposals.push({ pair: true, ...args });
    const fail = (message: string) => json(route, 400, { code: "P0001", message, details: null });
    const booking = db.bookings.find((b) => b.id === args.p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking) return fail("not_allowed");
    if (Date.parse(args.p_pick_at) <= Date.parse(args.p_drop_at)) return fail("invalid_window");
    const base = (kind: string) => {
      const rows = db.booking_handoffs.filter((h) => h.booking_id === booking.id && h.kind === kind);
      return rows.find((h) => h.status === "proposed") ?? rows.find((h) => h.status === "agreed");
    };
    const drop = base("drop_off");
    const pick = base("pick_up");
    for (const h of db.booking_handoffs) if (h.booking_id === booking.id && h.status === "proposed") h.status = "superseded";
    if (booking.status === "requested") {
      booking.owner_agreed_at = null;
      booking.sitter_accepted_at = null;
    }
    const pair = crypto.randomUUID();
    const row = (kind: string, at: string, type: string | null, note: string | null, from: Row | undefined) => ({
      id: crypto.randomUUID(),
      booking_id: booking.id,
      kind,
      scheduled_at: at,
      location_type: type ?? from?.location_type ?? "sitter_home",
      location_note: type ? (note ?? null) : (from?.location_note ?? null),
      within_sitter_hours: true,
      status: "proposed",
      proposed_by: me,
      completed_at: null,
      created_at: new Date(nowMs()).toISOString(),
      pair_id: pair,
    });
    db.booking_handoffs.push(
      row("drop_off", args.p_drop_at, args.p_drop_type ?? null, args.p_drop_note ?? null, drop),
      row("pick_up", args.p_pick_at, args.p_pick_type ?? null, args.p_pick_note ?? null, pick),
    );
    return json(route, 200, pair);
  }

  if (path === "rpc/express_interest") {
    // express_interest (011l): the sitter's first yes — only a first-time pair, once; the dates are held from then on.
    const { p_booking } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking);
    const fail = (message: string) => json(route, 400, { code: "P0001", message, details: null });
    if (!booking || booking.sitter_id !== me) return fail("not_allowed");
    if (booking.status !== "requested") return fail("invalid_status");
    if (booking.sitter_interest_at) return route.fulfill({ status: 204 });
    if (booking.meet_greet_status !== "required") return fail("interest_not_needed");
    booking.sitter_interest_at = new Date(nowMs()).toISOString();
    booking.meet_greet_due_at = new Date(nowMs() + 2 * 86_400_000).toISOString();
    db.notifications.push({
      id: crypto.randomUUID(),
      user_id: booking.owner_id,
      type: "booking_interest",
      title: `${users.find((u) => u.id === me)?.displayName} would like to meet first`,
      body: null,
      pet_id: null,
      booking_id: booking.id,
      ref_id: booking.id,
      read_at: null,
      created_at: new Date(nowMs()).toISOString(),
    });
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/get_booking_stages") {
    // booking_stage / booking_next_actor (011l), for the caller's own bookings.
    if (db.stagesFail) return json(route, 500, { code: "XX000", message: "boom" });
    const { p_ids } = request.postDataJSON();
    const rows = db.bookings
      .filter((b) => p_ids.includes(b.id) && [b.owner_id, b.sitter_id].includes(me))
      .map((b) => {
        const done = (kind: string) =>
          db.booking_handoffs.some((h) => h.booking_id === b.id && h.kind === kind && h.completed_at);
        const mg = String(b.meet_greet_status ?? "not_needed");
        let stage: string;
        if (b.status === "declined" || b.status === "cancelled") stage = String(b.status);
        else if (b.status === "requested") {
          stage = ["not_needed", "done", "skipped"].includes(mg) ? "confirm" : b.sitter_interest_at ? "meet_greet" : "requested";
        } else if (done("pick_up")) stage = "completed";
        else if (done("drop_off")) stage = "in_care";
        else stage = b.paid_at ? "paid" : "awaiting_payment";
        const next =
          stage === "requested"
            ? "sitter"
            : stage === "confirm"
              ? !b.owner_agreed_at && !b.sitter_accepted_at
                ? "both"
                : !b.owner_agreed_at
                  ? "owner"
                  : !b.sitter_accepted_at
                    ? "sitter"
                    : "none"
              : stage === "awaiting_payment"
              ? "owner"
              : stage === "meet_greet"
                ? mg === "proposed"
                  ? b.meet_greet_proposed_by === b.owner_id ? "sitter" : "owner"
                  : mg === "skip_requested"
                    ? b.meet_greet_skip_requested_by === b.owner_id ? "sitter" : "owner"
                    : "both"
                : "none";
        return { booking_id: b.id, stage, next_actor: next };
      });
    return json(route, 200, rows);
  }

  if (path.startsWith("rpc/") && path.includes("meet_greet")) {
    return handleMeetGreet(route, path.slice(4), request.postDataJSON(), me, db);
  }

  if (path === "rpc/start_trip" || path === "rpc/update_trip_position" || path === "rpc/end_trip") {
    return handleTrip(route, path.slice(4), request.postDataJSON(), me, db);
  }

  if (path === "rpc/complete_handoff") {
    // complete_handoff (003): sitter, confirmed, Received from 2 h before drop-off, Returned after it.
    const { p_booking, p_kind } = request.postDataJSON();
    db.completions.push({ p_booking, p_kind });
    const fail = (message: string) => json(route, 400, { code: "P0001", message, details: null });
    const booking = db.bookings.find((b) => b.id === p_booking && b.sitter_id === me);
    if (!booking) return fail("not_allowed");
    if (booking.status !== "confirmed") return fail("invalid_status");
    const agreed = (kind: string) =>
      db.booking_handoffs.find((h) => h.booking_id === p_booking && h.kind === kind && h.status === "agreed");
    const h = agreed(p_kind);
    if (!h) return fail("handoff_missing");
    if (h.completed_at) return fail("handoff_completed");
    if (p_kind === "drop_off" && nowMs() < Date.parse(String(h.scheduled_at)) - 2 * 3_600_000) {
      return fail("handoff_too_early");
    }
    if (p_kind === "pick_up" && !agreed("drop_off")?.completed_at) return fail("drop_off_not_completed");
    h.completed_at = new Date(nowMs()).toISOString();
    // 012: the trip for this handoff is over — its position is erased.
    for (const trip of db.trips.filter((t) => t.booking_id === p_booking && t.handoff_kind === p_kind && ["en_route", "arrived"].includes(String(t.status)))) {
      Object.assign(trip, { status: "completed", last_lat: null, last_lng: null, last_at: null, eta_at: null, distance_m: null, ended_at: new Date(nowMs()).toISOString() });
    }
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/respond_handoff") {
    // respond_handoff (003): the other side answers; declining before confirm ends the request.
    const { p_handoff, p_accept } = request.postDataJSON();
    db.responses.push({ p_handoff, p_accept });
    const fail = (message: string) => json(route, 400, { code: "P0001", message, details: null });
    const h = db.booking_handoffs.find((x) => x.id === p_handoff);
    const booking = h && db.bookings.find((b) => b.id === h.booking_id);
    if (!h || !booking || ![booking.owner_id, booking.sitter_id].includes(me) || h.proposed_by === me) {
      return fail("not_allowed");
    }
    if (h.status !== "proposed") return fail("invalid_status");
    // 014r: the other row of an explicit pair is answered with it.
    const partner = h.pair_id ? db.booking_handoffs.find((x) => x.pair_id === h.pair_id && x.id !== h.id && x.status === "proposed") : undefined;
    const answered = partner ? [h, partner] : [h];
    if (!p_accept) {
      for (const x of answered) x.status = "rejected";
      if (booking.status === "requested") booking.status = me === booking.sitter_id ? "declined" : "cancelled";
      return route.fulfill({ status: 204 });
    }
    for (const x of db.booking_handoffs) {
      if (x.booking_id === h.booking_id && answered.some((a) => a.kind === x.kind) && x.status === "agreed") x.status = "superseded";
    }
    for (const x of answered) x.status = "agreed";
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/get_handoff_details") {
    // Agreed handoffs with the real address after demo pay (3C.4), confirmed only. Paid once is enough —
    // a checkout reopened by an agreed change keeps them (009e).
    const { p_booking } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking || booking.status !== "confirmed") return json(route, 400, { code: "P0001", message: "invalid_status" });
    if (!booking.paid_at && !booking.price_snapshot) return json(route, 400, { code: "P0001", message: "not_paid" });
    const sitter = db.sitter_profiles.find((p) => p.id === booking.sitter_id);
    const address = (h: Row) =>
      h.location_type === "sitter_home"
        ? (sitter?.home_address ?? null)
        : h.location_type === "owner_home"
          ? (db.owner_profiles.find((p) => p.id === booking.owner_id)?.home_address ?? null)
          : h.location_note;
    return json(
      route,
      200,
      db.booking_handoffs
        .filter((h) => h.booking_id === booking.id && h.status === "agreed")
        .map((h) => ({
          handoff_id: h.id,
          kind: h.kind,
          scheduled_at: h.scheduled_at,
          location_type: h.location_type,
          address: address(h),
          visitor_parking: h.location_type === "sitter_home" ? (sitter?.visitor_parking ?? null) : null,
          lobby_notes: h.location_type === "sitter_home" ? (sitter?.lobby_notes ?? null) : null,
          packing_list: h.location_type === "sitter_home" ? (sitter?.packing_list ?? null) : null,
        })),
    );
  }

  if (path === "rpc/cancel_booking") {
    const { p_booking, p_reason } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking) return json(route, 400, { code: "P0001", message: "not_allowed", details: null });
    const received = db.booking_handoffs.some(
      (h) => h.booking_id === p_booking && h.kind === "drop_off" && h.status === "agreed" && h.completed_at,
    );
    if (received) return json(route, 400, { code: "P0001", message: "booking_in_progress", details: null });
    Object.assign(booking, { status: "cancelled", cancelled_by: me, cancel_reason: p_reason });
    db.cancellations.push({ p_booking, p_reason });
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/quote_booking") {
    if (db.quote_error) return json(route, 400, { code: "P0001", message: db.quote_error, details: db.quote_error_detail });
    return json(route, 200, db.quote ?? DEMO_QUOTE);
  }

  if (path === "rpc/quote_booking_for") {
    // quote_booking_for (014o): the booking's price with the accepted fees of the confirmed chat quote.
    const { p_booking } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking) return json(route, 400, { code: "P0001", message: "not_allowed", details: null });
    if (db.quote_error) return json(route, 400, { code: "P0001", message: db.quote_error, details: db.quote_error_detail });
    return json(route, 200, priceWithFees(db, booking, (db.quote ?? DEMO_QUOTE) as Row));
  }

  if (path === "rpc/required_consents") {
    const { p_booking } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking) return json(route, 400, { code: "P0001", message: "not_allowed", details: null });
    return json(route, 200, requiredKinds(db, p_booking));
  }

  if (path === "rpc/pay_booking_demo") {
    // pay_booking_demo (006): owner, confirmed, unpaid, all consents → paid_at + snapshot.
    const { p_booking } = request.postDataJSON();
    db.payments.push({ p_booking });
    const fail = (message: string, details: string | null = null) =>
      json(route, 400, { code: "P0001", message, details });
    const booking = db.bookings.find((b) => b.id === p_booking);
    if (!booking || booking.owner_id !== me) return fail("not_allowed");
    if (booking.status !== "confirmed") return fail("invalid_status");
    if (booking.paid_at) return fail("already_paid");
    const required = requiredKinds(db, p_booking);
    const signed = new Set(
      db.booking_consents.filter((c) => c.booking_id === p_booking).map((c) => String(c.kind)),
    );
    const missing = required.filter((k) => !signed.has(k));
    if (missing.length > 0) return fail("consents_missing", missing.join(","));
    booking.paid_at = new Date(nowMs()).toISOString();
    const priced = priceWithFees(db, booking, DEMO_QUOTE);
    booking.price_snapshot = priced;
    return json(route, 200, priced);
  }

  if (path === "rpc/ensure_today_task_logs") {
    const { p_pet } = request.postDataJSON();
    const today = appToday();
    for (const task of db.care_tasks.filter((t) => t.pet_id === p_pet && t.active)) {
      const due = zonedToIso(today, String(task.scheduled_time).slice(0, 5));
      if (!db.task_logs.some((l) => l.task_id === task.id && l.due_at === due)) {
        db.task_logs.push({
          id: crypto.randomUUID(),
          task_id: task.id,
          pet_id: p_pet,
          due_at: due,
          status: "pending",
          completed_at: null,
          media_id: null,
          created_at: new Date(nowMs()).toISOString(),
        });
      }
    }
    const start = zonedToIso(today, "00:00");
    const end = zonedToIso(addDays(today, 1), "00:00");
    return json(
      route,
      200,
      db.task_logs.filter((l) => l.pet_id === p_pet && String(l.due_at) >= start && String(l.due_at) < end),
    );
  }

  if (path === "rpc/save_care_request") {
    const { p_pet, p_text, p_model, p_tasks, p_cautions } = request.postDataJSON();
    db.saves.push({ p_pet, p_text, p_model });
    const pet = db.pets.find((p) => p.id === p_pet);
    if (!pet || pet.owner_id !== me) return json(route, 400, { code: "P0001", message: "forbidden" });
    // All or nothing, like the SQL function: a task the pet can't do rolls everything back.
    for (const t of p_tasks as { type: string }[]) {
      if ((t.type === "walk" && pet.species === "cat") || (t.type === "litter" && pet.species === "dog")) {
        return json(route, 400, { code: "P0001", message: "task_type_not_allowed_for_species" });
      }
    }
    const id = crypto.randomUUID();
    db.care_requests.push({ id, pet_id: p_pet, created_by: me, raw_text: p_text, model: p_model });
    for (const t of p_tasks as Record<string, string | null>[]) {
      db.care_tasks.push({
        id: crypto.randomUUID(),
        pet_id: p_pet,
        type: t.type,
        title: t.title,
        dose: t.dose ?? null,
        scheduled_time: `${t.time}:00`,
        notes: t.notes ?? null,
        repeat_daily: true,
        active: true,
        request_id: id,
        created_at: new Date(nowMs()).toISOString(),
      });
    }
    for (const text of p_cautions as string[]) {
      db.pet_cautions.push({ id: crypto.randomUUID(), pet_id: p_pet, request_id: id, text, active: true });
    }
    return json(route, 200, id);
  }

  if (path === "rpc/request_photo") {
    // 014: the owner of a pet in a confirmed stay asks its sitter; asking again returns the open ask.
    const { p_pet } = request.postDataJSON();
    const pet = db.pets.find((p) => p.id === p_pet);
    if (!pet || pet.owner_id !== me) return json(route, 400, { code: "P0001", message: "not_allowed" });
    const booking = db.bookings.find(
      (b) => b.status === "confirmed" && db.booking_pets.some((bp) => bp.booking_id === b.id && bp.pet_id === p_pet),
    );
    if (!booking || !hasOpenStay(db, p_pet)) return json(route, 400, { code: "P0001", message: "not_in_care" });
    const open = db.photo_requests.find((r) => r.booking_id === booking.id && r.pet_id === p_pet && r.status === "open");
    if (open) return json(route, 200, open);
    const row = {
      id: crypto.randomUUID(),
      pet_id: p_pet,
      booking_id: booking.id,
      owner_id: me,
      sitter_id: booking.sitter_id,
      status: "open",
      fulfilled_post_id: null,
      fulfilled_at: null,
      created_at: new Date(nowMs()).toISOString(),
    };
    db.photo_requests.push(row);
    db.notifications.push({
      id: crypto.randomUUID(),
      user_id: booking.sitter_id,
      type: "photo_request",
      title: `${users.find((u) => u.id === me)?.displayName} asked for a photo of ${pet.name} 📷`,
      body: null,
      pet_id: p_pet,
      booking_id: booking.id,
      ref_id: row.id,
      read_at: null,
      created_at: row.created_at,
    });
    return json(route, 200, row);
  }
  if (path === "rpc/send_care_change_request") {
    const { p_pet, p_tasks, p_cautions } = request.postDataJSON();
    const pet = db.pets.find((p) => p.id === p_pet);
    if (!pet || pet.owner_id !== me) return json(route, 400, { code: "P0001", message: "forbidden" });
    if ((p_tasks as unknown[]).length === 0 && (p_cautions as unknown[]).length === 0) {
      return json(route, 400, { code: "P0001", message: "empty_request" });
    }
    const booking = db.bookings.find(
      (b) => b.status === "confirmed" && db.booking_pets.some((bp) => bp.booking_id === b.id && bp.pet_id === p_pet),
    );
    if (!booking) return json(route, 400, { code: "P0001", message: "no_active_stay" });
    if (db.care_change_requests.some((r) => r.pet_id === p_pet && ["pending", "countered"].includes(r.status as string))) {
      return json(route, 400, { code: "P0001", message: "request_pending" });
    }
    const id = crypto.randomUUID();
    db.care_change_requests.push({
      id,
      pet_id: p_pet,
      booking_id: booking.id,
      requested_by: me,
      sitter_id: booking.sitter_id,
      status: "pending",
      tasks: p_tasks,
      cautions: p_cautions,
      decline_reason: null,
      created_at: new Date(nowMs()).toISOString(),
    });
    db.notifications.push({
      id: crypto.randomUUID(),
      user_id: booking.sitter_id,
      type: "care_request",
      title: `${users.find((u) => u.id === me)?.displayName} sent a care request for ${pet.name} 📝`,
      body: null,
      pet_id: p_pet,
      booking_id: booking.id,
      ref_id: id,
      read_at: null,
      created_at: new Date(nowMs()).toISOString(),
    });
    return json(route, 200, id);
  }

  if (path === "rpc/respond_care_change_request") {
    const { p_request, p_approve, p_reason, p_note } = request.postDataJSON();
    const req = db.care_change_requests.find((r) => r.id === p_request);
    if (!req || req.sitter_id !== me) return json(route, 400, { code: "P0001", message: "forbidden" });
    if (req.status !== "pending") return json(route, 400, { code: "P0001", message: "already_answered" });
    if (p_approve) applyChangeRequest(db, req);
    Object.assign(req, { status: p_approve ? "approved" : "declined", decline_reason: p_approve ? null : p_reason, note: p_approve ? null : p_note });
    const pet = db.pets.find((p) => p.id === req.pet_id);
    db.notifications.push({
      id: crypto.randomUUID(),
      user_id: req.requested_by,
      type: p_approve ? "care_request_approved" : "care_request_declined",
      title: p_approve ? `${pet?.name} request approved` : `Couldn't take this one for ${pet?.name}`,
      body: p_approve ? null : ([p_reason, p_note].filter(Boolean).join(" — ") || "Message them to adjust it."),
      pet_id: req.pet_id,
      booking_id: req.booking_id,
      ref_id: req.id,
      read_at: null,
      created_at: new Date(nowMs()).toISOString(),
    });
    return json(route, 200, req);
  }

  if (path === "rpc/counter_care_change_request") {
    const { p_request, p_note, p_fee_cents, p_owner_tasks } = request.postDataJSON();
    const req = db.care_change_requests.find((r) => r.id === p_request);
    if (!req || req.sitter_id !== me) return json(route, 400, { code: "P0001", message: "forbidden" });
    if (req.status !== "pending") return json(route, 400, { code: "P0001", message: "already_answered" });
    if (!String(p_note ?? "").trim()) return json(route, 400, { code: "P0001", message: "note_required" });
    Object.assign(req, { status: "countered", note: String(p_note).trim(), counter_fee_cents: p_fee_cents, counter_owner_tasks: p_owner_tasks });
    const pet = db.pets.find((p) => p.id === req.pet_id);
    db.notifications.push({
      id: crypto.randomUUID(),
      user_id: req.requested_by,
      type: "care_request_countered",
      title: `${users.find((u) => u.id === me)?.displayName} sent a counter-request for ${pet?.name} 💬`,
      body: req.note,
      pet_id: req.pet_id,
      booking_id: req.booking_id,
      ref_id: req.id,
      read_at: null,
      created_at: new Date(nowMs()).toISOString(),
    });
    return json(route, 200, req);
  }

  if (path === "rpc/answer_care_counter") {
    const { p_request, p_accept } = request.postDataJSON();
    const req = db.care_change_requests.find((r) => r.id === p_request);
    if (!req || req.requested_by !== me) return json(route, 400, { code: "P0001", message: "forbidden" });
    if (req.status !== "countered") return json(route, 400, { code: "P0001", message: "already_answered" });
    if (p_accept) applyChangeRequest(db, req);
    req.status = p_accept ? "accepted" : "withdrawn";
    db.notifications.push({
      id: crypto.randomUUID(),
      user_id: req.sitter_id,
      type: p_accept ? "care_counter_accepted" : "care_counter_declined",
      title: p_accept ? "Counter-request accepted" : "Counter-request declined",
      body: null,
      pet_id: req.pet_id,
      booking_id: req.booking_id,
      ref_id: req.id,
      read_at: null,
      created_at: new Date(nowMs()).toISOString(),
    });
    return json(route, 200, req);
  }

  if (path === "rpc/save_report_draft") {
    // 014b: today's one draft, written by hand (no on-duty window in the mock).
    const { p_pet, p_body } = request.postDataJSON();
    const text = String(p_body ?? "").trim();
    if (!text) return json(route, 400, { code: "P0001", message: "body_required" });
    const day = appToday(new Date(nowMs()));
    let draft = db.daily_reports.find((r) => r.pet_id === p_pet && r.sitter_id === me && r.report_date === day && r.status === "draft");
    if (draft) draft.body = text;
    else {
      draft = { id: `hand-${db.daily_reports.length + 1}`, pet_id: p_pet, sitter_id: me, report_date: day, body: text, status: "draft", source_snapshot: null, sent_at: null, created_at: new Date(nowMs()).toISOString() };
      db.daily_reports.push(draft);
    }
    return json(route, 200, draft.id);
  }

  if (path === "rpc/add_owner_diary_entry") {
    // 014p: the owner's own page, sent at once, no notice. The author column holds the owner.
    const { p_pet, p_body } = request.postDataJSON();
    if (!db.pets.some((p) => p.id === p_pet && p.owner_id === me)) return json(route, 400, { code: "P0001", message: "not_owner" });
    const text = String(p_body ?? "").trim();
    if (!text) return json(route, 400, { code: "P0001", message: "body_required" });
    const now = new Date(nowMs()).toISOString();
    const row = { id: `owner-${db.daily_reports.length + 1}`, pet_id: p_pet, sitter_id: me, report_date: appToday(new Date(nowMs())), body: text, status: "sent", source_snapshot: null, sent_at: now, created_at: now };
    db.daily_reports.push(row);
    return json(route, 200, row.id);
  }

  if (path === "rpc/delete_diary_page") {
    // 014t: the author deletes a page; its stickers and its "report sent" notice go with it.
    const { p_report } = request.postDataJSON();
    const report = db.daily_reports.find((r) => r.id === p_report);
    if (!report) return json(route, 400, { code: "P0001", message: "not_found" });
    if (report.sitter_id !== me) return json(route, 400, { code: "P0001", message: "not_author" });
    for (const list of [db.daily_reports, db.report_decor, db.diary_page_hidden]) {
      const keep = list.filter((r) => (list === db.daily_reports ? r.id : r.report_id) !== p_report);
      list.splice(0, list.length, ...keep);
    }
    const notices = db.notifications.filter((n) => !(n.type === "report_sent" && n.ref_id === p_report));
    db.notifications.splice(0, db.notifications.length, ...notices);
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/hide_diary_page") {
    // 014t: the owner hides a sitter's sent page from their own book; the sitter keeps it.
    const { p_report } = request.postDataJSON();
    const report = db.daily_reports.find((r) => r.id === p_report);
    if (!report || report.status !== "sent") return json(route, 400, { code: "P0001", message: "not_found" });
    if (!db.pets.some((p) => p.id === report.pet_id && p.owner_id === me)) return json(route, 400, { code: "P0001", message: "not_owner" });
    if (report.sitter_id === me) return json(route, 400, { code: "P0001", message: "own_page" });
    if (!db.diary_page_hidden.some((h) => h.report_id === p_report && h.user_id === me)) db.diary_page_hidden.push({ report_id: p_report, user_id: me });
    const notices = db.notifications.filter((n) => !(n.user_id === me && n.type === "report_sent" && n.ref_id === p_report));
    db.notifications.splice(0, db.notifications.length, ...notices);
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/set_diary_page_photo") {
    // 014t: the author puts one of their own images of that pet on the page.
    const { p_report, p_media } = request.postDataJSON();
    const report = db.daily_reports.find((r) => r.id === p_report);
    if (!report) return json(route, 400, { code: "P0001", message: "not_found" });
    if (report.sitter_id !== me) return json(route, 400, { code: "P0001", message: "not_author" });
    const media = p_media ? db.media.find((m) => m.id === p_media) : null;
    if (p_media && (!media || media.pet_id !== report.pet_id || media.resource_type !== "image")) return json(route, 400, { code: "P0001", message: "bad_photo" });
    report.media_id = p_media ?? null;
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/send_daily_report") {
    const { p_report, p_body } = request.postDataJSON();
    const report = db.daily_reports.find((r) => r.id === p_report);
    if (!report || report.sitter_id !== me) return json(route, 400, { code: "P0001", message: "forbidden" });
    if (report.status !== "draft") return json(route, 400, { code: "P0001", message: "report_already_sent" });
    if (!String(p_body ?? "").trim()) return json(route, 400, { code: "P0001", message: "body_required" });
    Object.assign(report, { body: String(p_body).trim(), status: "sent", sent_at: new Date(nowMs()).toISOString() });
    const pet = db.pets.find((p) => p.id === report.pet_id);
    db.notifications.push({
      id: crypto.randomUUID(),
      user_id: pet?.owner_id,
      type: "report_sent",
      title: `${users.find((u) => u.id === me)?.displayName} sent ${pet?.name}'s daily report 📓`,
      body: String(p_body).trim().slice(0, 140),
      pet_id: report.pet_id,
      booking_id: null,
      ref_id: report.id,
      read_at: null,
      created_at: new Date(nowMs()).toISOString(),
    });
    return json(route, 200, report);
  }

  if (path === "rpc/submit_review") {
    // 011: only the booking's owner, only after Returned, ★1–5, once.
    const { p_booking, p_rating, p_comment } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking);
    if (!booking || booking.owner_id !== me) return json(route, 400, { code: "P0001", message: "forbidden" });
    const returned = db.booking_handoffs.some((h) => h.booking_id === p_booking && h.kind === "pick_up" && h.completed_at);
    if (booking.status !== "confirmed" || !returned) return json(route, 400, { code: "P0001", message: "stay_not_finished" });
    if (!(p_rating >= 1 && p_rating <= 5)) return json(route, 400, { code: "P0001", message: "invalid_rating" });
    if (db.reviews.some((r) => r.booking_id === p_booking)) return json(route, 400, { code: "P0001", message: "already_reviewed" });
    const row = {
      id: crypto.randomUUID(), booking_id: p_booking, owner_id: me, sitter_id: booking.sitter_id, rating: p_rating,
      comment: String(p_comment ?? "").trim() || null, created_at: new Date().toISOString(),
    };
    db.reviews.push(row);
    db.notifications.push({
      id: crypto.randomUUID(), user_id: booking.sitter_id, type: "review_received", title: "review", body: row.comment,
      pet_id: null, booking_id: p_booking, ref_id: row.id, read_at: null, created_at: row.created_at,
    });
    return json(route, 200, row);
  }

  if (path === "rpc/save_owner_note") {
    // 011g: the stay's sitter, after Returned, ★1–5; one note per booking, saving again edits it; nobody is told.
    const { p_booking, p_rating, p_comment } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking);
    if (!booking || booking.sitter_id !== me) return json(route, 400, { code: "P0001", message: "forbidden" });
    const returned = db.booking_handoffs.some((h) => h.booking_id === p_booking && h.kind === "pick_up" && h.completed_at);
    if (booking.status !== "confirmed" || !returned) return json(route, 400, { code: "P0001", message: "stay_not_finished" });
    if (!(p_rating >= 1 && p_rating <= 5)) return json(route, 400, { code: "P0001", message: "invalid_rating" });
    const comment = String(p_comment ?? "").trim() || null;
    const now = new Date().toISOString();
    let row = db.sitter_owner_notes.find((n) => n.booking_id === p_booking);
    if (row) Object.assign(row, { rating: p_rating, comment, updated_at: now });
    else {
      row = { id: crypto.randomUUID(), booking_id: p_booking, sitter_id: me, owner_id: booking.owner_id, rating: p_rating, comment, created_at: now, updated_at: now };
      db.sitter_owner_notes.push(row);
    }
    return json(route, 200, row);
  }

  if (path === "rpc/sitter_rating_summary") {
    const { p_sitter } = request.postDataJSON();
    const mine = db.reviews.filter((r) => r.sitter_id === p_sitter);
    const avg = mine.length ? Math.round((mine.reduce((n, r) => n + Number(r.rating), 0) / mine.length) * 10) / 10 : null;
    const recent = mine
      .filter((r) => r.comment)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 3)
      .map((r) => ({
        rating: r.rating, comment: r.comment, created_at: r.created_at,
        reviewer: (users.find((u) => u.id === r.owner_id)?.displayName ?? "An owner").split(" ")[0],
      }));
    return json(route, 200, { avg, count: mine.length, recent });
  }

  if (path === "rpc/stay_capacity_check") {
    // 011c: null = fits; a spec sets `db.stayShortfall` to see the refusal.
    db.stayChecks.push(request.postDataJSON());
    return json(route, 200, db.stayShortfall ?? null);
  }

  if (path === "rpc/get_my_ai_reply_mode" || path === "rpc/set_ai_reply_mode") {
    const profile = db.sitter_profiles.find((p) => p.id === me);
    if (!profile) return json(route, 400, { code: "P0001", message: "forbidden" });
    if (path === "rpc/set_ai_reply_mode") {
      const { p_mode, p_consent } = request.postDataJSON();
      if (p_mode === "auto" && !p_consent && !profile.ai_consent_at) return json(route, 400, { code: "P0001", message: "consent_required" });
      profile.ai_reply_mode = p_mode;
      if (p_mode === "auto" && p_consent) profile.ai_consent_at = new Date().toISOString();
    }
    return json(route, 200, { mode: profile.ai_reply_mode ?? "manual", consented: !!profile.ai_consent_at });
  }

  if (path === "rpc/award_pet_medal") {
    const { p_booking, p_pet } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking && b.sitter_id === me && b.status === "confirmed");
    if (!booking) return json(route, 400, { code: "P0001", message: "not_your_booking" });
    if (!db.booking_pets.some((bp) => bp.booking_id === p_booking && bp.pet_id === p_pet)) {
      return json(route, 400, { code: "P0001", message: "pet_not_in_booking" });
    }
    const pickUp = db.booking_handoffs.find((h) => h.booking_id === p_booking && h.kind === "pick_up" && h.completed_at);
    if (!pickUp) return json(route, 400, { code: "P0001", message: "stay_not_finished" });
    const dropOff = db.booking_handoffs.find((h) => h.booking_id === p_booking && h.kind === "drop_off");
    let row = db.pet_medals.find((r) => r.booking_id === p_booking && r.pet_id === p_pet);
    if (!row) {
      row = {
        id: crypto.randomUUID(),
        pet_id: p_pet,
        booking_id: p_booking,
        sitter_id: me,
        stay_from: dropOff?.completed_at ?? dropOff?.scheduled_at,
        stay_to: pickUp.completed_at,
        awarded_at: new Date(nowMs()).toISOString(),
      };
      db.pet_medals.push(row);
    }
    return json(route, 200, row);
  }

  if (path === "rpc/log_care_checkin") {
    const { p_pet, p_kind, p_value, p_note_text, p_media_id } = request.postDataJSON();
    const note = typeof p_note_text === "string" && p_note_text.trim() ? p_note_text.trim() : null;
    const pet = db.pets.find((p) => p.id === p_pet);
    if (p_kind === "note" && !note) return json(route, 400, { code: "P0001", message: "note_required" });
    if (p_kind === "walk" && pet?.species === "cat") {
      return json(route, 400, { code: "P0001", message: "checkin_not_allowed_for_species" });
    }
    const row = {
      id: crypto.randomUUID(),
      pet_id: p_pet,
      created_by: me,
      kind: p_kind,
      value: p_kind === "note" ? null : p_value,
      note_text: note,
      media_id: p_media_id,
      created_at: new Date(nowMs()).toISOString(),
    };
    db.care_checkins.push(row);
    // Same rule as the SQL: preset line, or only the typed memo.
    const preset = `${pet?.name} ${p_kind} ${p_value ?? ""}`.trim();
    db.notifications.push({
      id: crypto.randomUUID(),
      user_id: pet?.owner_id,
      type: "care_checkin",
      title: preset,
      body: note,
      pet_id: p_pet,
      booking_id: null,
      ref_id: row.id,
      read_at: null,
      created_at: row.created_at,
    });
    return json(route, 200, row);
  }

  if (path === "rpc/complete_task_log") {
    const { p_task_log, p_media_id, p_note_text } = request.postDataJSON();
    db.taskCompletions.push({ p_task_log, p_media_id, p_note_text });
    const note = typeof p_note_text === "string" && p_note_text.trim() ? p_note_text.trim() : null;
    const log = db.task_logs.find((l) => l.id === p_task_log);
    if (!log) return json(route, 400, { code: "P0001", message: "task_log_not_found" });
    if (log.status === "done") return json(route, 400, { code: "P0001", message: "already_done" });
    Object.assign(log, {
      status: "done",
      completed_at: new Date(nowMs()).toISOString(),
      completed_by: me,
      media_id: p_media_id,
      note_text: note,
    });
    const pet = db.pets.find((p) => p.id === log.pet_id);
    const task = db.care_tasks.find((t) => t.id === log.task_id);
    db.notifications.push({
      id: crypto.randomUUID(),
      user_id: pet?.owner_id,
      type: "task_done",
      title: `${pet?.name} finished ${task?.title}`,
      body: note,
      pet_id: log.pet_id,
      booking_id: null,
      ref_id: log.id,
      read_at: null,
      created_at: new Date(nowMs()).toISOString(),
    });
    if (p_media_id) {
      db.feed_posts.push({
        id: crypto.randomUUID(),
        pet_id: log.pet_id,
        sitter_id: me,
        posted_by: me,
        visibility: "shared",
        media_id: p_media_id,
        caption: note ?? `${task?.title} — done`,
        caption_source: "task",
        task_log_id: log.id,
        created_at: new Date(nowMs()).toISOString(),
      });
    }
    return json(route, 200, log);
  }

  if (path === "rpc/get_home_access") {
    const { p_booking } = request.postDataJSON();
    const fail = (message: string, details: string | null = null) =>
      json(route, 400, { code: "P0001", message, details });
    const booking = db.bookings.find((b) => b.id === p_booking);
    if (!booking || booking.sitter_id !== me) return fail("forbidden");
    if (!booking.paid_at) return fail("not_paid");
    const needs =
      booking.service_type === "house_sitting" ||
      db.booking_handoffs.some(
        (h) => h.booking_id === p_booking && h.location_type === "owner_home" && h.status === "agreed",
      );
    if (!needs) return fail("forbidden");
    const drop = db.booking_handoffs.find(
      (h) =>
        h.booking_id === p_booking &&
        h.status === "agreed" &&
        (booking.service_type === "house_sitting" || h.location_type === "owner_home"),
    );
    const unlockAt = drop ? Date.parse(String(drop.scheduled_at)) - 2 * 3_600_000 : nowMs();
    if (nowMs() < unlockAt) {
      return fail("access_locked", JSON.stringify({ unlocks_at: new Date(unlockAt).toISOString() }));
    }
    const access = db.owner_home_access.find((r) => r.owner_id === booking.owner_id);
    return json(route, 200, [
      {
        entry_steps: access?.entry_steps ?? null,
        lockbox_code: access?.lockbox_code ?? null,
        buzzer: access?.buzzer ?? null,
        fob_notes: access?.fob_notes ?? null,
        sitter_parking: access?.sitter_parking ?? null,
        first_revealed_at: new Date(nowMs()).toISOString(),
      },
    ]);
  }

  if (path === "profiles") {
    if (method === "PATCH") {
      const user = users.find((u) => u.id === me && matches({ id: u.id }, params));
      if (user) user.displayName = String(request.postDataJSON().display_name);
      return route.fulfill({ status: 204 });
    }
    const rows = users
      .map((u) => ({ id: u.id, role: u.role, display_name: u.displayName }) as Row)
      .filter((row) => matches(row, params));
    return respond(route, rows, wantsObject);
  }

  const table = db[path as keyof MockDb];
  if (!table) return json(route, 404, { message: `Not mocked: ${method} ${path}` });

  // supabase-js `head: true` (unread count) sends HEAD; answer like GET.
  if (method === "GET" || method === "HEAD") {
    // RLS: notifications are private to their user.
    let rows = table.filter(
      (row) =>
        matches(row, params) &&
        // RLS (012): a trip is readable by the two people on its booking.
        (path !== "trips" || db.bookings.some((b) => b.id === row.booking_id && (b.owner_id === me || b.sitter_id === me))) &&
        (path !== "notifications" || (row.user_id === me && (row.visible_at == null || Date.parse(String(row.visible_at)) <= Date.now()))) &&
        // RLS: a private post is only visible to its author (5.8).
        (path !== "feed_posts" || row.posted_by === me || row.visibility !== "private") &&
        // RLS: an owner only sees reports that were sent; a draft is the sitter's alone (009). A sent page is read by
        // its author and by the pet's owner, so a sitter never reads an owner's own page (014p).
        (path !== "daily_reports" ||
          row.sitter_id === me ||
          (row.status === "sent" &&
            db.pets.some((p) => p.id === row.pet_id && p.owner_id === me) &&
            !db.diary_page_hidden.some((h) => h.report_id === row.id && h.user_id === me))) &&
        // RLS: a review is private to the owner who wrote it and the sitter it is about (011).
        (path !== "reviews" || row.owner_id === me || row.sitter_id === me) &&
        // RLS (011g): the sitter's note about an owner is the sitter's alone.
        (path !== "sitter_owner_notes" || row.sitter_id === me) &&
        // RLS (011h): an owner's favorites are theirs alone.
        (path !== "owner_favorite_sitters" || row.owner_id === me) &&
        // RLS (014j): a chat is for its two people.
        (path !== "chat_messages" || db.chat_threads.some((t) => t.id === row.thread_id && (t.owner_id === me || t.sitter_id === me))) &&
        (path !== "chat_threads" || row.owner_id === me || row.sitter_id === me) &&
        // RLS (015b): the pet's owner and the sitter who gave the medal.
        (path !== "pet_medals" || row.sitter_id === me || db.pets.some((p) => p.id === row.pet_id && p.owner_id === me)) &&
        // RLS (011): an owner reads their pets' records; the raw source_snapshot is never selectable.
        // …and a sitter with a pending / confirmed booking that includes the pet (can_view_pet_profile).
        (path !== "pet_life_records" ||
          db.pets.some((p) => p.id === row.pet_id && p.owner_id === me) ||
          db.bookings.some(
            (b) =>
              b.sitter_id === me &&
              (b.status === "requested" || b.status === "confirmed") &&
              db.booking_pets.some((bp) => bp.booking_id === b.id && bp.pet_id === row.pet_id),
          )) &&
        // RLS (014): the owner who asked and the asked sitter.
        (path !== "photo_requests" || row.owner_id === me || row.sitter_id === me),
    );
    if (path === "pets" && (params.get("select") ?? "").includes("pet_allergies(")) {
      rows = rows.map((pet) => ({
        ...pet,
        pet_allergies: db.pet_allergies
          .filter((a) => a.pet_id === pet.id)
          .map((a) => ({ id: a.id, allergen: a.allergen })),
      }));
    }
    const select = params.get("select") ?? "";
    if (path === "pets" && select.includes("pet_cautions(")) {
      rows = rows.map((pet) => ({
        ...pet,
        pet_cautions: db.pet_cautions.filter((c) => c.pet_id === pet.id),
      }));
    }
    if (path === "pets" && select.includes("care_tasks(")) {
      rows = rows.map((pet) => ({ ...pet, care_tasks: db.care_tasks.filter((t) => t.pet_id === pet.id) }));
    }
    if (path === "pets" && select.includes("owner:profiles")) {
      rows = rows.map((pet) => ({
        ...pet,
        owner: { display_name: users.find((u) => u.id === pet.owner_id)?.displayName ?? null },
      }));
    }
    if (path === "pet_stickers" && select.includes("media")) {
      rows = rows.map((sticker) => {
        const media = db.media.find((m) => m.id === sticker.media_id);
        return { ...sticker, media: media ? { cloudinary_public_id: media.cloudinary_public_id } : null };
      });
    }
    if (path === "feed_posts" && select.includes("media")) {
      rows = rows.map((post) => {
        const media = db.media.find((m) => m.id === post.media_id) ?? null;
        const author = users.find((u) => u.id === post.posted_by);
        return {
          ...post,
          media: media
            ? {
                id: media.id,
                cloudinary_public_id: media.cloudinary_public_id,
                resource_type: media.resource_type,
                width: media.width ?? null,
                height: media.height ?? null,
                duration_s: media.duration_s ?? null,
              }
            : null,
          author: { display_name: author?.displayName ?? "Someone" },
        };
      });
    }
    // Diary reads (phase 06 6.11): embeds PostgREST would resolve from the foreign keys.
    const mediaOf = (id: unknown) => {
      const m = db.media.find((x) => x.id === id);
      return m
        ? { id: m.id, cloudinary_public_id: m.cloudinary_public_id, resource_type: m.resource_type }
        : null;
    };
    const nameOf = (id: unknown) => {
      const u = users.find((x) => x.id === id);
      return u ? { display_name: u.displayName } : null;
    };
    if (path === "task_logs" && select.includes("care_tasks")) {
      rows = rows.map((log) => {
        const task = db.care_tasks.find((t) => t.id === log.task_id);
        return {
          ...log,
          care_tasks: task ? { type: task.type, title: task.title } : null,
          media: mediaOf(log.media_id),
          completed: nameOf(log.completed_by),
        };
      });
    }
    if (path === "pet_life_records" && select.includes("sitter:profiles")) {
      rows = rows.map((r) => ({ ...r, sitter: { display_name: users.find((u) => u.id === r.sitter_id)?.displayName ?? null } }));
    }
    if (path === "pet_medals" && select.includes("sitter:profiles")) {
      rows = rows.map((r) => ({ ...r, sitter: { display_name: users.find((u) => u.id === r.sitter_id)?.displayName ?? null } }));
    }
    if (path === "daily_reports" && select.includes("media(")) {
      rows = rows.map((r) => ({ ...r, media: mediaOf(r.media_id) }));
    }
    if (path === "daily_reports" && select.includes("pets(")) {
      rows = rows.map((r) => ({
        ...r,
        pets: { name: db.pets.find((p) => p.id === r.pet_id)?.name ?? null, species: db.pets.find((p) => p.id === r.pet_id)?.species ?? null },
        sitter: { display_name: users.find((u) => u.id === r.sitter_id)?.displayName ?? null },
      }));
    }
    if (path === "care_change_requests") {
      rows = rows
        .filter((r) => r.requested_by === me || r.sitter_id === me)
        .map((r) => ({ ...r, pets: { name: db.pets.find((p) => p.id === r.pet_id)?.name ?? null } }));
    }
    if (path === "task_logs" && select.includes("media") && !select.includes("care_tasks")) {
      rows = rows.map((log) => ({ ...log, media: mediaOf(log.media_id) }));
    }
    if (path === "care_checkins" && select.includes("media")) {
      rows = rows.map((c) => ({ ...c, media: mediaOf(c.media_id), by: nameOf(c.created_by) }));
    }
    if (path === "bookings") {
      const name = (id: unknown) => ({ display_name: users.find((u) => u.id === id)?.displayName ?? null });
      rows = rows.map((b) => ({
        ...b,
        ...(select.includes("owner:profiles") ? { owner: name(b.owner_id) } : {}),
        ...(select.includes("sitter:profiles") ? { sitter: name(b.sitter_id) } : {}),
        ...(select.includes("booking_handoffs(")
          ? { booking_handoffs: db.booking_handoffs.filter((h) => h.booking_id === b.id) }
          : {}),
        ...(select.includes("booking_pets(")
          ? {
              booking_pets: db.booking_pets
                .filter((bp) => bp.booking_id === b.id)
                .map((bp) => {
                  const pet = db.pets.find((p) => p.id === bp.pet_id);
                  return { pets: pet ? { id: pet.id, name: pet.name, species: pet.species } : null };
                }),
            }
          : {}),
      }));
    }
    if ((params.get("order") ?? "").startsWith("created_at")) {
      rows = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      // Feed + notifications are read newest first (`order=created_at.desc`).
      if ((path === "pet_life_records" || path === "feed_posts" || path === "notifications" || path === "care_checkins" || path === "care_change_requests" || path === "pet_stickers" || path === "safety_checks") && params.get("order")!.endsWith(".desc")) {
        rows.reverse();
      }
    }
    if ((params.get("order") ?? "").startsWith("started_at")) {
      rows = [...rows].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
      if (params.get("order")!.endsWith(".desc")) rows.reverse();
    }
    if ((params.get("order") ?? "").startsWith("awarded_at")) {
      rows = [...rows].sort((a, b) => String(a.awarded_at).localeCompare(String(b.awarded_at)));
      if (params.get("order")!.endsWith(".desc")) rows.reverse();
    }
    // Reads ordered by a report's sent time (Stay summary).
    if ((params.get("order") ?? "").startsWith("sent_at")) {
      rows = [...rows].sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
      if (params.get("order")!.endsWith(".desc")) rows.reverse();
    }
    // Only the Snap tab's "Recent checks" asks for a short list so far.
    if (path === "safety_checks" && params.get("limit")) rows = rows.slice(0, Number(params.get("limit")));
    const wantsCount = (headers.prefer ?? "").includes("count=");
    return respond(route, rows, wantsObject, 200, wantsCount ? rows.length : undefined);
  }

  if (method === "POST") {
    const body = request.postDataJSON();
    const inserted: Row[] = (Array.isArray(body) ? body : [body]).map((row: Row): Row => ({
      id: crypto.randomUUID(),
      created_at: new Date(nowMs()).toISOString(),
      ...(path === "booking_consents" ? { signed_at: new Date(nowMs()).toISOString() } : {}),
      ...(path === "feed_posts" ? { visibility: "shared" } : {}),
      ...(path === "pet_cautions" ? { active: true } : {}),
      // Column defaults of 010.
      // 011h: owner_id defaults to the caller.
      ...(path === "owner_favorite_sitters" ? { owner_id: me } : {}),
      ...row,
    }));
    if (path === "booking_consents") {
      for (const row of inserted) {
        const dupe = db.booking_consents.some((c) => c.booking_id === row.booking_id && c.kind === row.kind);
        if (dupe) return json(route, 409, { code: "23505", message: "duplicate key value" });
        // 009d: the owner signs at checkout only — confirmed, not paid yet, a kind the booking requires.
        const booking = db.bookings.find((b) => b.id === row.booking_id);
        const open = !!booking && booking.owner_id === me && booking.status === "confirmed" && !booking.paid_at;
        if (row.signer_id !== me || !open || !requiredKinds(db, String(row.booking_id)).includes(String(row.kind))) {
          return json(route, 403, { code: "42501", message: "new row violates row-level security policy" });
        }
      }
    }
    if (path === "owner_home_access") {
      for (const row of inserted) {
        if (row.owner_id !== me) {
          return json(route, 403, { code: "42501", message: "new row violates row-level security policy" });
        }
      }
    }
    // 008j: no direct additions while a stay is on (confirmed booking, pet not picked up yet).
    if ((path === "care_tasks" || path === "pet_cautions") && inserted.some((row) => hasOpenStay(db, row.pet_id))) {
      return json(route, 403, { code: "42501", message: "new row violates row-level security policy" });
    }
    if (path === "care_tasks") {
      for (const row of inserted) {
        const pet = db.pets.find((p) => p.id === row.pet_id);
        if (!pet || pet.owner_id !== me) {
          return json(route, 403, { code: "42501", message: "new row violates row-level security policy" });
        }
        if ((row.type === "walk" && pet.species === "cat") || (row.type === "litter" && pet.species === "dog")) {
          return json(route, 400, { code: "P0001", message: "task_type_not_allowed_for_species" });
        }
        Object.assign(row, { active: true, repeat_daily: row.repeat_daily ?? true });
      }
    }
    if (path === "pets" && inserted.some((row) => row.owner_id !== me)) {
      return json(route, 403, { code: "42501", message: "new row violates row-level security policy" });
    }
    if (path === "sitter_availability") {
      if (inserted.some((row) => row.sitter_id !== me)) {
        return json(route, 403, { code: "42501", message: "new row violates row-level security policy" });
      }
      const conflicts = blockConflicts(db, inserted);
      if (conflicts.length > 0) {
        return json(route, 400, { code: "P0001", message: "overlaps_confirmed_booking", details: conflicts.join(",") });
      }
    }
    if (path === "pet_allergies") {
      for (const row of inserted) {
        const dupe = db.pet_allergies.some(
          (a) => a.pet_id === row.pet_id && String(a.allergen).toLowerCase() === String(row.allergen).toLowerCase(),
        );
        if (dupe) return json(route, 409, { code: "23505", message: "duplicate key value" });
      }
    }
    if (path === "report_decor") {
      // upsert on (report_id, user_id): my layer replaces my earlier one; RLS (013b) — only my own row.
      for (const row of inserted) {
        if (row.user_id !== me) return json(route, 403, { code: "42501", message: "new row violates row-level security policy" });
        const keep = db.report_decor.filter((r) => !(r.report_id === row.report_id && r.user_id === row.user_id));
        db.report_decor.splice(0, db.report_decor.length, ...keep);
      }
    }
    table.push(...inserted);
    // 014 fulfill_photo_request: a shared sitter post answers that pet's open ask and tells the owner.
    if (path === "feed_posts") {
      for (const post of inserted.filter((p) => p.sitter_id && p.visibility === "shared")) {
        for (const r of db.photo_requests.filter((x) => x.pet_id === post.pet_id && x.sitter_id === post.sitter_id && x.status === "open")) {
          Object.assign(r, { status: "fulfilled", fulfilled_post_id: post.id, fulfilled_at: new Date(nowMs()).toISOString() });
          db.notifications.push({
            id: crypto.randomUUID(),
            user_id: r.owner_id,
            type: "photo_request_fulfilled",
            title: `Here's the photo of ${db.pets.find((p) => p.id === post.pet_id)?.name} you asked for 📷`,
            body: null,
            pet_id: post.pet_id,
            booking_id: r.booking_id,
            ref_id: post.id,
            read_at: null,
            created_at: new Date(nowMs()).toISOString(),
          });
        }
      }
    }
    if (!wantsRows) return route.fulfill({ status: 201 });
    return respond(route, inserted, wantsObject, 201);
  }

  if (method === "PATCH") {
    const changes = request.postDataJSON();
    if (path === "pets" && "species" in changes) {
      return json(route, 403, { code: "42501", message: "permission denied for column species" });
    }
    for (const row of table.filter(
      (r) => matches(r, params) && (path !== "notifications" || r.user_id === me),
    )) {
      Object.assign(row, changes);
    }
    return route.fulfill({ status: 204 });
  }

  if (method === "DELETE") {
    // RLS: notifications are deleted only by their user.
    const keep = table.filter(
      (row) => !(matches(row, params) && (path !== "notifications" || row.user_id === me)),
    );
    table.splice(0, table.length, ...keep);
    return route.fulfill({ status: 204 });
  }

  return json(route, 405, { message: `Not mocked: ${method} ${path}` });
}
