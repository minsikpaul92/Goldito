import { Redirect, useLocalSearchParams } from "expo-router";

/** The Diary tab moved into Feed (#329): an old link to /sitter/diary (with its page) opens the diary there. */
export default function SitterDiaryMoved() {
  const { page } = useLocalSearchParams<{ page?: string }>();
  return <Redirect href={page ? `/sitter/feed?view=diary&page=${encodeURIComponent(page)}` : "/sitter/feed?view=diary"} />;
}
