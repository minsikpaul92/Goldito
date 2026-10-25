import { router, useLocalSearchParams } from "expo-router";
import { ReactNode } from "react";
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

/**
 * The Feed tab with Diary inside it (#329, Seulgi's five tabs): Photos / Diary tabs on top (underline tabs), the
 * chosen page under it. The choice is in the URL (`?view=`), so a link or a notice can open the diary.
 */
export function FeedSwitch({ photos, diary }: { photos: ReactNode; diary: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const view = useFeedView();
  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <ViewTabs
          options={[
            { value: "photos", label: "Photos" },
            { value: "diary", label: "Diary" },
          ]}
          value={view}
          onChange={(next) => router.setParams({ view: next === "diary" ? "diary" : undefined })}
          testID="feed-view"
        />
      </View>
      <View style={styles.page}>{view === "diary" ? diary : photos}</View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    bar: { paddingHorizontal: 20, paddingTop: theme.spacing.xs },
    page: { flex: 1 },
  });
