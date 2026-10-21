import type { LocationType } from "../../lib/bookings";
import { getSupabase } from "../../lib/supabase";

/**
 * Handoff defaults (3D.8). The owner has one usual place (the last one they sent a request with, saved on
 * `owner_profiles.default_handoff`); the sitter's is the onboarding answer `handoff`. Matching means the request needs
 * no talking; a request that differs from the sitter's default is the sitter's cue to suggest another.
 */

/** The places a sitter's onboarding answer accepts. `null` = no answer: no preference. */
export function waysFromAnswer(choice: string | null | undefined): LocationType[] | null {
  if (!choice) return null;
  const ways: LocationType[] = [];
  if (choice.includes("sitter_picks_up")) ways.push("owner_home");
  if (choice.includes("owner_brings")) ways.push("sitter_home");
  return ways.length > 0 ? ways : null;
}

/** Whether a place fits the sitter's default (no preference fits everything; "somewhere else" fits no stated one). */
export function fitsWays(ways: LocationType[] | null, place: LocationType): boolean {
  return ways === null || ways.includes(place);
}

/** The place a new request opens with: the owner's own default, else the sitter's when it is one place, else the sitter's. */
export function openingPlace(owner: LocationType | null, sitterWays: LocationType[] | null): LocationType {
  if (owner === "owner_home" || owner === "sitter_home") return owner;
  if (sitterWays && sitterWays.length === 1) return sitterWays[0];
  return "sitter_home";
}

export async function loadOwnerDefault(userId: string): Promise<LocationType | null> {
  const { data } = await getSupabase().from("owner_profiles").select("default_handoff").eq("id", userId).maybeSingle();
  return ((data as { default_handoff: LocationType | null } | null)?.default_handoff ?? null) as LocationType | null;
}

export async function saveOwnerDefault(userId: string, place: LocationType): Promise<void> {
  await getSupabase().from("owner_profiles").update({ default_handoff: place }).eq("id", userId);
}

export async function loadSitterWays(sitterId: string): Promise<LocationType[] | null> {
  const { data } = await getSupabase()
    .from("sitter_profile_answers")
    .select("choice")
    .eq("sitter_id", sitterId)
    .eq("question_key", "handoff")
    .maybeSingle();
  return waysFromAnswer((data as { choice: string | null } | null)?.choice);
}
