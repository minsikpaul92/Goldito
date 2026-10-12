import type { LatLng } from "../lib/location";

export type TripMapProps = {
  /** The traveller's latest position (null until the first one arrives). */
  traveler: LatLng | null;
  /** The handoff place. */
  dest: LatLng | null;
  /** What the traveller's pin says, e.g. "Chloe". */
  travelerLabel: string;
  testID?: string;
};
