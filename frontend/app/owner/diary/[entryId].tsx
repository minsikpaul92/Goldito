import { Stack, useLocalSearchParams } from "expo-router";

import { OwnerDiaryBook } from "../../../features/diary/OwnerDiaryBook";

/**
 * One daily report (phase-07 7.3) — a notice or a Feed card opens the diary book on this page (Diary book DB.3);
 * turning the page goes to the days before and after. The text is read-only; the owner may decorate it (12.3b).
 * The header ← is the only way back here: no "‹ Diaries" and no Write a page (diary audit, Oct 27).
 */
export default function OwnerDiaryEntry() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Diary" }} />
      <OwnerDiaryBook initialId={entryId} linked />
    </>
  );
}
