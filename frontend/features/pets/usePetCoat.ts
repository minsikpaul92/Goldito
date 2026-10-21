import { useEffect, useState } from "react";

import type { Coat } from "../ownerOnboarding/questions";
import { getPetCoat } from "./petApi";

/** The coat color of a pet the sitter cares for (the sprite falls back to a plain dog or cat while it loads or if none). */
export function usePetCoat(petId: string): Coat | null {
  const [coat, setCoat] = useState<Coat | null>(null);
  useEffect(() => {
    let live = true;
    void getPetCoat(petId).then((c) => live && setCoat(c));
    return () => {
      live = false;
    };
  }, [petId]);
  return coat;
}
