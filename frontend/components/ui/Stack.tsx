import { ReactNode } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { useTheme } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  /** Space between children, by token name. Sections `lg`, fields `md`, related lines `xs`/`sm`. */
  gap?: keyof Theme["spacing"];
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Vertical rhythm for siblings. Use instead of per-child margins. */
export function Stack({ gap = "md", children, style, testID }: Props) {
  const theme = useTheme();
  return (
    <View style={[{ gap: theme.spacing[gap] }, style]} testID={testID}>
      {children}
    </View>
  );
}
