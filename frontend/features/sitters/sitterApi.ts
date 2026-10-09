import { getSupabase } from "../../lib/supabase";

export type ServiceType = "boarding" | "house_sitting";

export const SERVICE_LABEL: Record<ServiceType, string> = {
  boarding: "🏠 Boarding",
  house_sitting: "🔑 House sitting",
};

/** A sitter as owners see them — never the home address or meeting spots (002 / 004 grants). */
export type SitterSummary = {
  id: string;
  displayName: string;
  bio: string | null;
  serviceArea: string | null;
  experienceYears: number | null;
  services: ServiceType[];
};

/** "Your sitters": sitters this owner has had a confirmed booking with (list_my_sitters). */
export type MySitter = SitterSummary & { bookingCount: number; lastBookingAt: string; isFavorite: boolean };

export type SitterProfileView = SitterSummary & { homeNotes: string | null };

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

/** My favorite sitters (011h, FB-28) — private to me; they come first wherever I pick a sitter. */
export async function listFavoriteSitterIds(): Promise<string[]> {
  const { data, error } = await getSupabase().from("owner_favorite_sitters").select("sitter_id");
  if (error) fail("load your favorites");
  return ((data ?? []) as { sitter_id: string }[]).map((r) => r.sitter_id);
}

export async function setFavoriteSitter(sitterId: string, favorite: boolean): Promise<void> {
  const table = getSupabase().from("owner_favorite_sitters");
  const { error } = favorite ? await table.insert({ sitter_id: sitterId }) : await table.delete().eq("sitter_id", sitterId);
  if (error && !(favorite && error.code === "23505")) fail(favorite ? "add the favorite" : "remove the favorite");
}

/** Favorites first, otherwise the order stays as it was (a stable sort). */
export function favoritesFirst<T>(list: T[], favorites: ReadonlySet<string>, idOf: (item: T) => string): T[] {
  return [...list].sort((a, b) => Number(favorites.has(idOf(b))) - Number(favorites.has(idOf(a))));
}

export async function listMySitters(): Promise<MySitter[]> {
  const [{ data, error }, favoriteIds] = await Promise.all([
    getSupabase().rpc("list_my_sitters"),
    listFavoriteSitterIds().catch(() => [] as string[]),
  ]);
  if (error) fail("load your sitters");
  const favorites = new Set(favoriteIds);
  const sitters = ((data ?? []) as {
    sitter_id: string;
    display_name: string;
    bio: string | null;
    service_area: string | null;
    experience_years: number | null;
    services: ServiceType[] | null;
    booking_count: number;
    last_booking_at: string;
  }[]).map((s) => ({
    id: s.sitter_id,
    displayName: s.display_name,
    bio: s.bio,
    serviceArea: s.service_area,
    experienceYears: s.experience_years,
    services: s.services ?? ["boarding"],
    bookingCount: Number(s.booking_count),
    lastBookingAt: s.last_booking_at,
    isFavorite: favorites.has(s.sitter_id),
  }));
  return favoritesFirst(sitters, favorites, (s) => s.id);
}

/**
 * Public sitter profile: name from `profiles` (sitters are readable by everyone), the rest
 * from listed `sitter_profiles` columns — select('*') would fail on home_address.
 */
export async function getSitterProfile(sitterId: string): Promise<SitterProfileView | null> {
  const supabase = getSupabase();
  const [person, details] = await Promise.all([
    supabase.from("profiles").select("id, display_name, role").eq("id", sitterId).maybeSingle(),
    supabase
      .from("sitter_profiles")
      .select("id, bio, service_area, experience_years, home_notes, services")
      .eq("id", sitterId)
      .maybeSingle(),
  ]);
  if (person.error || details.error) fail("load this sitter");
  const p = person.data as { display_name: string; role: string } | null;
  const d = details.data as {
    bio: string | null;
    service_area: string | null;
    experience_years: number | null;
    home_notes: string | null;
    services: ServiceType[] | null;
  } | null;
  if (!p || p.role !== "sitter") return null;
  return {
    id: sitterId,
    displayName: p.display_name,
    bio: d?.bio ?? null,
    serviceArea: d?.service_area ?? null,
    experienceYears: d?.experience_years ?? null,
    homeNotes: d?.home_notes ?? null,
    services: d?.services ?? ["boarding"],
  };
}

/** "North York · 3 yrs experience" */
export function sitterMeta(s: SitterSummary): string {
  const parts = [s.serviceArea, s.experienceYears != null ? `${s.experienceYears} yrs experience` : null];
  return parts.filter(Boolean).join(" · ");
}
