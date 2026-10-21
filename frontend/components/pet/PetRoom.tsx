import type { ReactNode } from "react";

import { usePetRoom } from "../../features/pets/usePetRoom";
import type { Species } from "../../types/db";
import { PetRoomCard } from "./PetRoomCard";

type Props = {
  pet: { id: string; name: string; species: Species; coat?: unknown };
  onPress?: () => void;
  /** Bump to reload now, e.g. after the sitter taps a check-in. */
  reloadKey?: number;
  /** The smaller layout of the sitter's Home. */
  compact?: boolean;
  children?: ReactNode;
};

/** `PetRoomCard` with its data: one pet's room, live. */
export function PetRoom({ pet, onPress, reloadKey, compact, children }: Props) {
  const status = usePetRoom(pet.id, reloadKey);
  return (
    <PetRoomCard name={pet.name} species={pet.species} coat={pet.coat} status={status} onPress={onPress} compact={compact} testID={`pet-room-${pet.name}`}>
      {children}
    </PetRoomCard>
  );
}
