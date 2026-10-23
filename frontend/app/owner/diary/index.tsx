import { Redirect } from "expo-router";

/** The Diary tab moved into Feed (#329): an old link to /owner/diary opens the diary there. */
export default function OwnerDiaryMoved() {
  return <Redirect href="/owner/feed?view=diary" />;
}
