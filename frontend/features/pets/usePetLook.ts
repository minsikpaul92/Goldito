import { useEffect, useState } from "react";

import { getPetLook, type PetLook } from "./petApi";

/** The coat color and photo head of a pet the sitter cares for (the sprite falls back to a plain dog or cat while it loads or if none). */
export function usePetLook(petId: string): PetLook {
  const [look, setLook] = useState<PetLook>({ coat: null, breed: null, head: null });
  useEffect(() => {
    let live = true;
    void getPetLook(petId).then((l) => live && setLook(l));
    return () => {
      live = false;
    };
  }, [petId]);
  return look;
}
