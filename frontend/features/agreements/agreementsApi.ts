import { getSupabase } from "../../lib/supabase";
import type { LocationType } from "../../lib/bookings";
import type { ServiceType } from "../sitters/sitterApi";
import {
  CONSENT_TEMPLATES,
  DEFAULT_EMERGENCY_LIMIT_CAD,
  type ConsentKind,
  type ConsentTemplate,
} from "./templates";

export type { ConsentKind, ConsentTemplate };
export { CONSENT_TEMPLATES, DEMO_CONSENT_FOOTER, DEFAULT_EMERGENCY_LIMIT_CAD } from "./templates";

/** Inputs needed to compute required consent kinds (same rules as SQL `required_consents`). */
export type ConsentBookingInput = {
  serviceType: ServiceType;
  /** True when any proposed/agreed handoff is at the owner's home. */
  hasOwnerHomeHandoff: boolean;
};

export type BookingConsent = {
  id: string;
  bookingId: string;
  kind: ConsentKind;
  version: string;
  signerId: string;
  signerName: string;
  details: Record<string, unknown>;
  signedAt: string;
};

export type SignConsentInput = {
  bookingId: string;
  kind: ConsentKind;
  signerName: string;
  /** Merged into details; emergency_vet / safe_return fill defaults when omitted. */
  details?: Record<string, unknown>;
  vetClinicName?: string | null;
  receiverName?: string | null;
  emergencyLimitCad?: number;
};

/**
 * Required consent kinds for a booking — keep in sync with
 * `public.required_consents` in 006_agreements.sql (phase-03c).
 */
export function requiredConsents(booking: ConsentBookingInput): ConsentKind[] {
  const kinds: ConsentKind[] = ["emergency_vet", "safe_return"];
  if (booking.serviceType === "boarding") {
    kinds.push("handoff_rules", "cohabitation");
  }
  if (booking.serviceType === "house_sitting" || booking.hasOwnerHomeHandoff) {
    kinds.push("home_access");
  }
  return kinds;
}

export function hasOwnerHomeHandoff(
  handoffs: { locationType: LocationType; status: string }[],
): boolean {
  return handoffs.some(
    (h) => h.locationType === "owner_home" && (h.status === "proposed" || h.status === "agreed"),
  );
}

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

/** Server-side required kinds (source of truth for Checkout / Pay). */
export async function fetchRequiredConsents(bookingId: string): Promise<ConsentKind[]> {
  const { data, error } = await getSupabase().rpc("required_consents", { p_booking: bookingId });
  if (error) fail("load the required consents");
  return (data ?? []) as ConsentKind[];
}

export async function listBookingConsents(bookingId: string): Promise<BookingConsent[]> {
  const { data, error } = await getSupabase()
    .from("booking_consents")
    .select("id, booking_id, kind, version, signer_id, signer_name, details, signed_at")
    .eq("booking_id", bookingId)
    .order("signed_at", { ascending: true });
  if (error) fail("load signed consents");
  return ((data ?? []) as {
    id: string;
    booking_id: string;
    kind: ConsentKind;
    version: string;
    signer_id: string;
    signer_name: string;
    details: Record<string, unknown> | null;
    signed_at: string;
  }[]).map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    kind: row.kind,
    version: row.version,
    signerId: row.signer_id,
    signerName: row.signer_name,
    details: row.details ?? {},
    signedAt: row.signed_at,
  }));
}

function detailsForKind(input: SignConsentInput): Record<string, unknown> {
  const base = { ...(input.details ?? {}) };
  if (input.kind === "emergency_vet") {
    return {
      ...base,
      limit_cad:
        input.emergencyLimitCad ?? (base.limit_cad as number | undefined) ?? DEFAULT_EMERGENCY_LIMIT_CAD,
      vet_clinic_name:
        input.vetClinicName ?? (base.vet_clinic_name as string | null | undefined) ?? null,
    };
  }
  if (input.kind === "safe_return") {
    return {
      ...base,
      receiver_name: input.receiverName ?? (base.receiver_name as string | undefined) ?? input.signerName,
    };
  }
  return base;
}

/** Owner signs one required consent. Re-signing the same kind fails (unique). */
export async function signConsent(input: SignConsentInput): Promise<BookingConsent> {
  const template = CONSENT_TEMPLATES[input.kind];
  const name = input.signerName.trim();
  if (!name) throw new Error("Enter your name to sign.");

  const { data: userData, error: userError } = await getSupabase().auth.getUser();
  if (userError || !userData.user) fail("confirm you are signed in");

  const row = {
    booking_id: input.bookingId,
    kind: input.kind,
    version: template.version,
    signer_id: userData.user.id,
    signer_name: name,
    details: detailsForKind(input),
  };

  const { data, error } = await getSupabase()
    .from("booking_consents")
    .insert(row)
    .select("id, booking_id, kind, version, signer_id, signer_name, details, signed_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("You already signed this consent.");
    }
    fail("save your signature");
  }

  const signed = data as {
    id: string;
    booking_id: string;
    kind: ConsentKind;
    version: string;
    signer_id: string;
    signer_name: string;
    details: Record<string, unknown> | null;
    signed_at: string;
  };
  return {
    id: signed.id,
    bookingId: signed.booking_id,
    kind: signed.kind,
    version: signed.version,
    signerId: signed.signer_id,
    signerName: signed.signer_name,
    details: signed.details ?? {},
    signedAt: signed.signed_at,
  };
}
