import { useSession } from "../providers/SessionProvider";

/**
 * Team accounts that may edit a pet's look (the Pet maker): `EXPO_PUBLIC_ADMIN_EMAILS`, comma separated.
 * Everyone else gets the look from the pet profile (breed, coat, weight, photo colors).
 * The app only hides the editor; the database does not check it yet.
 */
const ADMIN_EMAILS: string[] = String(process.env.EXPO_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Whether the signed-in person is on the team's admin list. */
export function useIsAdmin(): boolean {
  const session = useSession();
  return session.status === "signedIn" && isAdmin(session.session.user.email);
}
