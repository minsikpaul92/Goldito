import { Image, Pressable, StyleSheet, Text, View } from "react-native";

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
 * desktop frame and demo accounts, plus Upload from computer. Everything is a click.
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
  const showSamples = withImage && samples.length > 0;

  return (
    <Sheet visible={visible} title={title} onClose={onClose} testID="media-picker">
      {showSamples ? (
        <View>
          <Text style={styles.heading}>Sample photos</Text>
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
                {/* The wrapper owns the 4:3 box: react-native-web's Image keeps its file height. */}
                <View style={styles.thumb}>
                  <Image source={sample.source} style={StyleSheet.absoluteFill} resizeMode="cover" />
                </View>
                <Text numberOfLines={1} style={styles.tileLabel}>
                  {sample.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : withImage ? (
        <Text style={styles.note}>No sample photos for this kind of upload yet.</Text>
      ) : null}

      <View style={styles.actions}>
        {canTakePhoto && withImage ? (
          <Button label="Take photo" onPress={onTakePhoto} variant="secondary" testID="media-take-photo" />
        ) : null}
        <Button
          label="Upload from computer"
          onPress={onUpload}
          variant="secondary"
          testID="media-upload-computer"
        />
      </View>
    </Sheet>
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
      width: "48%",
      gap: theme.spacing.xs,
    },
    pressed: {
      opacity: 0.8,
    },
    thumb: {
      width: "100%",
      aspectRatio: 4 / 3,
      overflow: "hidden",
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.accent,
      borderWidth: 1,
      borderColor: theme.color.border,
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
