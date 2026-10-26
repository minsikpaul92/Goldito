import { Linking } from "react-native";

import { Button } from "./Button";
import { TextButton } from "./TextButton";

type Props = {
  label: string;
  href: string;
  /** `text` looks like TextButton, for a link that sits next to other text links. */
  look?: "button" | "text";
  /** Web only: its own small window instead of a tab. */
  newWindow?: boolean;
  testID?: string;
};

/** A secondary button that opens an outside page (a Meet call). The web version is a real link. */
export function LinkButton({ label, href, look = "button", testID }: Props) {
  const open = () => void Linking.openURL(href);
  return look === "text" ? (
    <TextButton label={label} onPress={open} testID={testID} />
  ) : (
    <Button label={label} variant="secondary" onPress={open} testID={testID} />
  );
}
