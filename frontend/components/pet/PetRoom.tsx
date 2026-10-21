import type { ReactNode } from "react";

import { usePetRoom } from "../../features/pets/usePetRoom";
import type { Species } from "../../types/db";
import { PetRoomCard } from "./PetRoomCard";

type Props = {
  pet: { id: string; name: string; species: Species; coat?: unknown };
  onPress?: () => void;
  /** Bump to reload now, e.g. after the sitter taps a check-in. */
  reloadKey?: number;
  children?: ReactNode;
};

/** `PetRoomCard` with its data: one pet's room, live. */
export function PetRoom({ pet, onPress, reloadKey, children }: Props) {
  const status = usePetRoom(pet.id, reloadKey);
  return (
    <PetRoomCard name={pet.name} species={pet.species} coat={pet.coat} status={status} onPress={onPress} testID={`pet-room-${pet.name}`}>
      {children}
    </PetRoomCard>
  );
}
