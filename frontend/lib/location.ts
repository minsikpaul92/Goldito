/**
 * Where the traveller is (phase-06b 6B.2, D32 · D41) — one source for the trip, either the device's GPS or a
 * simulated drive. Nothing in here talks to the server or asks the person anything: the consent screen comes first
 * (`ShareLocationSheet`), and the caller decides what to do with each position.
 *
 * P0 is a web app, so the GPS is `navigator.geolocation`, which only reports while the screen is on. The native app
 * (later) swaps this file's GPS half for `expo-location`.
 */

export type LatLng = { lat: number; lng: number };

/** One reading: a point and, from a real GPS, how far off it may be in metres (the server ignores poor ones for arrival). */
export type Fix = LatLng & { accuracy?: number };

export type LocationErrorReason = "denied" | "unavailable" | "unsupported" | "timeout";

export class LocationError extends Error {
  readonly reason: LocationErrorReason;

  constructor(reason: LocationErrorReason) {
    super(reason);
    this.name = "LocationError";
    this.reason = reason;
  }
}

/** A live trip sends one position this often (≈ 720 messages over a 30-minute trip, phase-06b cost note). */
export const GPS_INTERVAL_MS = 5000;
/** A simulated step: the server ignores two positions less than a second apart, so this stays above that. */
export const SIM_INTERVAL_MS = 1200;
/** How far short of the destination the simulated drive stops — inside the 150 m arrival circle. */
const SIM_STOP_SHORT_M = 60;

const EARTH_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A point `meters` away from `from`, towards a compass bearing (0 = north, 90 = east). */
export function offsetPoint(from: LatLng, meters: number, bearingDeg: number): LatLng {
  const bearing = rad(bearingDeg);
  const dLat = (meters * Math.cos(bearing)) / EARTH_M;
  const dLng = (meters * Math.sin(bearing)) / (EARTH_M * Math.cos(rad(from.lat)));
  return { lat: from.lat + (dLat * 180) / Math.PI, lng: from.lng + (dLng * 180) / Math.PI };
}

/**
 * The fictional drive for "Simulate the drive": a gently bowed line from `from` that stops ~60 m short of `to`,
 * so the real arrival rule (150 m) fires. Built from the two homes, so it always ends at the real destination.
 * The car stays parked for one more step: arrival needs two readings in a row inside the circle (015q).
 */
export function buildSimulatedRoute(from: LatLng, to: LatLng, steps = 25): LatLng[] {
  const total = distanceMeters(from, to);
  const reach = total > SIM_STOP_SHORT_M ? 1 - SIM_STOP_SHORT_M / total : 1;
  const bow = total * 0.03;
  const bearing = (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180) / Math.PI;
  const route = Array.from({ length: steps }, (_, i) => {
    const t = (reach * i) / (steps - 1);
    const onLine = { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t };
    return offsetPoint(onLine, Math.sin(Math.PI * t) * bow, bearing + 90);
  });
  return [...route, route[route.length - 1]];
}

/** OSRM's public demo router (OpenStreetMap roads). Used only for the simulated demo drive between demo homes. */
const ROAD_ROUTER = "https://router.project-osrm.org/route/v1/driving";
const ROAD_TIMEOUT_MS = 4000;

/** Points along a path, evenly spaced by distance, from the start to `reach` of its length. */
function resample(path: LatLng[], count: number, reach: number): LatLng[] {
  const legs = path.slice(1).map((p, i) => distanceMeters(path[i], p));
  const total = legs.reduce((a, b) => a + b, 0) * reach;
  return Array.from({ length: count }, (_, k) => {
    let left = (total * k) / (count - 1);
    for (let i = 0; i < legs.length; i += 1) {
      if (left <= legs[i] || i === legs.length - 1) {
        const t = legs[i] > 0 ? Math.min(1, left / legs[i]) : 0;
        return { lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t, lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t };
      }
      left -= legs[i];
    }
    return path[path.length - 1];
  });
}

/**
 * The simulated drive along real roads (OSRM), stopping ~60 m short like the bowed line, with the same parked last
 * step. Falls back to buildSimulatedRoute when the router is slow, down or finds no road.
 */
export async function buildRoadRoute(from: LatLng, to: LatLng, steps = 30): Promise<LatLng[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROAD_TIMEOUT_MS);
    const url = `${ROAD_ROUTER}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!response.ok) throw new Error("no route");
    const body = (await response.json()) as { routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] };
    const route = body.routes?.[0];
    const coords = route?.geometry.coordinates ?? [];
    if (!route || coords.length < 2) throw new Error("no route");
    const path = coords.map(([lng, lat]) => ({ lat, lng }));
    const reach = route.distance > SIM_STOP_SHORT_M ? 1 - SIM_STOP_SHORT_M / route.distance : 1;
    const points = resample(path, steps, reach);
    return [...points, points[points.length - 1]];
  } catch {
    return buildSimulatedRoute(from, to);
  }
}

type GeolocationLike = Pick<Geolocation, "getCurrentPosition" | "watchPosition" | "clearWatch">;

function toFix(p: { coords: { latitude: number; longitude: number; accuracy?: number | null } }): Fix {
  const { latitude: lat, longitude: lng, accuracy } = p.coords;
  return accuracy != null && Number.isFinite(accuracy) ? { lat, lng, accuracy } : { lat, lng };
}

function geolocation(): GeolocationLike {
  const geo = (globalThis as { navigator?: { geolocation?: GeolocationLike } }).navigator?.geolocation;
  if (!geo) throw new LocationError("unsupported");
  return geo;
}

function toReason(error: { code?: number }): LocationErrorReason {
  if (error.code === 1) return "denied";
  if (error.code === 3) return "timeout";
  return "unavailable";
}

/** One reading — this is the call that makes the browser ask for permission. */
export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    let geo: GeolocationLike;
    try {
      geo = geolocation();
    } catch (error) {
      reject(error);
      return;
    }
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new LocationError(toReason(e))),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

export type LocationSourceOptions =
  | { mode: "gps"; onPosition: (p: Fix) => void; onError: (error: LocationError) => void }
  | {
      mode: "simulate";
      route: LatLng[];
      onPosition: (p: LatLng) => void;
      onDone?: () => void;
      /** Continue a drive from this point of the route (after a reload). */
      startIndex?: number;
      /** How many route points have gone out so far, to resume from. */
      onStep?: (next: number) => void;
    };

/**
 * Starts reporting positions and returns `stop`. GPS: the first fix at once, then the latest one every 5 s.
 * Simulate: the route's points one by one, `SIM_INTERVAL_MS` apart. Never reports after `stop()`.
 */
export function startLocationSource(options: LocationSourceOptions): () => void {
  let stopped = false;
  const timers: ReturnType<typeof setInterval>[] = [];
  const stop = () => {
    stopped = true;
    timers.forEach(clearInterval);
  };

  if (options.mode === "simulate") {
    const { route, onPosition, onDone, onStep } = options;
    let next = options.startIndex ?? 0;
    // Time decides where the car is, not the number of ticks: a tab that was asleep or throttled catches up in one jump.
    const t0 = Date.now() - next * SIM_INTERVAL_MS;
    const step = () => {
      if (stopped) return;
      if (next >= route.length) {
        stop();
        onDone?.();
        return;
      }
      const due = Math.min(route.length, Math.floor((Date.now() - t0) / SIM_INTERVAL_MS) + 1);
      if (due > next) {
        next = due;
        onPosition(route[due - 1]);
        onStep?.(next);
      }
    };
    step();
    timers.push(setInterval(step, SIM_INTERVAL_MS));
    return stop;
  }

  let geo: GeolocationLike;
  try {
    geo = geolocation();
  } catch (error) {
    options.onError(error as LocationError);
    return stop;
  }
  let latest: Fix | null = null;
  let sentFirst = false;
  const watch = geo.watchPosition(
    (p) => {
      if (stopped) return;
      latest = toFix(p);
      if (!sentFirst) {
        sentFirst = true;
        options.onPosition(latest);
        latest = null;
      }
    },
    (e) => {
      if (!stopped) options.onError(new LocationError(toReason(e)));
    },
    { enableHighAccuracy: true, maximumAge: 2000 },
  );
  timers.push(
    setInterval(() => {
      if (stopped || !latest) return;
      options.onPosition(latest);
      latest = null; // nothing new since the last send → nothing to repeat
    }, GPS_INTERVAL_MS),
  );
  return () => {
    stop();
    geo.clearWatch(watch);
  };
}
