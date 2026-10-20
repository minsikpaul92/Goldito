import { useEffect, useState } from "react";
import { AccessibilityInfo, Image, ImageSourcePropType, View } from "react-native";

import { FRAME } from "../lib/petSprites";

type Props = {
  /** A strip from PET_SPRITES (or petSprite(pet, mood)). */
  source: ImageSourcePropType;
  /** Shown size in px; 96 or 192 keep the pixels crisp (the cells are 192 px). */
  size?: number;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * One pixel pet head from a 2-frame idle strip, flipping frames every FRAME.ms (#184).
 * With reduce motion on it holds the first frame.
 */
export function PixelPet({ source, size = 96, accessibilityLabel, testID }: Props) {
  const [frame, setFrame] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => alive && setStill(on));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (still) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % FRAME.count), FRAME.ms);
    return () => clearInterval(t);
  }, [still]);

  return (
    <View
      style={{ width: size, height: size, overflow: "hidden" }}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Image source={source} style={{ width: size * FRAME.count, height: size, transform: [{ translateX: -frame * size }] }} resizeMode="stretch" />
    </View>
  );
}
