import { apiPost } from "../../lib/api";
import { getSupabase } from "../../lib/supabase";

/** Treat check (Phase 12.1, D61): `POST /api/ai/safety-check` and the saved checks (`safety_checks`, 013). */
export type SafetyStatus = "SAFE" | "WARNING" | "DANGER";

export type HiddenSource = { ingredient: string; may_contain: string; reason: string };
export type SafetySource = { title: string; url: string; domain: string };

/** The server's answer — the same shape is saved in `safety_checks.result_json`. */
export type SafetyResult = {
  safety_status: SafetyStatus;
  product_name: string | null;
  detected_ingredients: string[];
  matched_allergens: string[];
  hidden_sources: HiddenSource[];
  toxic_ingredients: string[];
  unknown_ingredients: string[];
  sources: SafetySource[];
  /** Tavily did not answer: the result stands on the label, the rules and the model only. */
  sources_unavailable: boolean;
  /** The reasoning model did not answer: rules only, and never SAFE. */
  double_checked: boolean;
  warning_message: string;
};

export type SafetyCheck = SafetyResult & {
  id: string;
  petId: string;
  acknowledgedAt: string | null;
  createdAt: string;
};

type CheckResponse = SafetyResult & { safety_check_id: string; model: string; latency_ms: number };

type CheckRow = {
  id: string;
  pet_id: string;
  safety_status: SafetyStatus;
  result_json: Partial<SafetyResult> | null;
  acknowledged_at: string | null;
  created_at: string;
};

const CHECK_COLUMNS = "id, pet_id, safety_status, result_json, acknowledged_at, created_at";

/** Older rows or a partial `result_json` still render: every list defaults to empty. */
function fromRow(row: CheckRow): SafetyCheck {
  const r = row.result_json ?? {};
  return {
    id: row.id,
    petId: row.pet_id,
    safety_status: row.safety_status,
    product_name: r.product_name ?? null,
    detected_ingredients: r.detected_ingredients ?? [],
    matched_allergens: r.matched_allergens ?? [],
    hidden_sources: r.hidden_sources ?? [],
    toxic_ingredients: r.toxic_ingredients ?? [],
    unknown_ingredients: r.unknown_ingredients ?? [],
    sources: r.sources ?? [],
    sources_unavailable: r.sources_unavailable ?? false,
    double_checked: r.double_checked ?? true,
    warning_message: r.warning_message ?? "",
    acknowledgedAt: row.acknowledged_at,
    createdAt: row.created_at,
  };
}

/** Reads the label and checks it for this pet (the vision model, the rule table, Tavily, Ultra — up to about a minute). */
export async function checkTreat(petId: string, mediaId: string): Promise<SafetyCheck> {
  const res = await apiPost<CheckResponse>("/api/ai/safety-check", { pet_id: petId, media_id: mediaId });
  return {
    ...res,
    id: res.safety_check_id,
    petId,
    acknowledgedAt: null,
    createdAt: new Date().toISOString(),
  };
}

/** The pet's last checks, newest first (both people on the pet can read them — 002). */
export async function listRecentChecks(petId: string, limit = 10): Promise<SafetyCheck[]> {
  const { data, error } = await getSupabase()
    .from("safety_checks")
    .select(CHECK_COLUMNS)
    .eq("pet_id", petId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Couldn't load recent checks.");
  return ((data ?? []) as CheckRow[]).map(fromRow);
}

/** One saved check — opened from the owner's `safety_danger` notice. */
export async function getCheck(checkId: string): Promise<SafetyCheck | null> {
  const { data, error } = await getSupabase().from("safety_checks").select(CHECK_COLUMNS).eq("id", checkId).maybeSingle();
  if (error) throw new Error("Couldn't load this check.");
  return data ? fromRow(data as CheckRow) : null;
}

/** "I understand — don't feed": the only column a client may change (002 grant, 013 lets the owner too). */
export async function acknowledgeCheck(checkId: string): Promise<string> {
  const at = new Date().toISOString();
  const { error } = await getSupabase().from("safety_checks").update({ acknowledged_at: at }).eq("id", checkId);
  if (error) throw new Error("Couldn't save that. Try again.");
  return at;
}
