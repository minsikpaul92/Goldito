import AsyncStorage from "@react-native-async-storage/async-storage";

import { OnboardingDraft } from "./questions";

/**
 * The sitter's answers in progress, kept on this device (U2: long flows keep a draft). The server copy is written only
 * when the sitter finishes; leaving halfway and coming back picks up here. Same pattern as owner sign-up's draft.
 */
const key = (userId: string) => `goldito.sitterOnboarding.${userId}`;

export async function loadLocalDraft(userId: string): Promise<OnboardingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

export async function saveLocalDraft(userId: string, draft: OnboardingDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(draft));
  } catch {
    // The draft is a convenience; the flow works without it.
  }
}

export async function clearLocalDraft(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {
    // Nothing to clean up.
  }
}
