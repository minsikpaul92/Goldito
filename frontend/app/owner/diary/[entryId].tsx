import { Stack, useLocalSearchParams } from "expo-router";

import { OwnerDiaryBook } from "../../../features/diary/OwnerDiaryBook";

/**
 * One daily report (phase-07 7.3) — a notice or a Feed card opens the diary book on this page (Diary book DB.3);
 * turning the page goes to the days before and after. The text is read-only; the owner may decorate it (12.3b).
 */
export default function OwnerDiaryEntry() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Diary" }} />
      <OwnerDiaryBook initialId={entryId} />
    </>
  );
}
