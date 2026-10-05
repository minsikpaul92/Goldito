import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { listOwnerBookings } from "../../lib/bookings";
import { useSession } from "../../providers/SessionProvider";
import { isCaring } from "../feed/caringPets";

export type InCare = { sitterName: string; until: string };

/** The owner's pets that are with a sitter right now → who has them and until when (pick-up time). */
export function useInCare(): Record<string, InCare> {
  const session = useSession();
  const ownerId = session.status === "signedIn" ? session.profile.id : null;
  const [inCare, setInCare] = useState<Record<string, InCare>>({});

  useFocusEffect(
    useCallback(() => {
      if (!ownerId) return;
      let live = true;
      void listOwnerBookings(ownerId)
        .then((bookings) => {
          if (!live) return;
          const next: Record<string, InCare> = {};
          for (const b of bookings) {
            if (!isCaring(b) || !b.pickUp) continue;
            for (const p of b.pets) if (p.id) next[p.id] = { sitterName: b.sitterName, until: b.pickUp.at };
          }
          setInCare(next);
        })
        .catch(() => undefined); // The badge is a bonus; Home works without it.
      return () => {
        live = false;
      };
    }, [ownerId]),
  );

  return inCare;
}
