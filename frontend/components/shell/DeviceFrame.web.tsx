import { ReactNode, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { PawWalk } from "../intro/PawWalk";
import { tokens } from "../../theme/tokens";

const BEZEL = 12;
const STATUS_BAR_HEIGHT = 44;
const HOME_INDICATOR_HEIGHT = 28;
const PAGE_MARGIN = tokens.spacing.md;
const MIN_SCALE = 0.5;
const BODY_WIDTH = tokens.layout.frameWidth + BEZEL * 2;

type Props = {
  /** The app screen (an iframe) shown between the status bar and home indicator. */
  children: ReactNode;
  /** Phones side by side on the page (split view 10.10): each one scales to its share of the width. */
  columns?: number;
  /** A line above the phone, e.g. "Owner · Robert" in split view. */
  label?: string;
  /** A link below the phone (outside the app): Show both phones / Show one phone. */
  footer?: ReactNode;
  /** Page width taken by something beside the phones (the judge panel, #413). */
  reserve?: number;
  /** Split view: the phone sits at this edge of its column, half the gap away from the other phone. */
  hug?: "left" | "right";
  /** Covers the screen with the paw walk (the judge panel resetting the stay). */
  loading?: boolean;
};

// The gold coin of the app's boot screen (web: the master SVG).
const SYMBOL = require("../../assets/brand/goldito-symbol.svg");
/** How long the coin shows before the paw walk. */
const LOGO_MS = 1_200;

const LABEL_HEIGHT = 28;
const FOOTER_HEIGHT = 40;
/** Space between the two phones of the split view. */
const SPLIT_GAP = 32;

function frameScale(windowWidth: number, windowHeight: number, columns: number, reserve: number, extras: number) {
  const fitWidth = ((windowWidth - reserve) / columns - PAGE_MARGIN * 2) / BODY_WIDTH;
  const fitHeight = (windowHeight - PAGE_MARGIN * 2 - extras) / (tokens.layout.frameHeight + BEZEL * 2);
  return Math.max(MIN_SCALE, Math.min(1, fitWidth, fitHeight));
}

/**
 * Generic CSS phone (no device images or brand marks).
 * The app inside always lays out at the design size (402 x 874). Windows that are
 * too narrow or too short scale the whole phone down, so it keeps a phone's shape
 * (safe because the app lives in an iframe with its own coordinates).
 */
export function DeviceFrame({ children, columns = 1, label, footer, reserve = 0, hug, loading = false }: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const extras = (label ? LABEL_HEIGHT : 0) + (footer ? FOOTER_HEIGHT : 0);
  const scale = frameScale(windowWidth, windowHeight, columns, reserve, extras);
  const screenHeight = tokens.layout.frameHeight;
  const bodyHeight = screenHeight + BEZEL * 2;
  const hugStyle =
    hug === "right"
      ? { alignItems: "flex-end" as const, paddingRight: SPLIT_GAP / 2 }
      : hug === "left"
        ? { alignItems: "flex-start" as const, paddingLeft: SPLIT_GAP / 2 }
        : null;

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.pageContent, hugStyle]}>
      <View style={styles.stack}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={{ width: BODY_WIDTH * scale, height: bodyHeight * scale }}>
          <View style={[styles.body, { height: bodyHeight, transform: [{ scale }] }]}>
            <View style={styles.screen}>
              <StatusBar />
              <View style={styles.content}>
                {children}
                {loading ? <FrameLoading /> : null}
              </View>
              <View style={styles.homeIndicatorArea}>
                <View style={styles.homeIndicator} />
              </View>
            </View>
          </View>
        </View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </ScrollView>
  );
}

/** The gold coin logo for a moment (as the app opens), then the paw walk while the stay resets. */
function FrameLoading() {
  const [walking, setWalking] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWalking(true), LOGO_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.loading} accessibilityLabel="Setting up the stay" testID="frame-loading">
      {walking ? (
        <>
          <PawWalk loop />
          <Text style={styles.loadingText}>Setting up the stay…</Text>
        </>
      ) : (
        <Image source={SYMBOL} style={styles.coin} resizeMode="contain" testID="frame-loading-logo" />
      )}
    </View>
  );
}

/** A plain link for the page around the phones (no app providers out here, so no TextButton). */
export function FrameLink({ label, href, testID }: { label: string; href: string; testID: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => window.location.assign(href)} testID={testID}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

function StatusBar() {
  const time = useClock();

  return (
    <View style={styles.statusBar} aria-hidden>
      <Text style={styles.time}>{time}</Text>
      <View style={styles.camera} />
      <View style={styles.statusIcons}>
        <View style={styles.signal}>
          {[4, 6, 8, 10].map((barHeight) => (
            <View key={barHeight} style={[styles.signalBar, { height: barHeight }]} />
          ))}
        </View>
        <View style={styles.battery}>
          <View style={styles.batteryLevel} />
        </View>
      </View>
    </View>
  );
}

function formatTime(date: Date): string {
  const hours = date.getHours() % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function useClock(): string {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 15_000);
    return () => clearInterval(id);
  }, []);

  return time;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: tokens.color.frameBackdrop,
  },
  pageContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: PAGE_MARGIN,
  },
  stack: {
    alignItems: "center",
  },
  label: {
    height: LABEL_HEIGHT,
    fontSize: tokens.fontSize.body,
    fontWeight: "600",
    color: tokens.color.text,
  },
  footer: {
    height: FOOTER_HEIGHT,
    justifyContent: "center",
  },
  link: {
    fontSize: tokens.fontSize.body,
    fontWeight: "600",
    color: tokens.color.primary,
  },
  body: {
    width: BODY_WIDTH,
    padding: BEZEL,
    transformOrigin: "top left",
    borderRadius: 56,
    backgroundColor: tokens.color.frameBezel,
    boxShadow: `0 24px 60px ${tokens.color.frameShadow}`,
  },
  screen: {
    flex: 1,
    borderRadius: 44,
    overflow: "hidden",
    backgroundColor: tokens.color.surface,
  },
  statusBar: {
    height: STATUS_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: tokens.spacing.lg + tokens.spacing.xs,
    backgroundColor: tokens.color.surface,
  },
  time: {
    fontSize: tokens.fontSize.small,
    fontWeight: "600",
    color: tokens.color.text,
  },
  camera: {
    position: "absolute",
    left: "50%",
    top: tokens.spacing.md - tokens.spacing.xs,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: tokens.color.frameBezel,
  },
  statusIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  signal: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  signalBar: {
    width: 3,
    borderRadius: 1,
    backgroundColor: tokens.color.text,
  },
  battery: {
    width: 22,
    height: 11,
    padding: 1.5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: tokens.color.text,
  },
  batteryLevel: {
    flex: 1,
    width: "80%",
    borderRadius: 1.5,
    backgroundColor: tokens.color.text,
  },
  content: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  loading: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing.md,
    backgroundColor: tokens.color.background,
  },
  // The coin fills about 60% of its canvas, like BootView.
  coin: { width: 120, height: 120 },
  loadingText: {
    fontSize: tokens.fontSize.body,
    fontWeight: "600",
    color: tokens.color.textMuted,
  },
  homeIndicatorArea: {
    height: HOME_INDICATOR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.surface,
  },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 3,
    backgroundColor: tokens.color.text,
  },
});
