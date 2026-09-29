import { ReactNode } from "react";
import { ScrollView, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { tokens } from "../../theme/tokens";

type Props = {
  children: ReactNode;
  contentStyle?: ViewStyle;
};

export function Screen({ children, contentStyle }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    flexGrow: 1,
    padding: tokens.spacing.md,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
});
