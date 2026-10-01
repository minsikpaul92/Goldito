import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/** Native builds render the app as-is. `AppShell.web.tsx` adds the desktop phone frame. */
export function AppShell({ children }: Props) {
  return <>{children}</>;
}
