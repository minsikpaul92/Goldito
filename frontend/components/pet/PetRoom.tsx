import type { ReactNode } from "react";

import type { PetStatus } from "../../lib/petStatus";

import { usePetRoom } from "../../features/pets/usePetRoom";
import type { HatId } from "../../features/pets/sprites/hats";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import type { Species } from "../../types/db";
import { PetRoomCard } from "./PetRoomCard";

type Props = {
  pet: { id: string; name: string; species: Species; coat?: unknown; breed?: string | null; weightKg?: number | null; colors?: PixelColors | null; hat?: HatId | null };
  onPress?: () => void;
  /** Bump to reload now, e.g. after the sitter taps a check-in. */
  reloadKey?: number;
  /** Under the HUD; a function gets the pet's status (the sitter's Nap turns into Awake while it sleeps). */
  children?: ReactNode | ((status: PetStatus | null) => ReactNode);
};

/** `PetRoomCard` with its data: one pet's room, live. */
export function PetRoom({ pet, onPress, reloadKey, children }: Props) {
  const { status, event } = usePetRoom(pet.id, reloadKey);
  return (
    <PetRoomCard name={pet.name} species={pet.species} coat={pet.coat} breed={pet.breed} weightKg={pet.weightKg} colors={pet.colors} hat={pet.hat} status={status} event={event} onPress={onPress} testID={`pet-room-${pet.name}`}>
      {typeof children === "function" ? children(status) : children}
    </PetRoomCard>
  );
}
