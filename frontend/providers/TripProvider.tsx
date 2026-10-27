import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ShareLocationSheet } from "../components/ShareLocationSheet";
import { useShell } from "../components/shell/useShell";
import { findDemoAccount } from "../lib/demo";
import {
  Fix,
  LatLng,
  LocationError,
  buildRoadRoute,
  getCurrentPosition,
  offsetPoint,
  startLocationSource,
} from "../lib/location";
import { HandoffKind, TransitError, endTrip, startTrip, updateTripPosition } from "../lib/transit";
import { Trip } from "../types/db";
import { useSession } from "./SessionProvider";

export type StartTripArgs = {
  bookingId: string;
  kind: HandoffKind;
  /** First name of the person who will watch — the consent screen says who sees the location. */
  otherName: string;
  /** The traveller's own home point — where a simulated drive starts (optional). */
  from?: LatLng | null;
};

export type StartTripResult =
  // `sharing: false` = the trip runs without a live position (the person chose that, or the browser said no: `because`).
  | { started: true; trip: Trip; sharing: boolean; because?: "chosen" | "denied" }
  | { started: false; reason: "declined" | "error"; message?: string };

type Sharing = { trip: Trip; mode: "gps" | "simulate"; otherName: string };

type TripContextValue = {
  /** The trip this device is sending positions for right now; null once arrived, ended or never started. */
  sharing: Sharing | null;
  /** Asks first (consent screen), then the browser, then starts. Resolves when the person has decided. */
  requestStart: (args: StartTripArgs) => Promise<StartTripResult>;
  /** End (or cancel) the trip this device is sharing. */
  stop: (cancel?: boolean) => Promise<void>;
  /** Starts a simulated drive at once, without the consent screen (judge panel Play, #413; demo accounts only). */
  simulate: (args: StartTripArgs) => Promise<StartTripResult>;
};

const TripContext = createContext<TripContextValue | null>(null);

export function useTrip(): TripContextValue {
  const value = useContext(TripContext);
  if (!value) throw new Error("useTrip must be used inside TripProvider");
  return value;
}

/** A simulated drive survives a reload: the route and how far it got are kept for this user (web storage). */
type SavedDrive = { trip: Trip; route: LatLng[]; next: number; otherName: string };
const driveKey = (userId: string) => `goldito.simdrive.${userId}`;
const readDrive = (userId: string): SavedDrive | null => {
  try {
    const raw = globalThis.localStorage?.getItem(driveKey(userId));
    return raw ? (JSON.parse(raw) as SavedDrive) : null;
  } catch {
    return null;
  }
};
const writeDrive = (userId: string, drive: SavedDrive | null) => {
  try {
    if (drive) globalThis.localStorage?.setItem(driveKey(userId), JSON.stringify(drive));
    else globalThis.localStorage?.removeItem(driveKey(userId));
  } catch {
    // no storage: the drive just does not survive a reload
  }
};

type Pending = { args: StartTripArgs; resolve: (result: StartTripResult) => void };

/**
 * Owns the location source of a running trip (phase-06b 6B.2). It lives above the screens, so the position keeps
 * going when the traveller leaves the Trip screen — as long as the tab stays open (the web only shares while the
 * screen is on, D41). Nothing is read or sent until the consent screen's **Allow**.
 */
export function TripProvider({ children }: { children: ReactNode }) {
  const { embedded } = useShell();
  const { session } = useSession();
  const email = session?.user.email ?? "";
  const canSimulate = embedded || findDemoAccount(email) !== null;

  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const stopSource = useRef<(() => void) | null>(null);
  const sharingRef = useRef<Sharing | null>(null);
  sharingRef.current = sharing;

  const userId = session?.user.id ?? "";
  const halt = useCallback(() => {
    stopSource.current?.();
    stopSource.current = null;
    setSharing(null);
    if (userId) writeDrive(userId, null);
  }, [userId]);

  useEffect(() => () => stopSource.current?.(), []);

  /** One position goes to the server; the answer says whether this was the arrival. */
  const send = useCallback(
    (tripId: string, position: Fix) => {
      updateTripPosition(tripId, position)
        .then((trip) => {
          if (trip.status !== "en_route") halt(); // arrived (or ended elsewhere): sharing is over
        })
        .catch((error: unknown) => {
          const code = error instanceof TransitError ? error.code : "";
          if (code === "trip_not_active" || code === "not_allowed") halt();
          // anything else is a blip: the next position retries
        });
    },
    [halt],
  );

  /** Runs a simulated drive from `from` on the route; saved as it goes so a reload picks it up where it was. */
  const runDrive = useCallback(
    (trip: Trip, route: LatLng[], startIndex: number, otherName: string) => {
      stopSource.current = startLocationSource({
        mode: "simulate",
        route,
        startIndex,
        onPosition: (p) => send(trip.id, p),
        onStep: (next) => userId && writeDrive(userId, { trip, route, next, otherName }),
      });
      setSharing({ trip, mode: "simulate", otherName });
    },
    [send, userId],
  );


  // A reload (or coming back to the app) while a simulated drive was on: it goes on from where it was.
  useEffect(() => {
    if (!userId || sharingRef.current) return;
    const saved = readDrive(userId);
    if (!saved) return;
    if (saved.next >= saved.route.length) {
      writeDrive(userId, null);
      return;
    }
    runDrive(saved.trip, saved.route, saved.next, saved.otherName);
  }, [userId, runDrive]);

  const begin = useCallback(
    async (args: StartTripArgs, mode: "gps" | "simulate" | "none"): Promise<StartTripResult> => {
      if (sharingRef.current) return { started: false, reason: "error", message: "A trip is already being shared." };
      try {
        if (mode === "none") {
          // "I'm on my way" without a position: the other person sees the meeting place instead of a map.
          const trip = await startTrip(args.bookingId, args.kind, false, undefined, false);
          return { started: true, trip, sharing: false, because: "chosen" };
        }
        if (mode === "gps") {
          const first = await getCurrentPosition(); // the browser's own permission prompt
          const trip = await startTrip(args.bookingId, args.kind, false, first);
          stopSource.current = startLocationSource({
            mode: "gps",
            onPosition: (p) => send(trip.id, p),
            onError: () => undefined, // a lost fix just means nothing to send this round
          });
          setSharing({ trip, mode, otherName: args.otherName });
          return { started: true, trip, sharing: true };
        }
        // The drive starts at the traveller's home; the destination is whatever the server holds for this handoff.
        const from = args.from ?? { lat: 43.6532, lng: -79.3832 };
        const trip = await startTrip(args.bookingId, args.kind, true, from);
        const to = trip.dest_lat != null && trip.dest_lng != null ? { lat: trip.dest_lat, lng: trip.dest_lng } : offsetPoint(from, 2000, 90);
        // Along real roads when the router answers; the first point went with Start trip.
        runDrive(trip, (await buildRoadRoute(from, to)).slice(1), 0, args.otherName);
        return { started: true, trip, sharing: true };
      } catch (error) {
        if (error instanceof LocationError && error.reason === "denied") {
          // The browser (or the phone) said no after the person said yes: go on without a position (D41).
          try {
            const trip = await startTrip(args.bookingId, args.kind, false, undefined, false);
            return { started: true, trip, sharing: false, because: "denied" };
          } catch {
            return { started: false, reason: "error", message: "Couldn't start the trip. Try again." };
          }
        }
        const message =
          error instanceof LocationError
            ? "We couldn't read your location. Check that location is on and try again."
            : "Couldn't start the trip. Try again.";
        return { started: false, reason: "error", message };
      }
    },
    [send, runDrive],
  );

  const requestStart = useCallback(
    (args: StartTripArgs) => new Promise<StartTripResult>((resolve) => setPending({ args, resolve })),
    [],
  );

  const decide = useCallback(
    async (mode: "gps" | "simulate" | "none" | null) => {
      if (!pending) return;
      const { args, resolve } = pending;
      if (mode === null) {
        setPending(null);
        resolve({ started: false, reason: "declined" });
        return;
      }
      setBusy(true);
      const result = await begin(args, mode);
      setBusy(false);
      setPending(null);
      resolve(result);
    },
    [pending, begin],
  );

  const stop = useCallback(
    async (cancel = false) => {
      const current = sharingRef.current;
      halt();
      if (current) await endTrip(current.trip.id, cancel).catch(() => undefined);
    },
    [halt],
  );

  // The judge panel's Play (#413): the simulated drive without the consent screen, demo accounts only.
  const simulate = useCallback(
    (args: StartTripArgs): Promise<StartTripResult> =>
      findDemoAccount(email) ? begin(args, "simulate") : Promise.resolve({ started: false, reason: "error" }),
    [begin, email],
  );

  const value = useMemo(() => ({ sharing, requestStart, stop, simulate }), [sharing, requestStart, stop, simulate]);

  return (
    <TripContext.Provider value={value}>
      {children}
      <ShareLocationSheet
        visible={pending !== null}
        title={`Share your live location with ${pending?.args.otherName ?? ""}?`}
        lines={[
          `${pending?.args.otherName ?? "They"} will see where you are on a map, with your ETA, until you arrive.`,
          "It stops by itself when you arrive. Goldito keeps only your latest spot, no route history.",
          "Keep this screen on while you travel. The browser stops sharing when it sleeps.",
          `Prefer not to share? ${pending?.args.otherName ?? "They"} will see the meeting place and an Open in Google Maps button instead.`,
        ]}
        allowLabel="Allow"
        onAllow={() => void decide("gps")}
        onDecline={() => void decide(null)}
        declineLabel="Cancel"
        alternative={{ label: "Start without sharing my location", onPress: () => void decide("none") }}
        simulate={canSimulate ? { label: "Simulate the drive (demo)", onPress: () => void decide("simulate") } : undefined}
        busy={busy}
        testID="share-trip-sheet"
      />
    </TripContext.Provider>
  );
}
