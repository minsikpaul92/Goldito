import { useEffect, useRef, useState } from "react";

import type { PetMood } from "../../lib/petStatus";
import { TICK_MS, initialBehavior, seekBehavior, stepBehavior, triggerBehavior, wakeBehavior, type Behavior, type Goal } from "./petBehavior";

/** Something the pet just did that the room shows: the sitter fed it or it went potty. `id` tells a new one from one already shown. */
export type PetEvent = { id: string; kind: "eat" | "poop" };

/**
 * The pet's behavior as it moves: a new state every tick. `maxX` is how far right it may go; `still` keeps it standing;
 * a new `event` makes it eat at a bowl or squat and leave a poop (the room clears it after a while). A `goal` sends it
 * somewhere on purpose (the owner's room: bed, bowl, photo, ball) instead of wandering.
 */
export function usePetBehavior(mood: PetMood, maxX: number, still = false, event: PetEvent | null = null, goal: Goal | null = null): Behavior {
  const [behavior, setBehavior] = useState<Behavior>(initialBehavior);
  const latest = useRef({ mood, maxX, goal });
  latest.current = { mood, maxX, goal };

  // Start in the middle of the room once its width is known.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || maxX <= 0) return;
    placed.current = true;
    setBehavior((b) => ({ ...b, x: Math.floor(maxX / 2) }));
  }, [maxX]);

  // When the mood leaves sleepy the pet gets up (the sitter tapped Awake).
  const wasSleepy = useRef(mood === "sleepy");
  useEffect(() => {
    if (wasSleepy.current && mood !== "sleepy") setBehavior((b) => wakeBehavior(b));
    wasSleepy.current = mood === "sleepy";
  }, [mood]);

  // An event is shown once.
  const shown = useRef<string | null>(null);
  const eventId = event?.id ?? null;
  const eventKind = event?.kind ?? null;
  useEffect(() => {
    if (!eventId || !eventKind || shown.current === eventId) return;
    shown.current = eventId;
    setBehavior((b) => triggerBehavior(b, eventKind, latest.current.mood));
  }, [eventId, eventKind]);

  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => {
      const { mood: m, maxX: wall, goal: g } = latest.current;
      setBehavior((b) => (g && b.action !== "eat" && b.action !== "poop" ? seekBehavior(b, g) : stepBehavior(b, m, Math.random, wall)));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [still]);

  return behavior;
}
