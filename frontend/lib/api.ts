import { getSupabase } from "./supabase";

const DEFAULT_API_URL = "http://localhost:8000";

export function getApiBaseUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!url) {
    return null;
  }
  return url.replace(/\/$/, "");
}

export type HealthResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function getHealth(): Promise<HealthResult> {
  const base = getApiBaseUrl();
  if (!base) {
    return {
      ok: false,
      message:
        "API URL is not set. Add EXPO_PUBLIC_API_URL to frontend/.env and restart Expo.",
    };
  }

  const url = `${base}/health`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { detail?: string };
        if (body.detail) {
          detail = String(body.detail);
        }
      } catch {
        // ignore JSON parse errors
      }
      return {
        ok: false,
        message: `API responded ${response.status}: ${detail}`,
      };
    }
    const data = (await response.json()) as { status?: string };
    if (data.status === "ok") {
      return { ok: true, message: "API OK ✅" };
    }
    return {
      ok: false,
      message: `API responded ${response.status}: unexpected body`,
    };
  } catch {
    return {
      ok: false,
      message: `Cannot reach API at ${url}. Is the backend running? Check the URL and CORS_ORIGINS.`,
    };
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Authenticated JSON POST — Bearer = current Supabase session. */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>("POST", path, body);
}

/** Authenticated DELETE — Bearer = current Supabase session. */
export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>("DELETE", path);
}

async function apiRequest<T>(method: "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new ApiError("API URL is not set.", 0, "not_configured");
  }
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session?.access_token) {
    throw new ApiError("Sign in to continue.", 401, "unauthorized");
  }
  const response = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: { detail?: string; code?: string } = {};
  try {
    payload = (await response.json()) as { detail?: string; code?: string };
  } catch {
    // non-JSON
  }
  if (!response.ok) {
    throw new ApiError(
      payload.detail || response.statusText || "Request failed.",
      response.status,
      payload.code || "http_error",
    );
  }
  return payload as T;
}

export { DEFAULT_API_URL };
