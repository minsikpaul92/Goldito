import { Asset } from "expo-asset";
import { createElement, useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { DemoSample } from "../lib/demoSamples";
import { MediaKind } from "../lib/media";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";

type Props = {
  visible: boolean;
  mediaTypes: MediaKind[];
  samples: DemoSample[];
  /** Phones: open the camera. Hidden on desktops, which usually have none. */
  canTakePhoto: boolean;
  onPickSample: (sample: DemoSample) => void;
  onUpload: () => void;
  onTakePhoto: () => void;
  onClose: () => void;
};

/**
 * The picker sheet behind `pickMedia()` (DESIGN.md §6 MediaPicker): sample photos for the
 * desktop frame and demo accounts, plus **Choose from library** (file / gallery picker).
 * Everything is a click.
 */
export function MediaPicker({
  visible,
  mediaTypes,
  samples,
  canTakePhoto,
  onPickSample,
  onUpload,
  onTakePhoto,
  onClose,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const withVideo = mediaTypes.includes("video");
  const withImage = mediaTypes.includes("image");
  const title = withVideo && withImage ? "Add a photo or video" : withVideo ? "Add a video" : "Add a photo";
  const showSamples = samples.length > 0;

  return (
    <Sheet visible={visible} title={title} onClose={onClose} testID="media-picker">
      {showSamples ? (
        <View>
          <Text style={styles.heading}>{withVideo && !withImage ? "Sample videos" : "Sample photos"}</Text>
          <View style={styles.grid}>
            {samples.map((sample) => (
              <Pressable
                key={sample.id}
                accessibilityRole="button"
                accessibilityLabel={`Use sample: ${sample.label}`}
                onPress={() => onPickSample(sample)}
                style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                testID={`sample-${sample.id}`}
              >
                {/* Fixed square; contain so portrait samples are not cropped/pixel-zoomed. */}
                <View style={styles.thumb}>
                  {sample.kind === "video" ? (
                    <SampleVideoThumb source={sample.source} styles={styles} />
                  ) : (
                    <Image
                      source={sample.source}
                      style={styles.thumbImage}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                  )}
                </View>
                <Text numberOfLines={1} style={styles.tileLabel}>
                  {sample.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {canTakePhoto && withImage ? (
          <Button label="Take photo" onPress={onTakePhoto} variant="secondary" testID="media-take-photo" />
        ) : null}
        <Button
          label="Choose from library"
          onPress={onUpload}
          variant="secondary"
          testID="media-choose-library"
        />
      </View>
    </Sheet>
  );
}

function SampleVideoThumb({
  source,
  styles,
}: {
  source: number;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // RN-web has no Image.resolveAssetSource — same path as MediaPickerProvider.
        const asset = Asset.fromModule(source);
        await asset.downloadAsync();
        if (!cancelled) setUri(asset.localUri ?? asset.uri);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Safari often leaves <video preload=metadata> black until a frame is decoded —
  // seek a hair past 0 so the tray shows the first frame.
  const onMeta = (el: HTMLVideoElement | null) => {
    if (!el) return;
    const paint = () => {
      try {
        if (el.currentTime < 0.05) el.currentTime = 0.05;
      } catch {
        /* ignore seek errors before ready */
      }
    };
    el.addEventListener("loadedmetadata", paint, { once: true });
    el.addEventListener("loadeddata", paint, { once: true });
  };

  if (Platform.OS === "web" && uri && !failed) {
    return createElement("video", {
      ref: onMeta,
      // #t=0.1 hints browsers to decode near the start for a poster-like frame.
      src: `${uri}#t=0.1`,
      muted: true,
      playsInline: true,
      "webkit-playsinline": "true",
      preload: "auto",
      style: {
        width: "100%",
        height: "100%",
        objectFit: "contain",
        backgroundColor: "#1A1A1A",
      },
      onError: () => setFailed(true),
    });
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.videoThumb]}>
      <Text style={styles.videoBadge}>▶ video</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    heading: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.textMuted,
      marginBottom: theme.spacing.sm,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
    },
    tile: {
      width: "31%",
      gap: theme.spacing.xs,
    },
    pressed: {
      opacity: 0.8,
    },
    thumb: {
      width: "100%",
      aspectRatio: 1,
      overflow: "hidden",
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      alignItems: "center",
      justifyContent: "center",
    },
    thumbImage: {
      width: "100%",
      height: "100%",
    },
    videoThumb: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.text,
    },
    videoBadge: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.primaryText,
    },
    tileLabel: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    note: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    actions: {
      gap: theme.spacing.sm,
    },
  });
