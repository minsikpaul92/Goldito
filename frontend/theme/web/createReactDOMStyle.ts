// Web only (metro.config.js sends react-native-web's own createReactDOMStyle here): the "System" font stack gets
// Plus Jakarta Sans in front, so every Text and TextInput uses it without naming a font. Styles that name a font
// (Fredoka titles) keep theirs. The face itself is loaded by theme/bodyFont.web.ts.
import original from "react-native-web/dist/exports/StyleSheet/compiler/createReactDOMStyle";

const SYSTEM = "-apple-system,BlinkMacSystemFont";
export const BODY_FONT = "Plus Jakarta Sans";

export default function createReactDOMStyle(style: object, isInline?: boolean) {
  const out = original(style, isInline);
  for (const key of ["font", "fontFamily"]) {
    const v = out[key];
    if (typeof v === "string" && v.includes(SYSTEM)) out[key] = v.replace(SYSTEM, `"${BODY_FONT}",${SYSTEM}`);
  }
  return out;
}
