import { Asset } from "expo-asset";
import { createElement, useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { DemoSample, SampleCategory } from "../lib/demoSamples";
import { MediaKind } from "../lib/media";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { SegmentedControl } from "./ui/SegmentedControl";
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

const CATEGORY_META: Record<SampleCategory, { label: string; icon: string }> = {
  dog: { label: "🐶 Dogs", icon: "🐾 " },
  cat: { label: "🐱 Cats", icon: "🐱 " },
  human: { label: "👤 People", icon: "👤 " },
  treat: { label: "🍖 Treats", icon: "🍖 " },
};

/**
 * Option 3: Category tabs + Section-grouped scrolling list by subject name (Mumu, Max, Charlie, Bella...)
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
  const title =
    withVideo && withImage
      ? "Add a photo or video"
      : withVideo
        ? "Add a video"
        : "Add a photo";
  const showSamples = samples.length > 0;

  // Extract available categories
  const categories = useMemo(() => {
    const set = new Set<SampleCategory>();
    for (const s of samples) {
      if (s.category) set.add(s.category);
      else set.add("dog");
    }
    const order: SampleCategory[] = ["dog", "cat", "human", "treat"];
    return order.filter((c) => set.has(c));
  }, [samples]);

  const [activeCategory, setActiveCategory] = useState<SampleCategory>("dog");

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  const categoryOptions = useMemo(() => {
    return categories.map((cat) => ({
      value: cat,
      label: CATEGORY_META[cat]?.label ?? cat,
    }));
  }, [categories]);

  // Group samples in current category by subjectName
  const subjectSections = useMemo(() => {
    const map = new Map<string, DemoSample[]>();
    for (const s of samples) {
      const cat = s.category ?? "dog";
      if (cat !== activeCategory) continue;
      const name = s.subjectName ?? "Other";
      if (!map.has(name)) {
        map.set(name, []);
      }
      map.get(name)!.push(s);
    }
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      samples: items,
    }));
  }, [samples, activeCategory]);

  const categoryIcon = CATEGORY_META[activeCategory]?.icon ?? "";

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      testID="media-picker"
    >
      {showSamples ? (
        <View style={styles.sampleContainer}>
          {/* Tier 1: Category tabs */}
          {categories.length > 1 ? (
            <View style={styles.categoryControl}>
              <SegmentedControl
                options={categoryOptions}
                value={activeCategory}
                onChange={setActiveCategory}
                testID="media-category-tabs"
              />
            </View>
          ) : null}

          {/* Tier 2: Section-grouped photo grids by Subject */}
          {subjectSections.map((section, idx) => (
            <View
              key={section.name}
              style={[styles.section, idx === 0 && styles.firstSection]}
              testID={`sample-section-${section.name}`}
            >
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>
                    {categoryIcon}
                    {section.name}
                  </Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>
                      {section.samples.length}{" "}
                      {section.samples.length === 1 ? "photo" : "photos"}
                    </Text>
                  </View>
                </View>
                <View style={styles.sectionDivider} />
              </View>

              <View style={styles.grid}>
                {section.samples.map((sample) => (
                  <Pressable
                    key={sample.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Use sample: ${sample.label}`}
                    onPress={() => onPickSample(sample)}
                    style={({ pressed }) => [
                      styles.tile,
                      pressed && styles.pressed,
                    ]}
                    testID={`sample-${sample.id}`}
                  >
                    {/* Fixed square; contain so portrait samples are not cropped/pixel-zoomed. */}
                    <View style={styles.thumb}>
                      {sample.kind === "video" ? (
                        <SampleVideoThumb
                          source={sample.source}
                          styles={styles}
                        />
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
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {canTakePhoto && withImage ? (
          <Button
            label="Take photo"
            onPress={onTakePhoto}
            variant="secondary"
            testID="media-take-photo"
          />
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
    sampleContainer: {
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    categoryControl: {
      marginBottom: theme.spacing.xs,
    },
    section: {
      marginTop: theme.spacing.md,
    },
    firstSection: {
      marginTop: theme.spacing.xs,
    },
    sectionHeader: {
      marginBottom: theme.spacing.sm,
    },
    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      marginBottom: 6,
    },
    sectionTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.text,
    },
    sectionBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.accent,
    },
    sectionBadgeText: {
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.primary,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: theme.color.border,
      marginTop: 2,
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
      fontWeight: theme.fontWeight.semibold,
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
      marginTop: theme.spacing.xs,
    },
  });
