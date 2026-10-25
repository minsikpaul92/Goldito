import { View } from "react-native";

import { Art } from "./art/Art";
import { Icon } from "./ui/Icon";
import type { FeedFilterKey } from "../lib/feed";

/**
 * The drawing of a Feed tag at `size` (the chips and the photo badges, Figma 1730:104035): meals, walks and naps are the
 * Figma drawings, mood and potty are the Home tile drawings, No tag is a line tag.
 */
export function FeedTagIcon({ tag, size, color }: { tag: FeedFilterKey; size: number; color: string }) {
  switch (tag) {
    case "all":
      // The paw is drawn smaller than its 28 px slot: the Figma frame insets it.
      return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <Art name="feed/all-paw" size={(size * 17.0333) / 28} height={(size * 16.3333) / 28} />
        </View>
      );
    case "meal":
      return <Art name="feed/chip-meals" size={size} />;
    case "walk":
      return <Art name="feed/chip-walks" size={size} />;
    case "nap":
      return <Art name="feed/chip-naps" size={size} />;
    case "mood":
      return <Art name="sitter/mood" size={size} />;
    case "potty":
      return <Art name="sitter/potty" size={size} />;
    default:
      return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <Icon name="price" size={Math.round(size * 0.7)} color={color} />
        </View>
      );
  }
}
