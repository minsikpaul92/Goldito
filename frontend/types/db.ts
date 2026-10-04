/** Supabase rows the app reads (hand-written; schema: supabase/migrations/001_initial_schema.sql). */

export type Species = "dog" | "cat";

export type PetAllergy = {
  id: string;
  allergen: string;
};

export type Pet = {
  id: string;
  owner_id: string;
  species: Species;
  name: string;
  breed: string | null;
  birthdate: string | null;
  weight_kg: number | null;
  notes: string | null;
  created_at: string;
  pet_allergies: PetAllergy[];
};

export type OwnerProfile = {
  home_address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  vet_clinic_name: string | null;
  vet_clinic_phone: string | null;
  /** Up to 3 public places for a first Meet & Greet (004, D44). */
  meet_spots: string[];
};

/** What the sitter sees of their own row via `get_my_sitter_profile()` (includes home_address). */
export type SitterProfile = {
  bio: string | null;
  service_area: string | null;
  experience_years: number | null;
  home_notes: string | null;
  home_address: string | null;
  /** At least one of boarding / house_sitting (004, D28). */
  services: ("boarding" | "house_sitting")[];
  meet_spots: string[];
  /** Shared with the owner only after demo pay (03C). */
  visitor_parking: string | null;
  lobby_notes: string | null;
  packing_list: string[] | null;
};

/** feed_posts.caption_source — AI in Phase 09, task captions in Phase 06. */
export type CaptionSource = "ai" | "fallback" | "task";

/** One Kidsnote-style feed card (1 post = 1 media, D10). */
export type FeedPostRow = {
  id: string;
  pet_id: string;
  sitter_id: string;
  media_id: string;
  caption: string | null;
  caption_source: CaptionSource | null;
  task_log_id: string | null;
  created_at: string;
};
