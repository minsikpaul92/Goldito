import { getSupabase } from "../../lib/supabase";
import { Role } from "../../providers/SessionProvider";
import { OwnerProfile, SitterProfile } from "../../types/db";

const OWNER_COLUMNS =
  "home_address, emergency_contact_name, emergency_contact_phone, vet_clinic_name, vet_clinic_phone, meet_spots";

export type RoleProfile =
  | { role: "owner"; fields: OwnerProfile }
  | { role: "sitter"; fields: SitterProfile };

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

/**
 * The caller's owner_profiles row, or their sitter_profiles row through
 * get_my_sitter_profile() — home_address has no column grant, so select('*') would fail.
 */
export async function loadRoleProfile(userId: string, role: Role): Promise<RoleProfile> {
  const supabase = getSupabase();
  if (role === "owner") {
    const { data, error } = await supabase.from("owner_profiles").select(OWNER_COLUMNS).eq("id", userId).single();
    if (error || !data) fail("load your profile");
    const row = data as OwnerProfile;
    return { role, fields: { ...row, meet_spots: row.meet_spots ?? [] } };
  }
  const { data, error } = await supabase.rpc("get_my_sitter_profile").maybeSingle();
  if (error || !data) fail("load your profile");
  const row = data as SitterProfile;
  return {
    role,
    fields: {
      bio: row.bio,
      service_area: row.service_area,
      experience_years: row.experience_years,
      home_notes: row.home_notes,
      home_address: row.home_address,
      services: row.services ?? ["boarding"],
      meet_spots: row.meet_spots ?? [],
      visitor_parking: row.visitor_parking ?? null,
      lobby_notes: row.lobby_notes ?? null,
      packing_list: row.packing_list ?? null,
    },
  };
}

export async function saveProfile(userId: string, displayName: string, profile: RoleProfile): Promise<void> {
  const supabase = getSupabase();
  const { error: nameError } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", userId);
  if (nameError) fail("save your name");

  const table = profile.role === "owner" ? "owner_profiles" : "sitter_profiles";
  const { error } = await supabase.from(table).update(profile.fields).eq("id", userId);
  if (error) fail("save your profile");
}
