import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Stack, Tabs } from "expo-router";
import { ComponentProps, ReactNode } from "react";
import { ColorValue, Platform, Pressable, StyleProp, View, ViewStyle } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderActions } from "./HeaderActions";
import { LoadingView } from "./ui/LoadingView";
import { Role, homeFor, useSession } from "../providers/SessionProvider";
import { useTheme } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Tab bar icon from the interim outline set (Figma picks the final set). */
export function tabIcon(name: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <TabIcon name={name} color={color} size={size} focused={focused} />
  );
}

function TabIcon({ name, color, size, focused }: { name: IconName; color: ColorValue; size: number; focused: boolean }) {
  const theme = useTheme();
  if (theme.ui.tabs !== "pill") return <Ionicons name={name} color={color} size={size} />;
  return (
    <View
      style={{
        width: 54,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? theme.color.accent : "transparent",
      }}
    >
      <Ionicons name={name} color={color} size={22} />
    </View>
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
  const pill = theme.ui.tabs === "pill";
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
      style={[style, !pill && { marginVertical: 5, marginHorizontal: 5, borderRadius: 8 }, selected && !pill && pushedIn]}
    >
      {children}
    </Pressable>
  );
}

/** Header look shared by every role stack and tab. The screen title takes the skin's display face, if any. */
export function headerOptions(theme: Theme) {
  const display = theme.fontFamily.display;
  return {
    headerShadowVisible: false,
    headerStyle: { backgroundColor: theme.ui.chrome },
    headerTintColor: theme.color.primary,
    headerTitleStyle: {
      color: theme.color.text,
      fontSize: display ? theme.fontSize.title : theme.fontSize.body,
      // The display file carries its own weight; a fontWeight on top would fake-bold it.
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.semibold }),
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
  const pill = theme.ui.tabs === "pill";
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        ...headerOptions(theme),
        headerRight: () => <HeaderActions />,
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarButton: (props) => <TabButton {...(props as unknown as TabButtonProps)} />,
        tabBarStyle: pill
          ? {
              // 10 top + 30 pill + 4 + 16 label + 10, then the safe area (22 on a frameless phone, as in Figma).
              height: 70 + Math.max(insets.bottom, 12),
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 12),
              paddingHorizontal: 8,
              backgroundColor: theme.color.surface,
              borderTopColor: theme.color.border,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              ...Platform.select<ViewStyle>({
                web: { boxShadow: "0 -8px 12px rgba(27,67,50,0.08)" } as ViewStyle,
                default: { elevation: 8 },
              }),
            }
          : {
              height: theme.layout.tabBarHeight,
              backgroundColor: theme.ui.chrome,
              borderTopColor: theme.color.border,
            },
        ...(pill
          ? {
              tabBarItemStyle: { paddingTop: 0, paddingBottom: 0 },
              tabBarIconStyle: { width: 54, height: 30 },
              tabBarLabelStyle: { fontSize: 11.5, lineHeight: 16, fontWeight: theme.fontWeight.bold, marginTop: 4 },
            }
          : null),
        sceneStyle: { backgroundColor: theme.color.background },
      }}
    >
      {children}
    </Tabs>
  );
}
