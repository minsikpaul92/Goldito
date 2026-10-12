import { PlaceQuery, mapsDirectionsUrl, mapsPlaceUrl, openMaps } from "../lib/maps";
import { Button } from "./ui/Button";
import { TextButton } from "./ui/TextButton";

type Props = {
  place: PlaceQuery;
  /** The traveller gets directions to the place; the person waiting gets the place itself. */
  travelling: boolean;
  /** `link` = a quiet text link (inside another card); `button` = the full-width secondary button. */
  style?: "button" | "link";
  testID?: string;
};

/** **Open in Google Maps** — shown to both people, with or without live sharing. Hidden when there is no place to open. */
export function OpenInMapsButton({ place, travelling, style = "button", testID = "open-in-maps" }: Props) {
  const url = travelling ? mapsDirectionsUrl(place) : mapsPlaceUrl(place);
  if (!url) return null;
  const open = () => openMaps(url);
  return style === "link" ? (
    <TextButton label="Open in Google Maps" onPress={open} testID={testID} />
  ) : (
    <Button label="Open in Google Maps" variant="secondary" onPress={open} testID={testID} />
  );
}
