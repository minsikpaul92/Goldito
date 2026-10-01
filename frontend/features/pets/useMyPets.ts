import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { useSession } from "../../providers/SessionProvider";
import { Pet } from "../../types/db";
import { listMyPets } from "./petApi";

type State =
  | { status: "loading"; pets: Pet[]; error: null }
  | { status: "ready"; pets: Pet[]; error: null }
  | { status: "error"; pets: Pet[]; error: string };

/** The signed-in owner's pets with allergies; refetched whenever the screen gains focus. */
export function useMyPets() {
  const { profile } = useSession();
  const ownerId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading", pets: [], error: null });

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      const pets = await listMyPets(ownerId);
      setState({ status: "ready", pets, error: null });
    } catch (error) {
      setState((prev) => ({ status: "error", pets: prev.pets, error: (error as Error).message }));
    }
  }, [ownerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { ...state, reload: load };
}
