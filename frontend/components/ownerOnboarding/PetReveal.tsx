import { useEffect, useMemo, useRef } from "react";
import { Animated, View } from "react-native";

import { recipeFor } from "../../features/pets/sprites/petLook";
import type { Species } from "../../types/db";
import { PetRoomCard } from "../pet/PetRoomCard";

type Props = {
  name: string;
  species: Species;
  breed: string;
  coat: string;
  weightKg: number | null;
  /** Called once the room has faded in. */
  onDone: () => void;
  testID?: string;
};

const FADE_MS = 900;
// Short enough that title, room and button fit a 704 px phone without scrolling.
const ROOM_HEIGHT = 320;

/** The pet room of sign-up: the same screen as the pet's page, with the pet walking, turning and lying down. Mount it again to play it again. */
export function PetReveal({ name, species, breed, coat, weightKg, onDone, testID }: Props) {
  const recipe = useMemo(() => recipeFor({ species, breed, coat, weightKg }), [species, breed, coat, weightKg]);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: false }).start(({ finished }) => {
      if (finished) onDone();
    });
    // Plays once per mount; onDone only flips a flag in the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${species} in 8-bit, build ${recipe.build ?? 0}, coat ${recipe.colors?.coat ?? "default"}`}
      style={{ alignSelf: "stretch", height: ROOM_HEIGHT, marginTop: -8 }}
      testID={testID}
    >
      <Animated.View style={{ flex: 1, opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
        <PetRoomCard name={name} species={species} breed={breed} coat={coat} weightKg={weightKg} status={null} />
      </Animated.View>
    </View>
  );
}
