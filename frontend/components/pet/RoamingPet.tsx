import { StyleSheet, View } from "react-native";

import { behaviorFrame } from "../../features/pets/petBehavior";
import { usePetBehavior } from "../../features/pets/usePetBehavior";
import type { HatId } from "../../features/pets/sprites/hats";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { SCENE_SIZE } from "../../features/pets/sprites/scene";
import type { PetMood } from "../../lib/petStatus";
import type { Species } from "../../types/db";
import { PetSprite } from "./PetSprite";

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
  testID?: string;
};

/** The pet inside its room (11.12b): it walks, stops, turns around and lies down on its own; the mood leans what it does. */
export function RoamingPet({ species, coat, breed, colors, hat, mood, pixel, roomWidth, testID }: Props) {
  const spriteWidth = SCENE_SIZE * pixel;
  const maxX = Math.max(0, Math.floor((roomWidth - spriteWidth) / pixel));
  const b = usePetBehavior(mood, maxX);
  return (
    <View style={[styles.pet, { left: Math.min(b.x, maxX) * pixel, width: spriteWidth, height: spriteWidth }]} pointerEvents="none">
      <PetSprite
        species={species}
        coat={coat}
        breed={breed}
        colors={colors}
        hat={hat}
        mood={mood}
        pose={{ view: b.view, action: b.action, frame: behaviorFrame(b) }}
        facing={b.facing}
        pixel={pixel}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pet: { position: "absolute", bottom: 0 },
});
