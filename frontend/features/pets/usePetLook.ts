import { useEffect, useState } from "react";

import { getPetLook, type PetLook } from "./petApi";

const NONE: PetLook = { coat: null, breed: null, weightKg: null, colors: null, hat: null, look: null };

/** The breed, weight, coat and photo colors of a pet the sitter cares for (the sprite falls back to a plain dog or cat while it loads, with no pet, or if none). */
export function usePetLook(petId: string | null): PetLook {
  const [look, setLook] = useState<PetLook>(NONE);
  useEffect(() => {
    let live = true;
    if (!petId) {
      setLook(NONE);
      return;
    }
    void getPetLook(petId).then((l) => live && setLook(l));
    return () => {
      live = false;
    };
  }, [petId]);
  return look;
}
