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

export type CareTaskType = "medication" | "walk" | "feeding" | "litter" | "play" | "sleep";

export type CareCheckinKind = "meal" | "potty" | "walk" | "mood" | "note";

/** One repeating task the owner asks the sitter to do (care_tasks, phase-06). */
export type CareTaskRow = {
  id: string;
  pet_id: string;
  type: CareTaskType;
  title: string;
  dose: string | null;
  /** Postgres time, "HH:MM:SS" in the app timezone (D8). */
  scheduled_time: string;
  repeat_daily: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
};

/** Today's instance of a task (written by the sitter side from 6.2/6.4). */
export type TaskLogRow = {
  id: string;
  task_id: string;
  pet_id: string;
  due_at: string;
  status: "pending" | "done";
  completed_at: string | null;
};

/** feed_posts.caption_source — AI in Phase 09, task captions in Phase 06. */
export type CaptionSource = "ai" | "fallback" | "task";

/** One Kidsnote-style feed card (1 post = 1 media, D10). */
export type FeedVisibility = "shared" | "private";

export type FeedPostRow = {
  id: string;
  pet_id: string;
  /** Set for sitter posts only; owner posts have none. */
  sitter_id: string | null;
  /** The real author (sitter or owner) — only they can delete. */
  posted_by: string;
  /** shared = owner + on-duty sitter; private = author only (5.8). */
  visibility: FeedVisibility;
  media_id: string;
  caption: string | null;
  caption_source: CaptionSource | null;
  task_log_id: string | null;
  created_at: string;
};

export type MediaResourceType = "image" | "video";

/** media row fields the feed timeline needs (Cloudinary delivery via public_id). */
export type MediaRow = {
  id: string;
  pet_id: string;
  cloudinary_public_id: string;
  resource_type: MediaResourceType;
  purpose: string;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  created_at: string;
};

/** notifications row (Realtime INSERT → toast + badge; center in 5.5). */
export type NotificationRow = {
  id: string;
  user_id: string;
  pet_id: string | null;
  booking_id: string | null;
  type: string;
  ref_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};
