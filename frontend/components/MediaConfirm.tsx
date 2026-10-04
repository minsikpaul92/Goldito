import { createElement, useEffect, useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";

type Props = {
  visible: boolean;
  file: File | null;
  /** Primary button, e.g. "Use photo & mark done". */
  confirmLabel: string;
  onConfirm: () => void;
  onRetake: () => void;
  onClose: () => void;
};

/** Preview of the photo (or video) just picked or taken, before it is used (`pickMedia({ confirm })`). */
export function MediaConfirm({ visible, file, confirmLabel, onConfirm, onRetake, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || Platform.OS !== "web") {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const isVideo = file?.type.startsWith("video/");

  return (
    <Sheet
      visible={visible}
      title={isVideo ? "Use this video?" : "Use this photo?"}
      onClose={onClose}
      testID="media-confirm"
      footer={
        <View style={styles.footer}>
          <Button label={confirmLabel} onPress={onConfirm} testID="media-confirm-use" />
          <Button label="Retake" variant="secondary" onPress={onRetake} testID="media-confirm-retake" />
        </View>
      }
    >
      <View style={styles.preview} testID="media-confirm-preview">
        {url && isVideo
          ? createElement("video", {
              src: url,
              controls: true,
              muted: true,
              playsInline: true,
              style: { width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" },
            })
          : url
            ? (
                <Image source={{ uri: url }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
              )
            : null}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    preview: {
      width: "100%",
      aspectRatio: 1,
      overflow: "hidden",
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.text,
    },
    image: { width: "100%", height: "100%" },
    footer: { gap: theme.spacing.sm },
  });
