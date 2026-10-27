import { Role } from "../providers/SessionProvider";

type DemoAccount = { email: string; name: string };

export type DemoSet = {
  key: string;
  label: string;
  owner: DemoAccount;
  sitter: DemoAccount;
  pets: [string, string];
  /** A Judge seat (#411): one browser holds the set at a time, and taking it resets both accounts. */
  judge?: boolean;
};

/**
 * Seeded demo accounts (OB.3). One owner and one sitter per teammate, so a reset only touches
 * the set of whoever asks for it. The first set is the default pair; the judges get the four judge sets (#411). Keep in sync with
 * backend/app/services/demo_accounts.py (the pets too), backend/scripts/seed_demo.py, README and Devpost. The password is a
 * public, demo-only value (architecture §4), never a real password or a service key.
 */
export const DEMO_SETS: DemoSet[] = [
  {
    key: "chloe",
    label: "Chloe",
    owner: { email: "demo-owner@goldito.test", name: "Robert" },
    sitter: { email: "demo-sitter@goldito.test", name: "Chloe" },
    pets: ["Max", "Mochi"],
  },
  {
    key: "paul",
    label: "Paul",
    owner: { email: "demo-owner-paul@goldito.test", name: "Peter" },
    sitter: { email: "demo-sitter-paul@goldito.test", name: "Paul" },
    pets: ["Biscuit", "Luna"],
  },
  {
    key: "allen",
    label: "Allen",
    owner: { email: "demo-owner-allen@goldito.test", name: "Alex" },
    sitter: { email: "demo-sitter-allen@goldito.test", name: "Allen" },
    pets: ["Cooper", "Olive"],
  },
  {
    key: "daniel",
    label: "Daniel",
    owner: { email: "demo-owner-daniel@goldito.test", name: "David" },
    sitter: { email: "demo-sitter-daniel@goldito.test", name: "Daniel" },
    pets: ["Teddy", "Leo"],
  },
  // Judge seats (#411): the story names (Robert, Chloe, Max, Mochi), one set per judge.
  ...[1, 2, 3, 4].map(
    (n): DemoSet => ({
      key: `judge${n}`,
      label: `Judge ${n}`,
      owner: { email: `demo-owner-judge${n}@goldito.test`, name: "Robert" },
      sitter: { email: `demo-sitter-judge${n}@goldito.test`, name: "Chloe" },
      pets: ["Max", "Mochi"],
      judge: true,
    }),
  ),
];

export const JUDGE_SETS = DEMO_SETS.filter((set) => set.judge);

/** The team's own sets, for the team build's picker. */
export const TEAM_SETS = DEMO_SETS.filter((set) => !set.judge);

export const DEFAULT_DEMO_SET = DEMO_SETS[0];

/** The default pair, for the places that do not choose a set. */
export const DEMO_ACCOUNTS: Record<Role, DemoAccount> = {
  owner: DEFAULT_DEMO_SET.owner,
  sitter: DEFAULT_DEMO_SET.sitter,
};

export const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD?.trim() ?? "";

/** Try demo is only offered when the build has the demo password. */
export const isDemoEnabled = DEMO_PASSWORD.length > 0;

/** The team's demo tools (set picker, reset) are in this build. A judging build leaves them out and offers only the Judge seats. */
export const isDemoToolsBuild = process.env.EXPO_PUBLIC_DEMO_TOOLS === "1";

export function isDemoRole(value: unknown): value is Role {
  return value === "owner" || value === "sitter";
}

export function demoSetFor(key: string | undefined): DemoSet {
  return DEMO_SETS.find((set) => set.key === key) ?? DEFAULT_DEMO_SET;
}

/** The demo set and role an email belongs to, or null for a real account. */
export function findDemoAccount(email: string | undefined | null): { set: DemoSet; role: Role; name: string } | null {
  const lowered = (email ?? "").toLowerCase();
  for (const set of DEMO_SETS) {
    if (set.owner.email === lowered) return { set, role: "owner", name: set.owner.name };
    if (set.sitter.email === lowered) return { set, role: "sitter", name: set.sitter.name };
  }
  return null;
}
