import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ShareLocationSheet } from "../components/ShareLocationSheet";
import { useShell } from "../components/shell/useShell";
import { DEMO_ACCOUNTS } from "../lib/demo";
import {
  LatLng,
  LocationError,
  buildSimulatedRoute,
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
  /** The handoff place's point (null for "somewhere else": no map, no arrival check). */
  dest: LatLng | null;
  /** The traveller's own home point — where a simulated drive starts (optional). */
  from?: LatLng | null;
};

export type StartTripResult =
  | { started: true; trip: Trip }
  | { started: false; reason: "declined" | "denied" | "error"; message?: string };

type Sharing = { trip: Trip; mode: "gps" | "simulate"; otherName: string };

type TripContextValue = {
  /** The trip this device is sending positions for right now; null once arrived, ended or never started. */
  sharing: Sharing | null;
  /** Asks first (consent screen), then the browser, then starts. Resolves when the person has decided. */
  requestStart: (args: StartTripArgs) => Promise<StartTripResult>;
  /** End (or cancel) the trip this device is sharing. */
  stop: (cancel?: boolean) => Promise<void>;
};

const TripContext = createContext<TripContextValue | null>(null);

export function useTrip(): TripContextValue {
  const value = useContext(TripContext);
  if (!value) throw new Error("useTrip must be used inside TripProvider");
  return value;
}

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
  const canSimulate = embedded || Object.values(DEMO_ACCOUNTS).some((account) => account.email === email);

  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const stopSource = useRef<(() => void) | null>(null);
  const sharingRef = useRef<Sharing | null>(null);
  sharingRef.current = sharing;

  const halt = useCallback(() => {
    stopSource.current?.();
    stopSource.current = null;
    setSharing(null);
  }, []);

  useEffect(() => () => stopSource.current?.(), []);

  /** One position goes to the server; the answer says whether this was the arrival. */
  const send = useCallback(
    (tripId: string, position: LatLng) => {
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

  const begin = useCallback(
    async (args: StartTripArgs, mode: "gps" | "simulate"): Promise<StartTripResult> => {
      if (sharingRef.current) return { started: false, reason: "error", message: "A trip is already being shared." };
      try {
        if (mode === "gps") {
          const first = await getCurrentPosition(); // the browser's own permission prompt
          const trip = await startTrip(args.bookingId, args.kind, false, first);
          stopSource.current = startLocationSource({
            mode: "gps",
            onPosition: (p) => send(trip.id, p),
            onError: () => undefined, // a lost fix just means nothing to send this round
          });
          setSharing({ trip, mode, otherName: args.otherName });
          return { started: true, trip };
        }
        const to = args.dest ?? offsetPoint(args.from ?? { lat: 43.6532, lng: -79.3832 }, 2000, 90);
        const route = buildSimulatedRoute(args.from ?? offsetPoint(to, 4000, 270), to);
        const trip = await startTrip(args.bookingId, args.kind, true, route[0]);
        stopSource.current = startLocationSource({
          mode: "simulate",
          route: route.slice(1), // the first point went with Start trip
          onPosition: (p) => send(trip.id, p),
        });
        setSharing({ trip, mode, otherName: args.otherName });
        return { started: true, trip };
      } catch (error) {
        if (error instanceof LocationError && error.reason === "denied") return { started: false, reason: "denied" };
        const message =
          error instanceof LocationError
            ? "We couldn't read your location. Check that location is on and try again."
            : error instanceof Error
              ? error.message
              : "Couldn't start the trip. Try again.";
        return { started: false, reason: "error", message };
      }
    },
    [send],
  );

  const requestStart = useCallback(
    (args: StartTripArgs) => new Promise<StartTripResult>((resolve) => setPending({ args, resolve })),
    [],
  );

  const decide = useCallback(
    async (mode: "gps" | "simulate" | null) => {
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

  const value = useMemo(() => ({ sharing, requestStart, stop }), [sharing, requestStart, stop]);

  return (
    <TripContext.Provider value={value}>
      {children}
      <ShareLocationSheet
        visible={pending !== null}
        title={`Share your live location with ${pending?.args.otherName ?? ""}?`}
        lines={[
          `${pending?.args.otherName ?? "They"} will see where you are on a map, with your ETA, until you arrive.`,
          "It stops by itself when you arrive. Goldito keeps only your latest spot — no route history.",
          "Keep this screen on while you travel — the browser stops sharing when it sleeps.",
        ]}
        allowLabel="Allow"
        onAllow={() => void decide("gps")}
        onDecline={() => void decide(null)}
        simulate={canSimulate ? { label: "Simulate the drive (demo)", onPress: () => void decide("simulate") } : undefined}
        busy={busy}
        testID="share-trip-sheet"
      />
    </TripContext.Provider>
  );
}
