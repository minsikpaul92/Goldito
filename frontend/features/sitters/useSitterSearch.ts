import { useEffect, useMemo, useRef, useState } from "react";

import { BookingError, NearbySitter, searchSittersNearby } from "../../lib/bookings";
import { LatLng, LocationError, getCurrentPosition } from "../../lib/location";
import { geocodeAddress } from "../../lib/transit";
import { tripProblem } from "../../lib/trip";
import { useSession } from "../../providers/SessionProvider";
import { useMyPets } from "../pets/useMyPets";
import { loadRoleProfile, loadSearchRadius, saveSearchRadius } from "../profile/profileApi";
import { addDays, appToday, zonedToIso } from "../schedule/dates";
import { listFavoriteSitterIds } from "./sitterApi";

/** Any change to the search re-runs it once it rests this long. */
const SEARCH_DELAY_MS = 400;
export const START_KM = 5;
/** A Canadian postal code, with or without the space. */
const POSTAL_CODE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

export type When = { day: string; time: string };
/** Where the owner searches from: the saved home, the device, or an address / postal code they typed. */
export type Place = { kind: "home" } | { kind: "here" } | { kind: "custom"; point: LatLng; label: string };
export type Results =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; sitters: NearbySitter[] }
  | { status: "error"; code: string; message: string };

const LOCATION_MESSAGE: Record<LocationError["reason"], string> = {
  denied: "Location is blocked for this site. Allow it in the browser's address bar, or use your home.",
  unavailable: "Couldn't find where you are. Try again, or use your home.",
  timeout: "Finding your location took too long. Try again, or use your home.",
  unsupported: "This browser can't share a location. Use your home instead.",
};

/**
 * The owner's sitter search as one hotel-style bar: a place, a stay (dates and times) and the pets. Every change
 * re-runs search_sitters_nearby (014c / 014i) by itself, stale answers dropped; the radius is the owner's last one.
 */
export function useSitterSearch() {
  const { profile } = useSession();
  const { pets } = useMyPets();
  const today = useMemo(() => appToday(), []);

  const [petIds, setPetIds] = useState<string[]>([]);
  const [dropOff, setDropOff] = useState<When>({ day: addDays(today, 1), time: "09:00" });
  const [pickUp, setPickUp] = useState<When>({ day: addDays(today, 3), time: "17:00" });
  const [place, setPlace] = useState<Place>({ kind: "home" });
  // undefined = still loading; null = no home point saved
  const [home, setHome] = useState<LatLng | null | undefined>(undefined);
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  // null = the owner's last radius is still loading
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const savedRadius = useRef<number | null>(null);
  const [results, setResults] = useState<Results>({ status: "idle" });
  const [retry, setRetry] = useState(0);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set());

  // Everyone is staying unless the owner says otherwise.
  useEffect(() => {
    setPetIds((ids) => (ids.length === 0 ? pets.map((p) => p.id) : ids));
  }, [pets]);

  useEffect(() => {
    if (!profile) return;
    loadRoleProfile(profile.id, "owner")
      .then((r) => setHome(r.fields.home_lat != null && r.fields.home_lng != null ? { lat: r.fields.home_lat, lng: r.fields.home_lng } : null))
      .catch(() => setHome(null));
    loadSearchRadius(profile.id)
      .catch(() => null)
      .then((km) => {
        savedRadius.current = km;
        setRadiusKm(km ?? START_KM);
      });
    listFavoriteSitterIds()
      .then((ids) => setFavorites(new Set(ids)))
      .catch(() => undefined);
  }, [profile]);

  // Remember the radius the owner settles on.
  useEffect(() => {
    if (!profile || radiusKm == null || radiusKm === savedRadius.current) return;
    const timer = setTimeout(() => {
      savedRadius.current = radiusKm;
      saveSearchRadius(profile.id, radiusKm).catch(() => undefined);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [profile, radiusKm]);

  /** Searches from the device's position (the browser asks once). */
  const useHere = async () => {
    setLocating(true);
    setPlaceError(null);
    try {
      const point = await getCurrentPosition();
      setHere(point);
      setPlace({ kind: "here" });
    } catch (error) {
      setPlaceError(error instanceof LocationError ? LOCATION_MESSAGE[error.reason] : LOCATION_MESSAGE.unavailable);
    } finally {
      setLocating(false);
    }
  };

  const useHome = () => {
    setPlaceError(null);
    setPlace({ kind: "home" });
  };

  /** An address or a postal code, looked up through our server; false when it wasn't found. */
  const useAddress = async (text: string): Promise<boolean> => {
    const query = text.trim();
    if (query.length < 3) return false;
    setLocating(true);
    setPlaceError(null);
    try {
      let found = await geocodeAddress(query);
      // OpenStreetMap often knows a postal area ("M5V") but not the full code ("M5V 2T6").
      if (!found.found && POSTAL_CODE.test(query)) found = await geocodeAddress(query.replace(/\s/g, "").slice(0, 3));
      if (!found.found) {
        setPlaceError("Couldn't find that place. Try the postal code or a fuller address.");
        return false;
      }
      setPlace({ kind: "custom", point: found.point, label: query });
      return true;
    } finally {
      setLocating(false);
    }
  };

  const dropIso = zonedToIso(dropOff.day, dropOff.time);
  const pickIso = zonedToIso(pickUp.day, pickUp.time);
  const problem = tripProblem(
    petIds,
    { ...dropOff, locationType: "sitter_home", note: "" },
    { ...pickUp, locationType: "sitter_home", note: "" },
  );
  const placeProblem = place.kind === "home" && home === null ? "Your home isn't on the map yet." : null;
  const ready = !problem && !placeProblem && home !== undefined && radiusKm != null;
  const point = place.kind === "here" ? here : place.kind === "custom" ? place.point : null;
  const petKey = petIds.join();

  // Runs on every change (debounced); stale answers are dropped.
  useEffect(() => {
    if (!ready || radiusKm == null) {
      setResults({ status: "idle" });
      return;
    }
    let current = true;
    setResults({ status: "loading" });
    const timer = setTimeout(() => {
      searchSittersNearby({ dropOffAt: dropIso, pickUpAt: pickIso, petCount: petKey.split(",").length, radiusKm, point })
        .then((sitters) => current && setResults({ status: "ready", sitters }))
        .catch((error: Error) => {
          if (!current) return;
          const code = error instanceof BookingError ? error.code : "";
          if (code === "no_home_point") setHome(null);
          setResults({ status: "error", code, message: error.message });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // point is read through its coordinates so a new object with the same place does not search again
  }, [ready, dropIso, pickIso, petKey, radiusKm, point?.lat, point?.lng, retry]);

  return {
    today,
    pets,
    petIds,
    setPetIds,
    dropOff,
    setDropOff,
    pickUp,
    setPickUp,
    place,
    home,
    locating,
    placeError,
    useHere,
    useHome,
    useAddress,
    radiusKm: radiusKm ?? START_KM,
    setRadiusKm,
    dropIso,
    pickIso,
    problem,
    placeProblem,
    results,
    favorites,
    retry: () => setRetry((n) => n + 1),
  };
}

export type SitterSearch = ReturnType<typeof useSitterSearch>;
