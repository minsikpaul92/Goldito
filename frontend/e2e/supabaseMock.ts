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
  const users = [...initialUsers];
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

  // `profiles` row the signup trigger would create (phase-02).
  await page.route("**/rest/v1/profiles**", async (route) => {
    const url = new URL(route.request().url());
    const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
    const user = users.find((u) => u.id === id);
    if (!user) {
      return json(route, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    }
    return json(route, 200, { id: user.id, role: user.role, display_name: user.displayName });
  });

  return { signups };
}
