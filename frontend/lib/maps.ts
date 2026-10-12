import { Linking } from "react-native";

/**
 * Google Maps links (phase-06b 6B.8). No API key and no map on our side: it is only a URL, opened in a new tab or the
 * Maps app. The place is the address text the person can already see (or the handoff's written place) — never an entry
 * code — and, only when there is no text, the point itself.
 */
export type PlaceQuery = { text: string | null; point: { lat: number; lng: number } | null };

function queryOf(place: PlaceQuery): string | null {
  if (place.text?.trim()) return place.text.trim();
  return place.point ? `${place.point.lat},${place.point.lng}` : null;
}

/** "Show me this place". */
export function mapsPlaceUrl(place: PlaceQuery): string | null {
  const query = queryOf(place);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

/** "Take me there" — turn-by-turn, for the person who is travelling. */
export function mapsDirectionsUrl(place: PlaceQuery): string | null {
  const query = queryOf(place);
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving` : null;
}

export function openMaps(url: string): void {
  void Linking.openURL(url);
}
