import { StyleSheet, View } from "react-native";

import { behaviorPose, poopVisible } from "../../features/pets/petBehavior";
import { usePetBehavior, type PetEvent } from "../../features/pets/usePetBehavior";
import type { HatId } from "../../features/pets/sprites/hats";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { SCENE_SIZE, POOP_SIZE, spritePoop } from "../../features/pets/sprites/scene";
import type { PetMood } from "../../lib/petStatus";
import type { Species } from "../../types/db";
import { PetSprite } from "./PetSprite";
import { PixelGrid } from "./PixelGrid";

type Props = {
  species: Species;
  coat?: unknown;
  breed?: string | null;
  colors?: PixelColors | null;
  hat?: HatId | null;
  mood: PetMood;
  /** Screen px of one sprite pixel. */
  pixel: number;
  /** Width of the room the pet walks in (px). */
  roomWidth: number;
  /** What the pet just did (ate, went potty): it shows it once. */
  event?: PetEvent | null;
  testID?: string;
};

/** The pet inside its room (11.12b): it walks, stops, turns around and lies down on its own; the mood leans what it does. */
export function RoamingPet({ species, coat, breed, colors, hat, mood, pixel, roomWidth, event, testID }: Props) {
  const spriteWidth = SCENE_SIZE * pixel;
  const maxX = Math.max(0, Math.floor((roomWidth - spriteWidth) / pixel));
  const b = usePetBehavior(mood, maxX, false, event ?? null);
  const poop = spritePoop();
  return (
    <>
      {b.poops.map((p) => (
        <View
          key={p.id}
          style={[styles.pet, { left: p.x * pixel, width: POOP_SIZE.w * pixel, height: POOP_SIZE.h * pixel, opacity: poopVisible(p) ? 1 : 0 }]}
          pointerEvents="none"
          testID={testID ? `${testID}-poop` : undefined}
        >
          <PixelGrid pixels={poop} pixel={pixel} />
        </View>
      ))}
      <View style={[styles.pet, { left: Math.min(b.x, maxX) * pixel, width: spriteWidth, height: spriteWidth }]} pointerEvents="none">
        <PetSprite
          species={species}
          coat={coat}
          breed={breed}
          colors={colors}
          hat={hat}
          mood={mood}
          pose={behaviorPose(b)}
          facing={b.facing}
          pixel={pixel}
          testID={testID}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pet: { position: "absolute", bottom: 0 },
});
