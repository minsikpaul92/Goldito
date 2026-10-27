import type { LatLng } from "../lib/location";

export type TripMapProps = {
  /** The traveller's latest position (null until the first one arrives). */
  traveler: LatLng | null;
  /** The handoff place. */
  dest: LatLng | null;
  /** What the traveller's pin says, e.g. "Chloe". */
  travelerLabel: string;
  /** The pet on the move, drawn in the traveller's pin: its photo, or a dog or cat face without one. */
  travelerPet?: { photoUrl?: string | null; species: "dog" | "cat" } | null;
  /** The name on the place pin, e.g. "Chloe's place". */
  destLabel?: string;
  /** Edge to edge with no frame (the top of the Trip screen); otherwise a framed box inside the page. */
  flush?: boolean;
  height?: number;
  testID?: string;
};
