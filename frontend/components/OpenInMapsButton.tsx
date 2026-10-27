import { PlaceQuery, mapsDirectionsUrl, mapsPlaceUrl, openMaps } from "../lib/maps";
import { Button } from "./ui/Button";
import { IconAction } from "./ui/IconAction";
import { TextButton } from "./ui/TextButton";

type Props = {
  place: PlaceQuery;
  /** The traveller gets directions to the place; the person waiting gets the place itself. */
  travelling: boolean;
  /** `link` = a quiet text link (inside another card); `button` = the full-width secondary button; `tile` = an
   * IconAction in a row of actions ("Directions" for the traveller, "Map" for the person waiting). */
  style?: "button" | "link" | "tile";
  testID?: string;
};

/** **Open in Google Maps** — shown to both people, with or without live sharing. Hidden when there is no place to open. */
export function OpenInMapsButton({ place, travelling, style = "button", testID = "open-in-maps" }: Props) {
  const url = travelling ? mapsDirectionsUrl(place) : mapsPlaceUrl(place);
  if (!url) return null;
  const open = () => openMaps(url);
  if (style === "tile") {
    return <IconAction icon="place" label={travelling ? "Directions" : "Map"} accessibilityLabel="Open in Google Maps" onPress={open} testID={testID} />;
  }
  return style === "link" ? (
    <TextButton label="Open in Google Maps" onPress={open} testID={testID} />
  ) : (
    <Button label="Open in Google Maps" variant="secondary" onPress={open} testID={testID} />
  );
}
