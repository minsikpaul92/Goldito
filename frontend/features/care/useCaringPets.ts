import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { listSitterBookings } from "../../lib/bookings";
import { useSession } from "../../providers/SessionProvider";
import { CaringPet, caringPetsFromBookings } from "../feed/caringPets";

export type CaringState =
  | { status: "loading" }
  | { status: "ready"; pets: CaringPet[] }
  | { status: "error"; message: string };

/** The pets the signed-in sitter is caring for right now (reloads when the screen is focused). */
export function useCaringPets() {
  const { profile } = useSession();
  const sitterId = profile?.id;
  const [state, setState] = useState<CaringState>({ status: "loading" });

  const load = useCallback(async () => {
    if (!sitterId) return;
    try {
      const bookings = await listSitterBookings(sitterId);
      setState({ status: "ready", pets: caringPetsFromBookings(bookings.filter((b) => b.status === "confirmed")) });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [sitterId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { state, reload: load };
}
