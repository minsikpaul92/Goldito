import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Stack, Tabs } from "expo-router";
import { ComponentProps, ReactNode } from "react";
import { ColorValue, Platform, Pressable, StyleProp, ViewStyle } from "react-native";

import { HeaderActions } from "./HeaderActions";
import { LoadingView } from "./ui/LoadingView";
import { Role, homeFor, useSession } from "../providers/SessionProvider";
import { useTheme } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Tab bar icon from the interim outline set (Figma picks the final set). */
export function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

type TabButtonProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
  role?: "tab" | "button";
  "aria-label"?: string;
  "aria-selected"?: boolean;
};

/** The selected tab looks pushed in, like a pressed radio button: same colour, an inner shadow. */
function TabButton({ children, style, onPress, onLongPress, testID, role, ...aria }: TabButtonProps) {
  const theme = useTheme();
  const selected = aria["aria-selected"] === true;
  const pushedIn: ViewStyle = Platform.select<ViewStyle>({
    web: { boxShadow: "inset 0 3px 6px rgba(0,0,0,0.28), inset 0 1px 2px rgba(0,0,0,0.18)" } as ViewStyle,
    default: { borderWidth: 1, borderColor: theme.color.border },
  })!;
  return (
    <Pressable
      accessibilityRole={role === "tab" ? "tab" : "button"}
      accessibilityState={{ selected }}
      aria-label={aria["aria-label"]}
      aria-selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      style={[style, { marginVertical: 5, marginHorizontal: 5, borderRadius: 8 }, selected && pushedIn]}
    >
      {children}
    </Pressable>
  );
}

function headerOptions(theme: Theme) {
  return {
    headerShadowVisible: false,
    headerStyle: { backgroundColor: theme.color.surface },
    headerTintColor: theme.color.primary,
    headerTitleStyle: {
      color: theme.color.text,
      fontSize: theme.fontSize.body,
      fontWeight: "600" as const,
    },
  };
}

type StackProps = {
  role: Role;
  children?: ReactNode;
};

/**
 * Stack for one role area (`app/owner/_layout.tsx`, `app/sitter/_layout.tsx`): the tabs
 * plus detail screens pushed on top with a back button. Guarded — signed-out users go to
 * Welcome (OB.1), the other role goes to its own home, so typing /owner as a sitter lands on
 * /sitter (phase-03 3.3, architecture D26).
 */
export function RoleStack({ role, children }: StackProps) {
  const theme = useTheme();
  const session = useSession();

  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn") return <Redirect href="/welcome" />;
  if (session.profile.role !== role) return <Redirect href={homeFor(session.profile.role)} />;

  return (
    <Stack
      screenOptions={{
        ...headerOptions(theme),
        contentStyle: { backgroundColor: theme.color.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {children}
    </Stack>
  );
}

/**
 * The role's bottom tabs (`app/<role>/(tabs)/_layout.tsx`). expo-router JS `Tabs`
 * (not NativeTabs) so the sitter desktop layout can move them to a sidebar later (D25).
 */
export function RoleTabs({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        ...headerOptions(theme),
        headerRight: () => <HeaderActions />,
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarButton: (props) => <TabButton {...(props as unknown as TabButtonProps)} />,
        tabBarStyle: {
          height: theme.layout.tabBarHeight,
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
        },
        sceneStyle: { backgroundColor: theme.color.background },
      }}
    >
      {children}
    </Tabs>
  );
}
