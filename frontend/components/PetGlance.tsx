import { useEffect, useState } from "react";

import { PetGlanceCard } from "./PetGlanceCard";
import { PetGlanceData, loadPetGlance } from "../features/ownerOnboarding/petGlanceApi";

/**
 * The "at a glance" card of one pet for the screens a sitter or the owner looks at it on. Shows nothing while it loads
 * and for a pet the owner has not described yet (no answers, warnings or photos), so an old pet's card stays as it was.
 */
export function PetGlance({ petId, bare, testID }: { petId: string; bare?: boolean; testID?: string }) {
  const [data, setData] = useState<PetGlanceData | null>(null);

  useEffect(() => {
    let live = true;
    void loadPetGlance(petId).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [petId]);

  if (!data || !data.hasContent) return null;
  return (
    <PetGlanceCard
      name={data.name}
      species={data.species}
      facts={data.facts}
      coverPublicId={data.coverPublicId}
      profile={data.profile}
      allergens={data.allergens}
      bare={bare}
      testID={testID ?? `glance-${petId}`}
    />
  );
}
