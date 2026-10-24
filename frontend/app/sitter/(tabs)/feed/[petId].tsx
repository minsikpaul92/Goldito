import { Redirect, useLocalSearchParams } from "expo-router";

/** Links to one pet's feed (notices, chat cards, Home) open the Feed tab on that pet. */
export default function SitterPetFeedLink() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  return <Redirect href={`/sitter/feed?pet=${petId}`} />;
}
