import type { Page, Route } from "@playwright/test";

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
  email: "owner@pawnote.test",
  password: "max-and-mochi",
  role: "owner",
  displayName: "Chloe",
};

export const SITTER: MockUser = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "sitter@pawnote.test",
  password: "care-snap-tap",
  role: "sitter",
  displayName: "Lucy",
};

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sessionFor(user: MockUser) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 };
  const timestamp = new Date().toISOString();
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

export async function mockSupabase(page: Page, initialUsers: MockUser[]) {
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
    return json(route, 404, { msg: `Not mocked: ${request.method()} ${url.pathname}` });
  });

  const db = createMockDb();
  await page.route("**/rest/v1/**", (route) => handleRest(route, users, db));

  return { signups, db };
}

// ---------------------------------------------------------------------------
// A tiny in-memory PostgREST: only the request shapes the app sends.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export type MockDb = {
  pets: Row[];
  pet_allergies: Row[];
  owner_profiles: Row[];
  sitter_profiles: Row[];
  sitter_availability: Row[];
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
  /** request_booking calls with their parameters. */
  requests: Row[];
  care_tasks: Row[];
  /** respond_booking / propose_handoff calls with their parameters. */
  responses: Row[];
  proposals: Row[];
  /** Meet & Greet RPC calls: { fn, ...params }. */
  meetGreetCalls: Row[];
};

const OWNER_PROFILE_FIELDS = ["home_address", "emergency_contact_name", "emergency_contact_phone", "vet_clinic_name", "vet_clinic_phone"];
const SITTER_PROFILE_FIELDS = ["bio", "service_area", "experience_years", "home_notes", "home_address"];

function emptyRow(id: string, fields: string[]): Row {
  return Object.fromEntries([["id", id], ...fields.map((f) => [f, null])]);
}

function createMockDb(): MockDb {
  return {
    pets: [],
    pet_allergies: [],
    owner_profiles: [],
    sitter_profiles: [],
    sitter_availability: [],
    bookings: [],
    booking_slots: [],
    cancellations: [],
    booking_handoffs: [],
    booking_pets: [],
    search_results: [],
    searches: [],
    requests: [],
    care_tasks: [],
    responses: [],
    proposals: [],
    meetGreetCalls: [],
  };
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

/** get_sitter_schedule (003): newest open row sets hours and spots, any blocked row closes the slot. */
function sitterSchedule(db: MockDb, sitterId: string, from: string, to: string): Row[] {
  const rows = db.sitter_availability.filter((r) => r.sitter_id === sitterId);
  const out: Row[] = [];
  for (const day of daysBetween(from, to)) {
    for (const slot of SLOT_NAMES) {
      const here = rows.filter((r) => r.slot === slot && coversDay(r, day));
      const blocked = here.some((r) => r.kind === "blocked");
      const open = here
        .filter((r) => r.kind === "open")
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      const remaining = open ? Math.max(Number(open.max_pets) - usedSpots(db, sitterId, day, slot).length, 0) : 0;
      out.push({
        day,
        slot,
        starts_at: open ? `${open.starts_at}:00` : null,
        ends_at: open ? `${open.ends_at}:00` : null,
        state: blocked ? "blocked" : !open ? "closed" : remaining === 0 ? "full" : "open",
        remaining: blocked || !open ? 0 : remaining,
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
      owner_name: "Chloe",
      owner_spots: db.owner_profiles.find((p) => p.id === b.owner_id)?.meet_spots ?? [],
      sitter_name: "Lucy",
      sitter_spots: db.sitter_profiles.find((p) => p.id === b.sitter_id)?.meet_spots ?? [],
    });
  }
  if (b.status !== "requested") return fail("invalid_status");
  const status = String(b.meet_greet_status ?? "not_needed");
  const done = () => route.fulfill({ status: 204 });

  switch (fn) {
    case "propose_meet_greet": {
      if (!["required", "proposed", "agreed"].includes(status)) return fail("invalid_status");
      if (args.p_mode === "in_person" && !String(args.p_place ?? "").trim()) return fail("place_required");
      if (Date.parse(String(args.p_at)) <= Date.now()) return fail("invalid_window");
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
      if (status !== "agreed") return fail("invalid_status");
      if (Date.now() < Date.parse(String(b.meet_greet_at))) return fail("meet_greet_not_yet");
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
    } else if (raw.startsWith("in.(")) {
      const values = raw.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, ""));
      if (!values.includes(String(row[key]))) return false;
    }
  }
  return true;
}

function respond(route: Route, rows: Row[], wantsObject: boolean, status = 200) {
  if (wantsObject) {
    if (rows.length !== 1) {
      return json(route, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    }
    return json(route, status, rows[0]);
  }
  return json(route, status, rows);
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

  if (path === "rpc/get_my_sitter_profile") {
    return respond(route, db.sitter_profiles.filter((row) => row.id === me), wantsObject);
  }

  if (path === "rpc/get_sitter_schedule") {
    const { p_sitter, p_from, p_to } = request.postDataJSON();
    return json(route, 200, sitterSchedule(db, p_sitter, p_from, p_to));
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
    const created = new Date().toISOString();
    db.bookings.push({
      id,
      owner_id: me,
      sitter_id: args.p_sitter,
      status: "requested",
      service_type: args.p_service_type ?? "boarding",
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
      for (const h of open) h.status = "rejected";
      return route.fulfill({ status: 204 });
    }
    if (!["not_needed", "done", "skipped", undefined].includes(booking.meet_greet_status as string | undefined)) {
      return fail("meet_greet_required");
    }
    if (open.some((h) => h.proposed_by === me)) return fail("handoff_pending");
    booking.status = "confirmed";
    for (const h of open) h.status = "agreed";
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/propose_handoff") {
    const args = request.postDataJSON();
    db.proposals.push(args);
    const booking = db.bookings.find((b) => b.id === args.p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking) return json(route, 400, { code: "P0001", message: "not_allowed", details: null });
    const current = db.booking_handoffs.filter((h) => h.booking_id === booking.id && h.kind === args.p_kind);
    const base = current.find((h) => h.status === "proposed") ?? current.find((h) => h.status === "agreed");
    for (const h of current) if (h.status === "proposed") h.status = "superseded";
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
      created_at: new Date().toISOString(),
    });
    return json(route, 200, id);
  }

  if (path.startsWith("rpc/") && path.includes("meet_greet")) {
    return handleMeetGreet(route, path.slice(4), request.postDataJSON(), me, db);
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
    if (!p_accept) {
      h.status = "rejected";
      if (booking.status === "requested") booking.status = me === booking.sitter_id ? "declined" : "cancelled";
      return route.fulfill({ status: 204 });
    }
    for (const x of db.booking_handoffs) {
      if (x.booking_id === h.booking_id && x.kind === h.kind && x.status === "agreed") x.status = "superseded";
    }
    h.status = "agreed";
    return route.fulfill({ status: 204 });
  }

  if (path === "rpc/get_handoff_details") {
    // Agreed handoffs with the real address, confirmed bookings only (003).
    const { p_booking } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking || booking.status !== "confirmed") return json(route, 400, { code: "P0001", message: "invalid_status" });
    const address = (h: Row) =>
      h.location_type === "sitter_home"
        ? (db.sitter_profiles.find((p) => p.id === booking.sitter_id)?.home_address ?? null)
        : h.location_type === "owner_home"
          ? (db.owner_profiles.find((p) => p.id === booking.owner_id)?.home_address ?? null)
          : h.location_note;
    return json(
      route,
      200,
      db.booking_handoffs
        .filter((h) => h.booking_id === booking.id && h.status === "agreed")
        .map((h) => ({ handoff_id: h.id, kind: h.kind, scheduled_at: h.scheduled_at, address: address(h) })),
    );
  }

  if (path === "rpc/cancel_booking") {
    const { p_booking, p_reason } = request.postDataJSON();
    const booking = db.bookings.find((b) => b.id === p_booking && (b.owner_id === me || b.sitter_id === me));
    if (!booking) return json(route, 400, { code: "P0001", message: "not_allowed", details: null });
    booking.status = "cancelled";
    db.cancellations.push({ p_booking, p_reason });
    return route.fulfill({ status: 204 });
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

  if (method === "GET") {
    let rows = table.filter((row) => matches(row, params));
    if (path === "pets" && (params.get("select") ?? "").includes("pet_allergies(")) {
      rows = rows.map((pet) => ({
        ...pet,
        pet_allergies: db.pet_allergies
          .filter((a) => a.pet_id === pet.id)
          .map((a) => ({ id: a.id, allergen: a.allergen })),
      }));
    }
    const select = params.get("select") ?? "";
    if (path === "pets" && select.includes("care_tasks(")) {
      rows = rows.map((pet) => ({ ...pet, care_tasks: db.care_tasks.filter((t) => t.pet_id === pet.id) }));
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
                  return { pets: pet ? { name: pet.name, species: pet.species } : null };
                }),
            }
          : {}),
      }));
    }
    if ((params.get("order") ?? "").startsWith("created_at")) {
      rows = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    }
    return respond(route, rows, wantsObject);
  }

  if (method === "POST") {
    const body = request.postDataJSON();
    const inserted: Row[] = (Array.isArray(body) ? body : [body]).map((row: Row): Row => ({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...row,
    }));
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
    table.push(...inserted);
    if (!wantsRows) return route.fulfill({ status: 201 });
    return respond(route, inserted, wantsObject, 201);
  }

  if (method === "PATCH") {
    const changes = request.postDataJSON();
    if (path === "pets" && "species" in changes) {
      return json(route, 403, { code: "42501", message: "permission denied for column species" });
    }
    for (const row of table.filter((r) => matches(r, params))) Object.assign(row, changes);
    return route.fulfill({ status: 204 });
  }

  if (method === "DELETE") {
    const keep = table.filter((row) => !matches(row, params));
    table.splice(0, table.length, ...keep);
    return route.fulfill({ status: 204 });
  }

  return json(route, 405, { message: `Not mocked: ${method} ${path}` });
}
