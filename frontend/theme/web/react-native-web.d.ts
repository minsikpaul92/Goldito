// The one react-native-web internal the body-font wrapper calls (theme/web/createReactDOMStyle.ts).
declare module "react-native-web/dist/exports/StyleSheet/compiler/createReactDOMStyle" {
  export default function createReactDOMStyle(style: object, isInline?: boolean): Record<string, unknown>;
}
