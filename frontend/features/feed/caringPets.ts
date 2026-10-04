import type { BookingSummary } from "../../lib/bookings";

/** Pets with this sitter right now: received and not returned, or inside the agreed stay. */
export function isCaring(b: BookingSummary, now = Date.now()): boolean {
  if (b.status !== "confirmed" || !b.dropOff || !b.pickUp || b.pickUp.completedAt) return false;
  return !!b.dropOff.completedAt || (Date.parse(b.dropOff.at) <= now && now < Date.parse(b.pickUp.at));
}

export type CaringPet = {
  id: string;
  name: string;
  species: "dog" | "cat";
  ownerName: string;
  bookingId: string;
};

/** Unique pets currently in the sitter's care (for Feed tab + Home → pet feed). */
export function caringPetsFromBookings(bookings: BookingSummary[], now = Date.now()): CaringPet[] {
  const out: CaringPet[] = [];
  const seen = new Set<string>();
  for (const b of bookings) {
    if (!isCaring(b, now)) continue;
    for (const p of b.pets) {
      if (!p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({
        id: p.id,
        name: p.name,
        species: p.species,
        ownerName: b.ownerName,
        bookingId: b.id,
      });
    }
  }
  return out;
}
