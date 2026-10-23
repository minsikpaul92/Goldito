import { ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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
  testID?: string;
};

/**
 * Bottom sheet with a visible Close; tapping the backdrop closes it too. No drag to
 * dismiss (DESIGN.md §6 Sheet, §7.7). Inside the desktop frame it stays in the phone,
 * because the app runs in the frame's iframe.
 */
export function Sheet({ visible, title, onClose, children, footer, scrollbar, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
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
        <Animated.View
          accessibilityViewIsModal
          role="dialog"
          aria-modal
          aria-label={title}
          style={[styles.sheet, riseStyle]}
          testID={testID}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <TextButton label="Close" onPress={onClose} testID={testID ? `${testID}-close` : undefined} />
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
    sheet: {
      maxHeight: "90%",
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
      backgroundColor: theme.color.surface,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
    },
    // Grab handle: shows it's a sheet over the screen (no drag to dismiss, §7.7).
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
