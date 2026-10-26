import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { LatLng } from "../lib/location";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import type { TripMapProps } from "./tripMapProps";
import { Icon } from "./ui/Icon";

const HEIGHT = 240;

function pin(emoji: string, label: string) {
  return L.divIcon({
    className: "goldito-pin",
    html: `<div role="img" aria-label="${label}" style="font-size:26px;line-height:32px;text-align:center">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 28],
  });
}

/**
 * The trip map (phase-06b 6B.3, D32): Leaflet + OpenStreetMap tiles. It fits the traveller and the place on its own.
 * A finger or the mouse drags it, two fingers pinch zoom, and ± zoom. The wheel zooms only once the map has focus
 * (a click or Tab on it), so scrolling past it still scrolls the screen (#381).
 */
export function TripMap({ traveler, dest, travelerLabel, testID = "trip-map" }: TripMapProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<{ traveler?: L.Marker; dest?: L.Marker }>({});
  const points = useRef<LatLng[]>([]);
  // Once the person has moved the map it stops re-fitting on every new position; Recenter fits it again.
  const moved = useRef(false);
  const [movedByHand, setMovedByHand] = useState(false);
  // True while the map moves itself, so that move is not taken for the person's.
  const fitting = useRef(false);

  const markMoved = useCallback(() => {
    moved.current = true;
    setMovedByHand(true);
  }, []);

  const fit = useCallback(() => {
    const instance = map.current;
    if (!instance) return;
    const at = points.current;
    fitting.current = true;
    try {
      if (at.length === 2) {
        instance.fitBounds(L.latLngBounds(at.map((p) => [p.lat, p.lng] as [number, number])), {
          padding: [40, 40],
          maxZoom: 16,
          animate: false,
        });
      } else if (at.length === 1) {
        instance.setView([at[0].lat, at[0].lng], 15, { animate: false });
      }
    } finally {
      fitting.current = false;
    }
  }, []);

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      zoomControl: false,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: true,
      attributionControl: true,
    });
    instance.attributionControl.setPrefix(false);
    instance.on("focus", () => instance.scrollWheelZoom.enable());
    instance.on("blur", () => instance.scrollWheelZoom.disable());
    // Drag, pinch, wheel, double tap and the arrow keys all count as the person moving the map.
    instance.on("dragstart zoomstart", () => {
      if (!fitting.current) markMoved();
    });
    instance.on("keydown", (e) => {
      if ((e as L.LeafletKeyboardEvent).originalEvent.key.startsWith("Arrow")) markMoved();
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(instance);
    fitting.current = true;
    instance.setView([43.6532, -79.3832], 12);
    fitting.current = false;
    map.current = instance;
    const current = markers.current;
    return () => {
      instance.remove();
      map.current = null;
      delete current.traveler;
      delete current.dest;
    };
  }, [markMoved]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const sync = (key: "traveler" | "dest", at: LatLng | null, icon: L.DivIcon) => {
      const existing = markers.current[key];
      if (!at) {
        existing?.remove();
        delete markers.current[key];
        return;
      }
      if (existing) existing.setLatLng([at.lat, at.lng]);
      else markers.current[key] = L.marker([at.lat, at.lng], { icon, interactive: false, keyboard: false }).addTo(instance);
    };
    sync("traveler", traveler, pin("🚗", travelerLabel));
    sync("dest", dest, pin("📍", "Handoff place"));
    points.current = [traveler, dest].filter((p): p is LatLng => p != null);
    if (!moved.current) fit();
  }, [traveler, dest, travelerLabel, fit]);

  const zoom = (delta: number) => {
    markMoved();
    map.current?.setZoom((map.current.getZoom() ?? 12) + delta);
  };

  const recenter = () => {
    moved.current = false;
    setMovedByHand(false);
    fit();
  };

  return (
    <View style={styles.wrap} testID={testID}>
      {/* The map owns the drag: the phone frame's mouse-as-finger scrolling stays out of it (TouchEmulation). */}
      <div ref={host} data-gesture-owner="map" style={{ height: HEIGHT, width: "100%" }} />
      <View style={styles.zoom}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => zoom(1)} style={styles.button} testID={`${testID}-zoom-in`}>
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => zoom(-1)} style={styles.button} testID={`${testID}-zoom-out`}>
          <Text style={styles.buttonText}>−</Text>
        </Pressable>
        {movedByHand && points.current.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Recenter" onPress={recenter} style={styles.button} testID={`${testID}-recenter`}>
            <Icon name="recenter" size={20} color={theme.color.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      height: HEIGHT,
      borderRadius: theme.radius.md,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    zoom: {
      position: "absolute",
      top: theme.spacing.sm,
      right: theme.spacing.sm,
      gap: theme.spacing.xs,
      zIndex: 1000,
    },
    button: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: {
      fontSize: 22,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.text,
    },
  });
