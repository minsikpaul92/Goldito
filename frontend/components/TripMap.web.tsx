import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import type { TripMapProps } from "./tripMapProps";

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
 * The trip map (phase-06b 6B.3, D32): Leaflet + OpenStreetMap tiles, **view only**. It fits the traveller and the
 * place on its own and has ± buttons — no drag-pan, wheel or pinch, so a drag over it scrolls the screen like
 * anywhere else in the phone frame (DESIGN.md §7.7).
 */
export function TripMap({ traveler, dest, travelerLabel, testID = "trip-map" }: TripMapProps) {
  const styles = useThemedStyles(makeStyles);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<{ traveler?: L.Marker; dest?: L.Marker }>({});
  // After the person has used ± the map stops re-fitting on every new position.
  const zoomedByHand = useRef(false);

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      touchZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      attributionControl: true,
    });
    instance.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(instance);
    instance.setView([43.6532, -79.3832], 12);
    map.current = instance;
    const current = markers.current;
    return () => {
      instance.remove();
      map.current = null;
      delete current.traveler;
      delete current.dest;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const sync = (key: "traveler" | "dest", at: { lat: number; lng: number } | null, icon: L.DivIcon) => {
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
    if (zoomedByHand.current) return;
    const points = [traveler, dest].filter((p): p is { lat: number; lng: number } => p != null);
    if (points.length === 2) {
      instance.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [40, 40],
        maxZoom: 16,
        animate: false,
      });
    } else if (points.length === 1) {
      instance.setView([points[0].lat, points[0].lng], 15, { animate: false });
    }
  }, [traveler, dest, travelerLabel]);

  const zoom = (delta: number) => {
    zoomedByHand.current = true;
    map.current?.setZoom((map.current.getZoom() ?? 12) + delta);
  };

  return (
    <View style={styles.wrap} testID={testID}>
      <div ref={host} style={{ height: HEIGHT, width: "100%" }} />
      <View style={styles.zoom}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => zoom(1)} style={styles.button} testID={`${testID}-zoom-in`}>
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => zoom(-1)} style={styles.button} testID={`${testID}-zoom-out`}>
          <Text style={styles.buttonText}>−</Text>
        </Pressable>
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
      fontWeight: "700",
      color: theme.color.text,
    },
  });
