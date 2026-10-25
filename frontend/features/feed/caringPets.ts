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
  ownerId: string;
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
        ownerId: b.ownerId,
        ownerName: b.ownerName,
        bookingId: b.id,
      });
    }
  }
  return out;
}

export type FeedPet = CaringPet & {
  /** In care right now; false = a stay that is over (the Feed stays, new photos are only for me). */
  caring: boolean;
};

/** Has this stay started (the sitter received the pet, or the agreed drop-off has passed)? Mirrors `has_cared_for` (015j). */
function hasStarted(b: BookingSummary, now: number): boolean {
  if (b.status !== "confirmed" || !b.dropOff || b.dropOff.pending || !b.pickUp || b.pickUp.pending) return false;
  return !!b.dropOff.completedAt || Date.parse(b.dropOff.at) <= now;
}

/** Every pet this sitter has cared for or is caring for, in care first, then the latest stay first (the Feed tab list). */
export function feedPetsFromBookings(bookings: BookingSummary[], now = Date.now()): FeedPet[] {
  const started = bookings
    .filter((b) => hasStarted(b, now))
    .sort((a, b) => Number(isCaring(b, now)) - Number(isCaring(a, now)) || Date.parse(b.pickUp!.at) - Date.parse(a.pickUp!.at));
  const out: FeedPet[] = [];
  const seen = new Set<string>();
  for (const b of started) {
    for (const p of b.pets) {
      if (!p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ id: p.id, name: p.name, species: p.species, ownerId: b.ownerId, ownerName: b.ownerName, bookingId: b.id, caring: isCaring(b, now) });
    }
  }
  return out;
}
