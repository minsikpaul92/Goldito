import { Asset } from "expo-asset";

/** Plus Jakarta Sans for body text on web (team pick, Oct 22): one family, five weights, so fontWeight picks the face. */
const FACES: [number, number][] = [
  [400, require("@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf")],
  [500, require("@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf")],
  [600, require("@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf")],
  [700, require("@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf")],
  [800, require("@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf")],
];

let loaded = false;

/** Adds the @font-face rules once. Until the files arrive the system font shows (font-display: swap). */
export function loadBodyFont() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const css = FACES.map(
    ([weight, file]) =>
      `@font-face{font-family:"Plus Jakarta Sans";font-style:normal;font-weight:${weight};font-display:swap;src:url(${Asset.fromModule(file).uri}) format("truetype")}`,
  ).join("\n");
  const style = document.createElement("style");
  style.setAttribute("data-body-font", "plus-jakarta-sans");
  style.textContent = css;
  document.head.appendChild(style);
}
