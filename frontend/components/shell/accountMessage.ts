/**
 * The app inside a phone frame tells the page around it who is signed in, so the frame can name the account above
 * the phone. Same origin only; `pane` is the iframe's name ("" for the one-phone frame).
 */
export const ACCOUNT_MESSAGE = "goldito:account";

export type FrameAccount = { name: string; role: "owner" | "sitter" } | null;

export type AccountMessage = { type: typeof ACCOUNT_MESSAGE; pane: string; account: FrameAccount };

export function isAccountMessage(data: unknown): data is AccountMessage {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === ACCOUNT_MESSAGE;
}

/** "Paul · Owner", or "Not signed in". */
export function accountLabel(account: FrameAccount | undefined): string {
  if (!account) return "Not signed in";
  return `${account.name} · ${account.role === "owner" ? "Owner" : "Sitter"}`;
}
