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

const esc = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The live pulse and quieter Leaflet chrome, once per page (the ring stands still with reduced motion). */
function addStyles() {
  if (typeof document === "undefined" || document.getElementById("goldito-trip-css")) return;
  const style = document.createElement("style");
  style.id = "goldito-trip-css";
  style.textContent = `
    @keyframes goldito-trip-pulse{0%{transform:scale(1);opacity:.5}70%{transform:scale(2.4);opacity:0}100%{opacity:0}}
    .goldito-trip-pulse{animation:goldito-trip-pulse 1.8s ease-out infinite}
    @media (prefers-reduced-motion: reduce){.goldito-trip-pulse{animation:none;opacity:.3;transform:scale(1.6)}}
    .goldito-trip .leaflet-control-attribution{background:rgba(255,255,255,.7);font-size:10px;padding:1px 6px;border-top-left-radius:6px}
  `;
  document.head.appendChild(style);
}

/** The traveller: a white disc with the car, a ring pulsing out from it so it reads as moving. */
function travelerPin(label: string, ring: string, line: string, fill: string) {
  const d = 34;
  return L.divIcon({
    className: "goldito-pin",
    html:
      `<div role="img" aria-label="${esc(label)}" style="position:relative;width:${d}px;height:${d}px">` +
      `<span class="goldito-trip-pulse" style="position:absolute;inset:0;border-radius:50%;background:${ring}"></span>` +
      `<span style="position:absolute;inset:0;border-radius:50%;background:${fill};border:2px solid ${line};display:flex;align-items:center;justify-content:center;font-size:18px">🚗</span>` +
      `</div>`,
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
  });
}

/** The handoff place: a slightly tilted sticker with a house, its name in a dark tag beside it. */
function placePin(label: string, line: string, fill: string, tag: string, tagText: string) {
  const d = 34;
  return L.divIcon({
    className: "goldito-pin",
    html:
      `<div role="img" aria-label="${esc(label)}" style="position:relative;width:${d}px;height:${d}px">` +
      `<span style="position:absolute;inset:0;border-radius:9px;background:${fill};border:2px solid ${line};transform:rotate(-6deg);display:flex;align-items:center;justify-content:center;font-size:18px">🏠</span>` +
      `<span style="position:absolute;left:${d + 4}px;top:6px;white-space:nowrap;background:${tag};color:${tagText};font:600 12px/22px system-ui,sans-serif;padding:0 9px;border-radius:11px">${esc(label)}</span>` +
      `</div>`,
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
  });
}

/**
 * The trip map (phase-06b 6B.3, D32): Leaflet + Esri Light Gray tiles. It fits the traveller and the place on its own.
 * A finger or the mouse drags it, two fingers pinch zoom, and ± zoom. The wheel zooms only once the map has focus
 * (a click or Tab on it), so scrolling past it still scrolls the screen (#381).
 */
export function TripMap({ traveler, dest, travelerLabel, destLabel = "Handoff place", flush, height = HEIGHT, testID = "trip-map" }: TripMapProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<{ traveler?: L.Marker; dest?: L.Marker }>({});
  // The road so far (solid) and the rest of the way as the crow flies (dotted): no route service, only the points we have.
  const lines = useRef<{ done?: L.Polyline; left?: L.Polyline }>({});
  const trail = useRef<LatLng[]>([]);
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
    // Leaflet drops a new view while a zoom still animates (± or the wheel just before): fit once it has ended.
    if (instance.getPanes().mapPane.classList.contains("leaflet-zoom-anim")) {
      instance.once("zoomend", fit);
      return;
    }
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
    addStyles();
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
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16,
      attribution: "Tiles © Esri",
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
      lines.current = {};
      trail.current = [];
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
    const c = theme.color;
    sync("traveler", traveler, travelerPin(travelerLabel, c.primary, c.primary, c.surface));
    sync("dest", dest, placePin(destLabel, c.text, c.surface, c.text, c.surface));
    // Keep each new position on the trail; a jump back to nothing starts it again.
    if (!traveler) trail.current = [];
    else {
      const last = trail.current[trail.current.length - 1];
      if (!last || last.lat !== traveler.lat || last.lng !== traveler.lng) trail.current = [...trail.current.slice(-200), traveler];
    }
    const ll = (p: LatLng) => [p.lat, p.lng] as [number, number];
    const draw = (key: "done" | "left", at: LatLng[], style: L.PolylineOptions) => {
      const existing = lines.current[key];
      if (at.length < 2) {
        existing?.remove();
        delete lines.current[key];
      } else if (existing) existing.setLatLngs(at.map(ll));
      else lines.current[key] = L.polyline(at.map(ll), { interactive: false, ...style }).addTo(instance);
    };
    draw("done", trail.current, { color: c.primary, weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" });
    draw("left", traveler && dest ? [traveler, dest] : [], { color: c.primary, weight: 4, opacity: 0.55, dashArray: "1 9", lineCap: "round" });
    points.current = [traveler, dest].filter((p): p is LatLng => p != null);
    if (!moved.current) fit();
  }, [traveler, dest, travelerLabel, destLabel, theme, fit]);

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
    <View style={[styles.wrap, { height }, flush && styles.flush]} testID={testID}>
      {/* The map owns the drag: the phone frame's mouse-as-finger scrolling stays out of it (TouchEmulation). */}
      <div ref={host} className="goldito-trip" data-gesture-owner="map" style={{ height, width: "100%" }} />
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
    flush: { borderRadius: 0, borderWidth: 0, borderBottomWidth: 1 },
    wrap: {
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
