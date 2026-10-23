import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { selectable } from "./selectable";

export type Section = { key: string; label: string; count?: number };

/**
 * Sticky section tabs that follow the scroll (design site: kit.html → Navigation): the active tab changes as sections
 * pass under it and slides into view; tapping a tab scrolls the page to that section. Pair with useSectionSpy.
 */
export function SectionTabs({ sections, active, onPick, testID }: { sections: Section[]; active: string; onPick: (key: string) => void; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  const rail = useRef<ScrollView>(null);
  const xs = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = xs.current[active];
    if (x != null) rail.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [active]);
  return (
    <View style={styles.bar} testID={testID}>
      <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} accessibilityRole="tablist">
        {sections.map((s) => {
          const on = s.key === active;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="tab"
              aria-selected={on}
              onLayout={(e: LayoutChangeEvent) => (xs.current[s.key] = e.nativeEvent.layout.x)}
              onPress={() => onPick(s.key)}
              style={[styles.tab, on && styles.tabOn]}
              testID={testID ? `${testID}-${s.key}` : undefined}
            >
              <Text style={styles.label}>
                {s.label}
                {s.count != null ? <Text style={styles.count}>{`  ${s.count}`}</Text> : null}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Tracks which section is under the sticky tabs and scrolls to a section on demand. */
export function useSectionSpy(keys: string[], offset = 64) {
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<Record<string, number>>({});
  const [active, setActive] = useState(keys[0]);
  const pinned = useRef<string | null>(null);
  const onSectionLayout = useCallback((key: string) => (e: LayoutChangeEvent) => {
    tops.current[key] = e.nativeEvent.layout.y;
  }, []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pinned.current) return;
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const y = contentOffset.y + offset;
      let cur = keys[0];
      for (const k of keys) if ((tops.current[k] ?? Infinity) <= y) cur = k;
      if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 4) cur = keys[keys.length - 1];
      setActive(cur);
    },
    [keys, offset],
  );
  const jump = useCallback(
    (key: string) => {
      setActive(key);
      pinned.current = key;
      scroll.current?.scrollTo({ y: Math.max(0, (tops.current[key] ?? 0) - offset + 8), animated: true });
      setTimeout(() => (pinned.current = null), 700);
    },
    [offset],
  );
  return { scroll, active, onScroll, onSectionLayout, jump };
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: { backgroundColor: theme.color.background, borderBottomWidth: 1, borderBottomColor: theme.color.border },
    rail: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
    tab: { ...selectable(theme).chip, minHeight: 40 },
    tabOn: selectable(theme).chipOn,
    label: selectable(theme).label,
    count: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
  });
