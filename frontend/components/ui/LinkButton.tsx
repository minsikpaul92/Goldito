import { Linking } from "react-native";

import { Button } from "./Button";

type Props = {
  label: string;
  href: string;
  testID?: string;
};

/** A secondary button that opens an outside page (a Meet call). The web version is a real link. */
export function LinkButton({ label, href, testID }: Props) {
  return <Button label={label} variant="secondary" onPress={() => void Linking.openURL(href)} testID={testID} />;
}
