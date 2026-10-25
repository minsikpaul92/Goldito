import { getSupabase } from "../../lib/supabase";

/** 7 to 20 characters: digits, spaces and + ( ) - (the same rule as `profile_phones`). */
export const PHONE_RULE = /^[0-9+() -]{7,20}$/;

/** The signed-in person's own number (nobody else can read the table). */
export async function loadMyPhone(): Promise<string | null> {
  const { data, error } = await getSupabase().from("profile_phones").select("phone").maybeSingle();
  if (error) return null;
  return (data as { phone: string } | null)?.phone ?? null;
}

/** Saves the number; an empty one removes it. */
export async function saveMyPhone(profileId: string, phone: string | null): Promise<void> {
  const db = getSupabase();
  const { error } = phone
    ? await db.from("profile_phones").upsert({ profile_id: profileId, phone })
    : await db.from("profile_phones").delete().eq("profile_id", profileId);
  if (error) throw new Error("Couldn't save your phone number. Try again.");
}

/** The other person of a chat: the phone only once it may be shared, the area only for an owner. */
export type ChatContact = { otherId: string; name: string; phone: string | null; area: string | null };

export async function loadChatContact(threadId: string): Promise<ChatContact | null> {
  const { data, error } = await getSupabase().rpc("get_chat_contact", { p_thread: threadId });
  if (error) return null;
  const row = ((data ?? []) as { other_id: string; other_name: string; phone: string | null; area: string | null }[])[0];
  return row ? { otherId: row.other_id, name: row.other_name, phone: row.phone, area: row.area } : null;
}

/** Someone's phone, when it may be shared with me (a booking together and a Meet & Greet set); null otherwise. */
export async function loadContactPhone(otherId: string): Promise<string | null> {
  const { data, error } = await getSupabase().rpc("get_contact_phone", { p_other: otherId });
  return error ? null : ((data as string | null) ?? null);
}
