import { HATS, type HatId } from "./sprites/hats";

/**
 * Things a pet can wear (11.12b). One hat for now: the Halloween pumpkin hat.
 *
 * Where an item comes from: `open_event` items belong to every owner while the event is open (the pumpkin hat is one
 * for now); `first_pet` items come with the first pet an owner registers (what the hat becomes after the event).
 */
export type PetItem = { id: HatId; slot: "hat"; emoji: string; source: "open_event" | "first_pet" };

export const PET_ITEMS: PetItem[] = [{ id: "pumpkin", slot: "hat", emoji: "🎃", source: "open_event" }];

export const itemName = (item: PetItem) => HATS[item.id].name;

/** The items an owner has: open-event ones always, first-pet ones once they have a pet. */
export function ownedItems(petCount: number): PetItem[] {
  return PET_ITEMS.filter((item) => item.source === "open_event" || petCount > 0);
}

/** A saved hat id (`pets.profile.hat`), or null when it is missing or not a hat we know. */
export function asHat(value: unknown): HatId | null {
  return typeof value === "string" && Object.hasOwn(HATS, value) ? (value as HatId) : null;
}
