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
  password: "bori-and-mochi",
  role: "owner",
  displayName: "Jisoo",
};

export const SITTER: MockUser = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "sitter@pawnote.test",
  password: "care-snap-tap",
  role: "sitter",
  displayName: "Mina",
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
};

const OWNER_PROFILE_FIELDS = ["home_address", "emergency_contact_name", "emergency_contact_phone", "vet_clinic_name", "vet_clinic_phone"];
const SITTER_PROFILE_FIELDS = ["bio", "service_area", "experience_years", "home_notes", "home_address"];

function emptyRow(id: string, fields: string[]): Row {
  return Object.fromEntries([["id", id], ...fields.map((f) => [f, null])]);
}

function createMockDb(): MockDb {
  return { pets: [], pet_allergies: [], owner_profiles: [], sitter_profiles: [] };
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

/** `col=eq.value` and `col=in.(a,b)` filters. */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(key)) continue;
    if (raw.startsWith("eq.")) {
      if (String(row[key]) !== raw.slice(3)) return false;
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
