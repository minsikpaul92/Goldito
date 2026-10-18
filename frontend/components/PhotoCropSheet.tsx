import { useEffect, useMemo, useRef, useState } from "react";
import { Image, PanResponder, Platform, StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { Slider } from "./ui/Slider";
import { CROP_MAX_ZOOM, CROP_MIN_ZOOM, CropView, clampView, coverScale, cropToBlob } from "../lib/photoCrop";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const FRAME = 260;
/** One arrow tap or key press moves the photo this far (frame px). */
const NUDGE = 20;

type Props = {
  visible: boolean;
  /** The photo the person picked; null while the sheet is closed. */
  file: Blob | null;
  busy: boolean;
  error: string | null;
  /** The cropped square, ready to upload. */
  onConfirm: (cropped: Blob) => void;
  onClose: () => void;
};

type Loaded = { uri: string; width: number; height: number };

/**
 * Round crop for a profile photo (#135): the photo sits under a round window, drag it to move and use the slider to
 * zoom (it always covers the window). Web only, like the rest of the media code.
 */
export function PhotoCropSheet({ visible, file, busy, error, onConfirm, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [view, setView] = useState<CropView>({ zoom: 1, ox: 0, oy: 0 });
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef({ loaded, view });
  latest.current = { loaded, view };
  const start = useRef({ ox: 0, oy: 0 });

  useEffect(() => {
    setLoaded(null);
    setView({ zoom: 1, ox: 0, oy: 0 });
    setProblem(null);
    if (!visible || !file) return;
    let active = true;
    const uri = URL.createObjectURL(file);
    createImageBitmap(file, { imageOrientation: "from-image" })
      .then((bitmap) => {
        if (active) setLoaded({ uri, width: bitmap.width, height: bitmap.height });
        bitmap.close();
      })
      .catch(() => active && setProblem("Couldn't open this photo. Pick another one."));
    return () => {
      active = false;
      URL.revokeObjectURL(uri);
    };
  }, [visible, file]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start.current = { ox: latest.current.view.ox, oy: latest.current.view.oy };
        },
        onPanResponderMove: (_e, g) => {
          const { loaded: photo, view: current } = latest.current;
          if (!photo) return;
          setView(clampView(photo.width, photo.height, FRAME, { ...current, ox: start.current.ox + g.dx, oy: start.current.oy + g.dy }));
        },
      }),
    [],
  );

  const nudge = (dx: number, dy: number) => {
    if (!loaded) return;
    setView((v) => clampView(loaded.width, loaded.height, FRAME, { ...v, ox: v.ox + dx, oy: v.oy + dy }));
  };

  const onKeyDown = (e: { key: string; preventDefault?: () => void }) => {
    const move = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] }[e.key];
    if (move) {
      e.preventDefault?.();
      nudge(move[0], move[1]);
    }
  };

  const onWheel = (e: { deltaY: number; preventDefault?: () => void }) => {
    if (!loaded) return;
    e.preventDefault?.();
    setView((v) => clampView(loaded.width, loaded.height, FRAME, { ...v, zoom: v.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) }));
  };

  const confirm = async () => {
    if (!file || !loaded) return;
    setProblem(null);
    try {
      onConfirm(await cropToBlob(file, FRAME, view));
    } catch (e) {
      setProblem((e as Error).message);
    }
  };

  const scale = loaded ? coverScale(loaded.width, loaded.height, FRAME) * view.zoom : 1;
  const message = problem ?? error;

  return (
    <Sheet
      visible={visible}
      title="Crop your photo"
      onClose={onClose}
      testID="crop-sheet"
      footer={
        <Button label={busy ? "Saving…" : "Use photo"} onPress={() => void confirm()} disabled={busy || !loaded} testID="crop-confirm" />
      }
    >
      <View style={styles.center}>
        <View
          style={styles.frame}
          {...pan.panHandlers}
          {...(Platform.OS === "web" ? ({ focusable: true, onKeyDown, onWheel } as object) : null)}
          testID="crop-frame"
        >
          {loaded ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Image
                source={{ uri: loaded.uri }}
                style={{
                  position: "absolute",
                  width: loaded.width * scale,
                  height: loaded.height * scale,
                  left: (FRAME - loaded.width * scale) / 2 + view.ox,
                  top: (FRAME - loaded.height * scale) / 2 + view.oy,
                }}
                testID="crop-image"
              />
            </View>
          ) : null}
        </View>
      </View>
      <Slider
        value={Math.round(view.zoom * 100)}
        min={CROP_MIN_ZOOM * 100}
        max={CROP_MAX_ZOOM * 100}
        onChange={(value) => {
          if (loaded) setView((v) => clampView(loaded.width, loaded.height, FRAME, { ...v, zoom: value / 100 }));
        }}
        label="Zoom"
        valueText={`${Math.round(view.zoom * 100)}%`}
        testID="crop-zoom"
      />
      {message ? (
        <Text style={styles.error} testID="crop-error">
          {message}
        </Text>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    center: { alignItems: "center", paddingVertical: theme.spacing.md },
    frame: {
      width: FRAME,
      height: FRAME,
      borderRadius: FRAME / 2,
      overflow: "hidden",
      backgroundColor: theme.color.border,
      borderWidth: 2,
      borderColor: theme.color.primary,
      // Web: the drag belongs to the photo, not to page scrolling or text selection.
      ...(Platform.OS === "web" ? ({ userSelect: "none", touchAction: "none", cursor: "grab" } as object) : null),
    },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
