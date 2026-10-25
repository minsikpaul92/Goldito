import { Platform } from "react-native";
import { SvgXml } from "react-native-svg";

import { ART, ArtName } from "../../assets/art/artSvgs";

/**
 * A drawing from the Figma frames (`assets/art/<screen>/<file>.svg`, see scripts/art.mjs). It keeps the drawing's own
 * colors; `size` is the width and height in points (the drawings are square unless `height` says otherwise).
 */
// react-native-svg hands unknown props to the <svg> on the web, so the native pair would log a React warning there.
const HIDDEN = Platform.OS === "web" ? ({ "aria-hidden": true } as const) : ({ accessibilityElementsHidden: true, importantForAccessibility: "no" } as const);

export function Art({ name, size, height, testID }: { name: ArtName; size: number; height?: number; testID?: string }) {
  return <SvgXml xml={ART[name]} width={size} height={height ?? size} testID={testID} {...HIDDEN} />;
}
