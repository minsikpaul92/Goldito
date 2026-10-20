import { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { Sheet } from "./ui/Sheet";
import { deliveryUrl } from "../lib/cloudinary";
import type { ProfilePhoto } from "../features/profile/profilePhotosApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  title: string;
  photos: ProfilePhoto[];
  onClose: () => void;
  testID?: string;
};

/** A person's photos, big, one at a time: swipe or scroll sideways (a mouse works too). */
export function PhotoViewerSheet({ visible, title, photos, onClose, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  return (
    <Sheet visible={visible} title={title} onClose={onClose} testID={testID}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={photos.length > 1}>
          {photos.map((photo, i) => (
            <Image
              key={photo.id}
              source={{ uri: deliveryUrl(photo.publicId, 900) }}
              style={[styles.photo, { width: width || 320, height: width || 320 }]}
              resizeMode="cover"
              accessibilityLabel={`${title}, photo ${i + 1}`}
              testID={testID ? `${testID}-photo-${i + 1}` : undefined}
            />
          ))}
        </ScrollView>
        {photos.length > 1 ? <Text style={styles.count}>{`${photos.length} photos, swipe for more`}</Text> : null}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    photo: { backgroundColor: theme.color.border, borderRadius: theme.radius.lg },
    count: { marginTop: theme.spacing.xs, textAlign: "center", fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
