import { ReactNode, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { tokens } from "../../theme/tokens";

const BEZEL = 12;
const STATUS_BAR_HEIGHT = 44;
const HOME_INDICATOR_HEIGHT = 28;
const PAGE_MARGIN = tokens.spacing.md;
const MIN_SCREEN_HEIGHT = 600;

type Props = {
  /** The app screen (an iframe) shown between the status bar and home indicator. */
  children: ReactNode;
};

/**
 * Generic CSS phone (no device images or brand marks).
 * Width stays at the design frame; on short windows only the height shrinks.
 */
export function DeviceFrame({ children }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const screenHeight = Math.min(
    tokens.layout.frameHeight,
    Math.max(MIN_SCREEN_HEIGHT, windowHeight - PAGE_MARGIN * 2 - BEZEL * 2),
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={[styles.body, { height: screenHeight + BEZEL * 2 }]}>
        <View style={styles.screen}>
          <StatusBar />
          <View style={styles.content}>{children}</View>
          <View style={styles.homeIndicatorArea}>
            <View style={styles.homeIndicator} />
          </View>
        </View>
      </View>
    </ScrollView>
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
  body: {
    width: tokens.layout.frameWidth + BEZEL * 2,
    padding: BEZEL,
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
