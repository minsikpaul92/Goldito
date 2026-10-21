import { getSupabase } from "../../lib/supabase";

export type PetMedal = {
  id: string;
  petId: string;
  bookingId: string;
  sitterName: string;
  stayFrom: string;
  stayTo: string;
  awardedAt: string;
};

const COLUMNS = "id, pet_id, booking_id, stay_from, stay_to, awarded_at, sitter:profiles!pet_medals_sitter_id_fkey (display_name)";

type Row = {
  id: string;
  pet_id: string;
  booking_id: string;
  stay_from: string;
  stay_to: string;
  awarded_at: string;
  sitter: { display_name: string | null } | { display_name: string | null }[] | null;
};

function toMedal(r: Row): PetMedal {
  const sitter = Array.isArray(r.sitter) ? r.sitter[0] : r.sitter;
  return {
    id: r.id,
    petId: r.pet_id,
    bookingId: r.booking_id,
    sitterName: sitter?.display_name ?? "Your sitter",
    stayFrom: r.stay_from,
    stayTo: r.stay_to,
    awardedAt: r.awarded_at,
  };
}

/** A pet's medals, newest first (RLS: its owner, and the sitter who gave them). */
export async function listPetMedals(petId: string): Promise<PetMedal[]> {
  const { data, error } = await getSupabase()
    .from("pet_medals")
    .select(COLUMNS)
    .eq("pet_id", petId)
    .order("awarded_at", { ascending: false });
  if (error) throw new Error("Couldn't load medals. Check your connection and try again.");
  return ((data ?? []) as unknown as Row[]).map(toMedal);
}

/** The medals given for one stay, so the sitter sees which pets already have theirs. */
export async function listBookingMedalPetIds(bookingId: string): Promise<string[]> {
  const { data, error } = await getSupabase().from("pet_medals").select("pet_id").eq("booking_id", bookingId);
  if (error) return [];
  return (data ?? []).map((r) => r.pet_id as string);
}

/** The sitter gives a pet a medal once the stay is over (a second call changes nothing). */
export async function awardPetMedal(bookingId: string, petId: string): Promise<void> {
  const { error } = await getSupabase().rpc("award_pet_medal", { p_booking: bookingId, p_pet: petId });
  if (error) {
    if (error.message.includes("stay_not_finished")) throw new Error("A medal can be given once the pets are back.");
    throw new Error("Couldn't give the medal. Check your connection and try again.");
  }
}
