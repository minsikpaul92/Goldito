import { Role } from "../providers/SessionProvider";

/**
 * Seeded demo accounts for judges (onboarding.ko.md OB.3). Same strings as
 * backend/scripts/seed_demo.py, README and Devpost. The password is a public,
 * demo-only value (architecture §4) — never a real password or a service key.
 */
export const DEMO_ACCOUNTS: Record<Role, { email: string; name: string }> = {
  owner: { email: "demo-owner@pawddy.test", name: "Robert" },
  sitter: { email: "demo-sitter@pawddy.test", name: "Chloe" },
};

export const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD?.trim() ?? "";

/** Try demo is only offered when the build has the demo password. */
export const isDemoEnabled = DEMO_PASSWORD.length > 0;

export function isDemoRole(value: unknown): value is Role {
  return value === "owner" || value === "sitter";
}
