/** The radius slider's scale: near distances get room (5 km sits a quarter of the way), far ones are squeezed. */
const STOPS: [position: number, km: number][] = [
  [0, 1],
  [25, 5],
  [45, 10],
  [70, 25],
  [85, 50],
  [100, 100],
];

export const RADIUS_POSITIONS = 100;

export function kmToPosition(km: number): number {
  for (let i = 1; i < STOPS.length; i++) {
    const [p0, k0] = STOPS[i - 1];
    const [p1, k1] = STOPS[i];
    if (km <= k1) return Math.round(p0 + ((km - k0) / (k1 - k0)) * (p1 - p0));
  }
  return RADIUS_POSITIONS;
}

export function positionToKm(position: number): number {
  for (let i = 1; i < STOPS.length; i++) {
    const [p0, k0] = STOPS[i - 1];
    const [p1, k1] = STOPS[i];
    if (position <= p1) return Math.round(k0 + ((position - p0) / (p1 - p0)) * (k1 - k0));
  }
  return 100;
}
