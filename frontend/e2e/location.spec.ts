import { expect, test } from "@playwright/test";

import {
  GPS_INTERVAL_MS,
  LocationError,
  SIM_INTERVAL_MS,
  buildSimulatedRoute,
  distanceMeters,
  getCurrentPosition,
  offsetPoint,
  startLocationSource,
} from "../lib/location";

// The location source (phase-06b 6B.2): the simulated drive ends inside the arrival circle, and the GPS half
// reports nothing until it is asked and nothing after stop(). Pure logic — no page, no server.

const CHLOE = { lat: 43.6477, lng: -79.4194 };
const ROBERT = { lat: 43.6644, lng: -79.3573 };

type Listener = (p: { coords: { latitude: number; longitude: number; accuracy?: number } }) => void;
type Failure = (e: { code: number }) => void;

/** A fake `navigator.geolocation` that counts every read and lets the test push fixes or errors. */
function fakeGeolocation() {
  const calls = { current: 0, watch: 0, cleared: 0 };
  let onFix: Listener | null = null;
  let onFail: Failure | null = null;
  let currentAnswer: { lat: number; lng: number } | { code: number } = { lat: 43.7, lng: -79.4 };
  const geo = {
    getCurrentPosition(ok: Listener, fail: Failure) {
      calls.current++;
      if ("code" in currentAnswer) fail(currentAnswer);
      else ok({ coords: { latitude: currentAnswer.lat, longitude: currentAnswer.lng } });
    },
    watchPosition(ok: Listener, fail: Failure) {
      calls.watch++;
      onFix = ok;
      onFail = fail;
      return 7;
    },
    clearWatch() {
      calls.cleared++;
    },
  };
  Object.defineProperty(globalThis, "navigator", { value: { geolocation: geo }, configurable: true });
  return {
    calls,
    answerWith: (a: typeof currentAnswer) => (currentAnswer = a),
    fix: (lat: number, lng: number, accuracy?: number) => onFix?.({ coords: { latitude: lat, longitude: lng, accuracy } }),
    fail: (code: number) => onFail?.({ code }),
  };
}

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, "navigator");
});

test.describe("the simulated drive", () => {
  test("starts at the traveller's home and stops inside the 150 m arrival circle, coming closer each step", () => {
    const route = buildSimulatedRoute(ROBERT, CHLOE);
    expect(route).toHaveLength(26); // 25 steps, then parked for one more
    expect(distanceMeters(route[0], ROBERT)).toBeLessThan(5);
    const last = distanceMeters(route[route.length - 1], CHLOE);
    expect(last).toBeGreaterThan(30);
    expect(last).toBeLessThan(100); // ~60 m short: arrival fires, but it is not on top of the door
    const distances = route.map((p) => distanceMeters(p, CHLOE));
    for (let i = 1; i < distances.length - 1; i++) expect(distances[i]).toBeLessThan(distances[i - 1]);
    // Arrival needs two readings in a row inside 150 m (015q): the car stays parked for one more step.
    expect(route[route.length - 1]).toEqual(route[route.length - 2]);
  });

  test("a trip that is already close still ends at the destination", () => {
    const near = offsetPoint(CHLOE, 40, 90);
    const route = buildSimulatedRoute(near, CHLOE, 5);
    expect(distanceMeters(route[route.length - 1], CHLOE)).toBeLessThan(150);
    expect(distanceMeters(route[route.length - 2], CHLOE)).toBeLessThan(150);
  });

  test("a simulated source plays the points in order, one per interval, and then stops itself", async () => {
    const route = [CHLOE, offsetPoint(CHLOE, 100, 0), offsetPoint(CHLOE, 200, 0)];
    const seen: number[] = [];
    let done = false;
    startLocationSource({
      mode: "simulate",
      route,
      onPosition: (p) => seen.push(p.lat),
      onDone: () => (done = true),
    });
    expect(seen).toEqual([route[0].lat]); // the first point goes out at once
    await new Promise((resolve) => setTimeout(resolve, SIM_INTERVAL_MS * 3 + 300));
    expect(seen).toEqual(route.map((p) => p.lat));
    expect(done).toBe(true);
  });

  test("stop() ends a simulated drive", async () => {
    const seen: unknown[] = [];
    const stop = startLocationSource({
      mode: "simulate",
      route: buildSimulatedRoute(ROBERT, CHLOE),
      onPosition: (p) => seen.push(p),
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, SIM_INTERVAL_MS * 2));
    expect(seen).toHaveLength(1);
  });
});

test.describe("the phone's GPS", () => {
  test("one reading comes back as a point", async () => {
    const geo = fakeGeolocation();
    expect(await getCurrentPosition()).toEqual({ lat: 43.7, lng: -79.4 });
    expect(geo.calls.current).toBe(1);
  });

  test("a refused permission, an unavailable fix and a missing browser API are told apart", async () => {
    const geo = fakeGeolocation();
    geo.answerWith({ code: 1 });
    await expect(getCurrentPosition()).rejects.toMatchObject({ name: "LocationError", reason: "denied" });
    geo.answerWith({ code: 2 });
    await expect(getCurrentPosition()).rejects.toMatchObject({ reason: "unavailable" });
    geo.answerWith({ code: 3 });
    await expect(getCurrentPosition()).rejects.toMatchObject({ reason: "timeout" });
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    await expect(getCurrentPosition()).rejects.toBeInstanceOf(LocationError);
    await expect(getCurrentPosition()).rejects.toMatchObject({ reason: "unsupported" });
  });

  test("the first fix goes out at once, later ones wait for the interval, and nothing goes out after stop()", async () => {
    const geo = fakeGeolocation();
    const sent: number[] = [];
    const errors: string[] = [];
    const stop = startLocationSource({
      mode: "gps",
      onPosition: (p) => sent.push(p.lat),
      onError: (e) => errors.push(e.reason),
    });
    expect(geo.calls.watch).toBe(1);
    expect(sent).toEqual([]); // no fix yet → nothing to send
    geo.fix(43.1, -79);
    expect(sent).toEqual([43.1]);
    geo.fix(43.2, -79); // inside the interval: held, not sent
    expect(sent).toEqual([43.1]);
    geo.fail(1);
    expect(errors).toEqual(["denied"]);
    stop();
    geo.fix(43.3, -79);
    expect(sent).toEqual([43.1]);
    expect(geo.calls.cleared).toBe(1);
    expect(GPS_INTERVAL_MS).toBe(5000);
  });

  test("each fix carries the GPS accuracy, so the server can ignore a poor one for arrival (015q)", () => {
    const geo = fakeGeolocation();
    const sent: unknown[] = [];
    const stop = startLocationSource({ mode: "gps", onPosition: (p) => sent.push(p), onError: () => undefined });
    geo.fix(43.1, -79, 480);
    expect(sent).toEqual([{ lat: 43.1, lng: -79, accuracy: 480 }]);
    stop();
  });

  test("with no GPS in the browser the source reports it instead of throwing", () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    const errors: string[] = [];
    startLocationSource({ mode: "gps", onPosition: () => undefined, onError: (e) => errors.push(e.reason) });
    expect(errors).toEqual(["unsupported"]);
  });
});
