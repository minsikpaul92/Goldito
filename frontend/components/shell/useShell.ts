import { createContext, useContext } from "react";

export type ShellInfo = {
  /** True when the app runs inside the desktop phone frame (iframe). */
  embedded: boolean;
};

export const ShellContext = createContext<ShellInfo>({ embedded: false });

export function useShell(): ShellInfo {
  return useContext(ShellContext);
}
