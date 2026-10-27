/**
 * The app inside a phone frame tells the page around it who is signed in, so the frame can name the account above
 * the phone. Same origin only; `pane` is the iframe's name ("" for the one-phone frame).
 */
export const ACCOUNT_MESSAGE = "goldito:account";

/** `judge`: the Judge seat's set key when the account belongs to one (#411), so the judge panel knows the seat. */
export type FrameAccount = { name: string; role: "owner" | "sitter"; judge?: string | null } | null;

/** `signedOut`: no one is signed in (an account of null while the app is still loading is not signed out). */
export type AccountMessage = { type: typeof ACCOUNT_MESSAGE; pane: string; account: FrameAccount; signedOut?: boolean };

export function isAccountMessage(data: unknown): data is AccountMessage {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === ACCOUNT_MESSAGE;
}

/** "Paul · Owner", or "Not logged in". */
export function accountLabel(account: FrameAccount | undefined): string {
  if (!account) return "Not logged in";
  return `${account.name} · ${account.role === "owner" ? "Owner" : "Sitter"}`;
}
