import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { useReduceMotion } from "./useReduceMotion";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: [Option<T>, Option<T>];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
};

/** A two-way switch: a pill with a sliding thumb under the chosen side (Photos / Diary). Tap either side. */
export function SlideToggle<T extends string>({ options, value, onChange, testID }: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = options[1].value === value ? 1 : 0;
  const position = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    if (reduce) position.setValue(index);
    else Animated.timing(position, { toValue: index, duration: 180, useNativeDriver: false }).start();
  }, [index, reduce, position]);

  const side = width / 2;
  return (
    <View accessibilityRole="radiogroup" style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID={testID}>
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { width: side - 4, transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [2, side + 2] }) }] }]}
        />
      ) : null}
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            aria-checked={on}
            onPress={() => onChange(option.value)}
            style={styles.side}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    track: {
      alignSelf: "flex-start",
      width: 220,
      height: 40,
      flexDirection: "row",
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    thumb: {
      position: "absolute",
      top: 2,
      bottom: 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.accent,
      borderWidth: 1,
      borderColor: theme.color.primary,
    },
    side: { flex: 1, alignItems: "center", justifyContent: "center" },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    labelOn: { color: theme.color.text, fontWeight: theme.fontWeight.bold },
  });
