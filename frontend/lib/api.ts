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

export { DEFAULT_API_URL };
