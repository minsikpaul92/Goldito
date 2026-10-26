import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { sectionTitleStyle } from "./SectionTitle";
import { TextButton } from "./TextButton";
import { useReduceMotion } from "./useReduceMotion";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling body — the sheet's one primary action. */
  footer?: ReactNode;
  /** Keep a thin visible scrollbar on the desktop frame (a long page inside the sheet). */
  scrollbar?: boolean;
  /** The sheet applies each tap as it goes, so its footer's Done is the only way out: no Close in the header (U10). The backdrop and a pull down still close it. */
  doneOnly?: boolean;
  testID?: string;
};

/** Drag the handle or title this far (px) or this fast (px/ms) and the sheet goes: down closes, up fills the screen. */
const DRAG_DISTANCE = 110;
const DRAG_VELOCITY = 0.8;
const FULL_CLOSE_DISTANCE = 260;
const FULL_CLOSE_VELOCITY = 1.6;
/** A short pull springs back; the sheet follows the finger meanwhile. */
const OFF_SCREEN = 700;

/**
 * Bottom sheet with a visible Close; tapping the backdrop closes it too. Grab the handle or the title bar:
 * pull down to close (from full screen a short pull goes back to the normal height, a long one closes), pull up for full screen.
 * Inside the desktop frame it stays in the phone, because the app runs in the frame's iframe.
 */
export function Sheet({ visible, title, onClose, children, footer, scrollbar, doneOnly, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const [full, setFull] = useState(false);
  const dragY = useRef(new Animated.Value(0)).current;
  const fullRef = useRef(full);
  fullRef.current = full;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Reset when the sheet opens, not when it closes: a sheet pulled down stays off screen while its backdrop fades,
  // instead of jumping back for a moment.
  useLayoutEffect(() => {
    if (visible) {
      setFull(false);
      dragY.setValue(0);
    }
  }, [visible, dragY]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a mostly vertical drag takes over, so a tap on Close still works.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => dragY.setValue(g.dy < 0 ? g.dy / 3 : g.dy),
        onPanResponderRelease: (_e, g) => {
          const back = () => Animated.spring(dragY, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
          if (g.dy > DRAG_DISTANCE || g.vy > DRAG_VELOCITY) {
            // From full screen a short pull steps down to the normal height; a long one closes.
            if (fullRef.current && g.dy < FULL_CLOSE_DISTANCE && g.vy < FULL_CLOSE_VELOCITY) {
              setFull(false);
              back();
            } else {
              Animated.timing(dragY, { toValue: OFF_SCREEN, duration: 160, useNativeDriver: false }).start(() => closeRef.current());
            }
          } else if (g.dy < -DRAG_DISTANCE / 2 || g.vy < -DRAG_VELOCITY) {
            setFull(true);
            back();
          } else back();
        },
        onPanResponderTerminate: () => Animated.spring(dragY, { toValue: 0, useNativeDriver: false }).start(),
      }),
    [dragY],
  );
  // The sheet rises from the bottom edge while the backdrop fades (audit F43); Reduce motion skips the rise.
  const rise = useRef(new Animated.Value(0)).current;
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  // Phones: animate the rise when the sheet opens (never restarted by a late Reduce motion answer).
  // Web: a CSS animation instead, so the sheet's buttons don't move under a pointer mid-tap.
  useEffect(() => {
    if (!visible || Platform.OS === "web") return;
    if (reduceRef.current) {
      rise.setValue(0);
      return;
    }
    rise.setValue(1);
    Animated.timing(rise, { toValue: 0, duration: theme.motion.base, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, rise, theme.motion.base]);
  const riseStyle =
    Platform.OS === "web"
      ? reduce
        ? null
        : ({
            animationKeyframes: [{ from: { transform: [{ translateY: 48 }] }, to: { transform: [{ translateY: 0 }] } }],
            animationDuration: `${theme.motion.base}ms`,
            animationTimingFunction: "cubic-bezier(0.215, 0.61, 0.355, 1)",
          } as object)
      : { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, 48] }) }] };

  return (
    <Modal visible={visible} transparent animationType={reduce ? "none" : "fade"} onRequestClose={onClose}>
      <View style={styles.root}>
        {/* The backdrop closes on tap but is not a focus stop: keyboard and screen readers use the named Close (audit F53). */}
        <Pressable
          aria-hidden
          focusable={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <Animated.View style={[styles.dragWrap, full && styles.dragFull, { transform: [{ translateY: dragY }] }]}>
        {/* Pulled up, the sheet lifts off the bottom edge: this white keeps growing under it instead of showing a gap. */}
        <View pointerEvents="none" style={styles.below} />
        <Animated.View
          accessibilityViewIsModal
          role="dialog"
          aria-modal
          aria-label={title}
          style={[styles.sheet, full && styles.sheetFull, full && { paddingTop: insets.top }, riseStyle]}
          testID={testID}
        >
          <View
            {...pan.panHandlers}
            {...(Platform.OS === "web" ? ({ dataSet: { gestureOwner: "true" } } as object) : null)}
            testID={testID ? `${testID}-grab` : undefined}
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              {doneOnly ? null : <TextButton label="Close" onPress={onClose} testID={testID ? `${testID}-close` : undefined} />}
            </View>
          </View>
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            {...(scrollbar && Platform.OS === "web" ? ({ dataSet: { scrollbar: "true" } } as object) : null)}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: theme.color.overlay,
    },
    // The wrapper holds the height limit (a percentage needs a parent with a height), the sheet shrinks inside it.
    dragWrap: { width: "100%", maxWidth: 480, maxHeight: "90%", alignSelf: "center" },
    below: { position: "absolute", top: "100%", left: 0, right: 0, height: 400, backgroundColor: theme.color.surface },
    dragFull: { height: "100%", maxHeight: "100%" },
    sheet: {
      flexShrink: 1,
      width: "100%",
      backgroundColor: theme.color.surface,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
    },
    sheetFull: { flex: 1, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
    // Grab handle: pull it down to close, up for full screen.
    handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: theme.color.border, marginTop: theme.spacing.sm },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingLeft: theme.spacing.md,
      paddingRight: theme.spacing.xs,
      paddingTop: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    title: { flex: 1, ...sectionTitleStyle(theme) },
    body: {
      padding: theme.spacing.md,
      gap: theme.spacing.md,
    },
    footer: {
      padding: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
  });
