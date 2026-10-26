import { router, useLocalSearchParams } from "expo-router";
import { ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ViewTabs } from "./ui/ViewTabs";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type FeedView = "photos" | "diary";

/** `?view=diary` opens the Feed tab on the diary; anything else is the photos. */
export function useFeedView(): FeedView {
  const { view } = useLocalSearchParams<{ view?: string }>();
  return view === "diary" ? "diary" : "photos";
}

const BarRightContext = createContext<((node: ReactNode) => void) | null>(null);

/**
 * Puts something at the right end of the Photos / Diary row (the pet chip, #345; the Diary's pet and Book, #398) from a
 * screen further down. It is shown while this component is mounted and replaced when `signature` changes (what the
 * node shows, not its identity). Only the page in view is mounted, so each page sets its own.
 */
export function FeedBarRight({ children, signature }: { children: ReactNode; signature: string }) {
  const set = useContext(BarRightContext);
  const latest = useRef(children);
  latest.current = children;
  useEffect(() => {
    set?.(latest.current);
    return () => set?.(null);
  }, [set, signature]);
  return null;
}

/**
 * The Feed tab with Diary inside it (#329, Seulgi's five tabs): Photos / Diary tabs on top (underline tabs), the
 * chosen page under it. The choice is in the URL (`?view=`), so a link or a notice can open the diary.
 */
export function FeedSwitch({ photos, diary }: { photos: ReactNode; diary: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const view = useFeedView();
  const [right, setRight] = useState<ReactNode>(null);
  return (
    <BarRightContext.Provider value={setRight}>
    <View style={styles.root}>
      <View style={styles.bar}>
        <ViewTabs
          rule={false}
          options={[
            { value: "photos", label: "Photos" },
            { value: "diary", label: "Diary" },
          ]}
          value={view}
          onChange={(next) => router.setParams({ view: next === "diary" ? "diary" : undefined })}
          testID="feed-view"
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      <View style={styles.page}>{view === "diary" ? diary : photos}</View>
    </View>
    </BarRightContext.Provider>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    bar: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginHorizontal: 20,
      marginTop: theme.spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    right: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, paddingBottom: 6 },
    page: { flex: 1 },
  });
