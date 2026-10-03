import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Stack, Tabs } from "expo-router";
import { ComponentProps, ReactNode, useEffect, useRef } from "react";
import { Animated, ColorValue, Easing } from "react-native";

import { HeaderActions } from "./HeaderActions";
import { LoadingView } from "./ui/LoadingView";
import { PressableScale } from "./ui/PressableScale";
import { nativeDriver, useReducedMotion } from "./ui/motion";
import { Role, homeFor, useSession } from "../providers/SessionProvider";
import { useTheme } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * Tab bar icon from the interim outline set (Figma picks the final set). The active tab shows
 * the filled glyph and nudges once when it becomes active.
 */
export function tabIcon(name: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <TabIcon name={name} color={color} size={size} focused={focused} />
  );
}

function TabIcon({ name, color, size, focused }: { name: IconName; color: ColorValue; size: number; focused: boolean }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const wasFocused = useRef(focused);

  useEffect(() => {
    const becameActive = focused && !wasFocused.current;
    wasFocused.current = focused;
    if (!becameActive || reduced) return;
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.12,
        duration: theme.motion.fast,
        easing: Easing.out(Easing.quad),
        useNativeDriver: nativeDriver,
      }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: nativeDriver }),
    ]).start();
  }, [focused, reduced, scale, theme]);

  const filled = name.replace(/-outline$/, "") as IconName;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={focused ? filled : name} color={color} size={size} />
    </Animated.View>
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
 * sign in, the other role goes to its own home, so typing /owner as a sitter lands on
 * /sitter (phase-03 3.3, architecture D26).
 */
export function RoleStack({ role, children }: StackProps) {
  const theme = useTheme();
  const session = useSession();

  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn") return <Redirect href="/login" />;
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
        tabBarStyle: {
          height: theme.layout.tabBarHeight,
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
        },
        sceneStyle: { backgroundColor: theme.color.background },
        // Same press feel as every other tappable.
        tabBarButton: ({ href: _href, onPress, ...props }) => (
          <PressableScale {...props} onPress={(event) => onPress?.(event)} />
        ),
      }}
    >
      {children}
    </Tabs>
  );
}
