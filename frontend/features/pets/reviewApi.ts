import { apiPost } from "../../lib/api";
import { getSupabase } from "../../lib/supabase";

/** The sitter's review of one pet after a stay (#407, 015u). Read by the pet's owner and every sitter. */
export type PetReview = {
  id: string;
  petId: string;
  bookingId: string;
  sitterId: string;
  /** First name only, like every other review. */
  sitterName: string;
  chips: string[];
  note: string | null;
  stayFrom: string | null;
  stayTo: string | null;
  createdAt: string;
};

export const REVIEW_NOTE_MAX = 200;

/** Offered when the chips API can't be reached, so the sitter can still pick something. */
const FALLBACK_CHIPS = ["A joy to look after", "Would happily sit again"];

const COLUMNS =
  "id, pet_id, booking_id, sitter_id, chips, note, stay_from, stay_to, created_at, sitter:profiles!pet_reviews_sitter_id_fkey (display_name)";

type Row = {
  id: string;
  pet_id: string;
  booking_id: string;
  sitter_id: string;
  chips: string[] | null;
  note: string | null;
  stay_from: string | null;
  stay_to: string | null;
  created_at: string;
  sitter: { display_name: string | null } | { display_name: string | null }[] | null;
};

function toReview(r: Row): PetReview {
  const sitter = Array.isArray(r.sitter) ? r.sitter[0] : r.sitter;
  return {
    id: r.id,
    petId: r.pet_id,
    bookingId: r.booking_id,
    sitterId: r.sitter_id,
    sitterName: (sitter?.display_name ?? "").split(" ")[0] || "A sitter",
    chips: r.chips ?? [],
    note: r.note,
    stayFrom: r.stay_from,
    stayTo: r.stay_to,
    createdAt: r.created_at,
  };
}

/** A pet's reviews, newest first. */
export async function listPetReviews(petId: string): Promise<PetReview[]> {
  const { data, error } = await getSupabase()
    .from("pet_reviews")
    .select(COLUMNS)
    .eq("pet_id", petId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load reviews. Check your connection and try again.");
  return ((data ?? []) as unknown as Row[]).map(toReview);
}

/** The reviews written for one stay, one per pet. */
export async function listBookingReviews(bookingId: string): Promise<PetReview[]> {
  const { data, error } = await getSupabase().from("pet_reviews").select(COLUMNS).eq("booking_id", bookingId);
  if (error) return [];
  return ((data ?? []) as unknown as Row[]).map(toReview);
}

/** Chips for one pet from the stay (Nemotron, else the stay's check-ins); never fails. */
export async function suggestReviewChips(bookingId: string, petId: string): Promise<string[]> {
  try {
    const res = await apiPost<{ chips: string[] }>("/api/ai/pet-review-chips", { booking_id: bookingId, pet_id: petId });
    return res.chips.length > 0 ? res.chips : FALLBACK_CHIPS;
  } catch {
    return FALLBACK_CHIPS;
  }
}

/** Saves (or replaces) the sitter's review of a pet for this stay. RLS: the stay's sitter, after Returned. */
export async function savePetReview(bookingId: string, petId: string, chips: string[], note: string): Promise<void> {
  const db = getSupabase();
  const { data: auth } = await db.auth.getSession();
  const me = auth.session?.user.id;
  if (!me) throw new Error("Sign in again to save the review.");
  const { error } = await db.from("pet_reviews").upsert(
    { booking_id: bookingId, pet_id: petId, sitter_id: me, chips, note: note.trim() || null },
    { onConflict: "booking_id,pet_id" },
  );
  if (error) throw new Error("Couldn't save the review. Check your connection and try again.");
}
