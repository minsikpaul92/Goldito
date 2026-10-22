import { useEffect, useRef, useState } from "react";

import type { PetMood } from "../../lib/petStatus";
import { TICK_MS, initialBehavior, stepBehavior, type Behavior } from "./petBehavior";

/** The pet's behavior as it moves: a new state every tick. `maxX` is how far right it may go; `still` keeps it standing. */
export function usePetBehavior(mood: PetMood, maxX: number, still = false): Behavior {
  const [behavior, setBehavior] = useState<Behavior>(initialBehavior);
  const latest = useRef({ mood, maxX });
  latest.current = { mood, maxX };

  // Start in the middle of the room once its width is known.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || maxX <= 0) return;
    placed.current = true;
    setBehavior((b) => ({ ...b, x: Math.floor(maxX / 2) }));
  }, [maxX]);

  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => {
      setBehavior((b) => stepBehavior(b, latest.current.mood, Math.random, latest.current.maxX));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [still]);

  return behavior;
}
