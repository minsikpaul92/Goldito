import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs } from "expo-router";
import { ComponentProps, ReactNode } from "react";
import { ColorValue } from "react-native";

import { HeaderActions } from "./HeaderActions";
import { LoadingView } from "./ui/LoadingView";
import { Role, homeFor, useSession } from "../providers/SessionProvider";
import { useTheme } from "../providers/ThemeProvider";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Tab bar icon from the interim outline set (Figma picks the final set). */
export function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

type Props = {
  role: Role;
  children: ReactNode;
};

/**
 * Tabs for one role area, guarded: signed-out users go to sign in, the other role goes
 * to its own home — so typing /owner as a sitter lands on /sitter (phase-03 3.3).
 * expo-router JS `Tabs` (not NativeTabs) so the sitter desktop layout can move them
 * to a sidebar later (architecture D25).
 */
export function RoleTabs({ role, children }: Props) {
  const theme = useTheme();
  const session = useSession();

  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn") return <Redirect href="/login" />;
  if (session.profile.role !== role) return <Redirect href={homeFor(session.profile.role)} />;

  return (
    <Tabs
      screenOptions={{
        headerRight: () => <HeaderActions />,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.color.surface },
        headerTitleStyle: {
          color: theme.color.text,
          fontSize: theme.fontSize.body,
          fontWeight: "600",
        },
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarStyle: { backgroundColor: theme.color.surface, borderTopColor: theme.color.border },
        sceneStyle: { backgroundColor: theme.color.background },
      }}
    >
      {children}
    </Tabs>
  );
}
