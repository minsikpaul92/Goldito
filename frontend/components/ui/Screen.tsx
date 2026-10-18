import { ReactNode, forwardRef } from "react";
import { ScrollView, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  children: ReactNode;
  contentStyle?: ViewStyle;
  testID?: string;
};

export const Screen = forwardRef<ScrollView, Props>(function Screen({ children, contentStyle, testID }, ref) {
  const styles = useThemedStyles(makeStyles);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        ref={ref}
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        testID={testID}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    content: {
      flexGrow: 1,
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
