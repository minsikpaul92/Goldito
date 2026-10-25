import { useEffect, useState } from "react";
import { Text } from "react-native";

import { PetGlanceCard } from "./PetGlanceCard";
import { useBreedNeeds } from "../features/ownerOnboarding/breedNeedsApi";
import { PetGlanceData, loadPetGlance } from "../features/ownerOnboarding/petGlanceApi";
import { useTheme } from "../providers/ThemeProvider";

/**
 * The "at a glance" card of one pet for the screens a sitter or the owner looks at it on. Shows nothing while it loads
 * and for a pet the owner has not described yet (no answers, warnings or photos), so an old pet's card stays as it was.
 */
export function PetGlance({ petId, bare, emptyText, testID }: { petId: string; bare?: boolean; emptyText?: string; testID?: string }) {
  const theme = useTheme();
  const [data, setData] = useState<PetGlanceData | null>(null);

  useEffect(() => {
    let live = true;
    void loadPetGlance(petId).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [petId]);

  const needs = useBreedNeeds(data?.species ?? null, data?.breed ?? null);
  if (data && !data.hasContent && emptyText) return <Text style={{ color: theme.color.textMuted, fontSize: theme.fontSize.body }} testID={`${testID ?? `glance-${petId}`}-empty`}>{emptyText}</Text>;
  if (!data || !data.hasContent) return null;
  return (
    <PetGlanceCard
      name={data.name}
      species={data.species}
      facts={data.facts}
      coverPublicId={data.coverPublicId}
      profile={data.profile}
      allergens={data.allergens}
      needs={needs}
      bare={bare}
      testID={testID ?? `glance-${petId}`}
    />
  );
}
