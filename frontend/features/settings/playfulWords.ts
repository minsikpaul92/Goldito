import { useCallback, useSyncExternalStore } from "react";

import { WordKey, WordVars, wordFor } from "../../content/words";
import { loadLocal, saveLocal } from "../../lib/localState";

/**
 * Settings → Playful words: on by default (Minsik, Oct 25: "a little playful"). Kept on this device for now, so it
 * needs no backend change; it can move to the account with the notification switches later.
 */
const KEY = "goldito-playful-words";
let playful = loadLocal<boolean>(KEY, true);
const listeners = new Set<() => void>();

export function setPlayfulWords(on: boolean) {
  playful = on;
  saveLocal(KEY, on);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlayfulWords(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => playful, () => playful);
  return [on, setPlayfulWords];
}

/** `w(key, { pet, name })`: the line from content/words.ts, playful or plain as the person chose. */
export function useWords() {
  const [on] = usePlayfulWords();
  return useCallback((key: WordKey, vars?: WordVars) => wordFor(key, on, vars), [on]);
}
