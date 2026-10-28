import { useEffect, useMemo, useRef, useState } from "react";
import { Image, LayoutChangeEvent, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Icon } from "./ui/Icon";

const ZOOM_MAX = 4;
const ZOOM_STEP = 1.2;
/** Longest side of the cropped copy that is uploaded. */
const OUT_MAX = 1600;
const BACKGROUND = "#F3EDE0";

type Size = { w: number; h: number };

export type PhotoFrameHandle = { crop: () => Promise<File | null> };

type Props = {
  url: string;
  file: File;
  /** Frame width / height. */
  aspect: number;
  /** Told once the editor can hand back its crop. */
  onReady: (handle: PhotoFrameHandle) => void;
};

/**
 * A photo in a frame (`pickMedia({ frame })`): drag it to move, the − and + buttons or the mouse wheel to make it
 * smaller or bigger. It starts filling the frame and can shrink until the whole photo shows (the rest is paper-coloured).
 * `crop()` draws exactly what shows in the frame into a new image file.
 */
export function PhotoFrame({ url, file, aspect, onReady }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [natural, setNatural] = useState<Size | null>(null);
  const [view, setView] = useState<Size | null>(null);
  // zoom 1 = the photo fills the frame; below 1 down to `fit` shows all of it. Offset: the photo's top left in the frame.
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let live = true;
    Image.getSize(
      url,
      (w, h) => live && setNatural({ w, h }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [url]);

  const geometry = useMemo(() => {
    if (!natural || !view) return null;
    const cover = Math.max(view.w / natural.w, view.h / natural.h);
    const fit = Math.min(view.w / natural.w, view.h / natural.h);
    return { cover, zoomMin: fit / cover };
  }, [natural, view]);

  const clamp = (x: number, y: number, z: number) => {
    if (!natural || !view || !geometry) return { x, y };
    const scale = geometry.cover * z;
    const dw = natural.w * scale;
    const dh = natural.h * scale;
    const range = (frame: number, shown: number, at: number) => Math.min(Math.max(at, Math.min(0, frame - shown)), Math.max(0, frame - shown));
    return { x: range(view.w, dw, x), y: range(view.h, dh, y) };
  };

  // Centered to start with.
  useEffect(() => {
    if (!natural || !view || !geometry) return;
    const scale = geometry.cover;
    setZoom(1);
    setOffset({ x: (view.w - natural.w * scale) / 2, y: (view.h - natural.h * scale) / 2 });
  }, [natural, view, geometry]);

  const live = useRef({ offset, zoom, clamp });
  live.current = { offset, zoom, clamp };
  const start = useRef({ x: 0, y: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start.current = { ...live.current.offset };
        },
        onPanResponderMove: (_e, g) => setOffset(live.current.clamp(start.current.x + g.dx, start.current.y + g.dy, live.current.zoom)),
      }),
    [],
  );

  /** Zoom about the frame's centre, so what is in the middle stays there. */
  const zoomTo = (next: number) => {
    if (!natural || !view || !geometry) return;
    const z = Math.min(ZOOM_MAX, Math.max(geometry.zoomMin, next));
    const ratio = z / zoom;
    const cx = view.w / 2;
    const cy = view.h / 2;
    setZoom(z);
    setOffset(clamp(cx - (cx - offset.x) * ratio, cy - (cy - offset.y) * ratio, z));
  };
  const liveZoom = useRef(zoomTo);
  liveZoom.current = zoomTo;

  const crop = async (): Promise<File | null> => {
    if (!natural || !view || !geometry || typeof document === "undefined") return null;
    const scale = geometry.cover * zoom;
    const outW = Math.min(OUT_MAX, Math.max(400, Math.round(view.w / scale)));
    const outH = Math.round(outW / aspect);
    const k = outW / view.w;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("The photo didn't load."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, natural.w, natural.h, offset.x * k, offset.y * k, natural.w * scale * k, natural.h * scale * k);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return null;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  };
  const cropRef = useRef(crop);
  cropRef.current = crop;
  useEffect(() => {
    onReady({ crop: () => cropRef.current() });
  }, [onReady]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setView((now) => (now && now.w === width && now.h === height ? now : { w: width, h: height }));
  };

  const scale = geometry ? geometry.cover * zoom : 1;
  const wheel =
    Platform.OS === "web"
      ? ({
          onWheel: (event: { deltaY: number; preventDefault?: () => void }) => {
            event.preventDefault?.();
            liveZoom.current(zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
          },
        } as object)
      : null;

  return (
    <View style={styles.wrap}>
      <View style={[styles.frame, { aspectRatio: aspect }]} onLayout={onLayout} testID="photo-frame" {...pan.panHandlers} {...wheel}>
        {natural && view ? (
          <Image
            source={{ uri: url }}
            style={{ position: "absolute", left: offset.x, top: offset.y, width: natural.w * scale, height: natural.h * scale }}
            accessibilityIgnoresInvertColors
            // Dragging moves the photo, never the browser's own image drag.
            {...(Platform.OS === "web" ? ({ draggable: false } as object) : null)}
          />
        ) : null}
      </View>
      <View style={styles.zoomRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Smaller" onPress={() => zoomTo(zoom / ZOOM_STEP)} style={styles.zoomButton} testID="photo-frame-smaller">
          <Icon name="remove" size={20} color="#1B4332" />
        </Pressable>
        <Text style={styles.hint}>Drag to move</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Bigger" onPress={() => zoomTo(zoom * ZOOM_STEP)} style={styles.zoomButton} testID="photo-frame-bigger">
          <Icon name="add" size={20} color="#1B4332" />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.spacing.sm },
    frame: { width: "100%", overflow: "hidden", borderRadius: theme.radius.sm, borderWidth: 2, borderColor: theme.color.text, backgroundColor: BACKGROUND },
    zoomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
    zoomButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
