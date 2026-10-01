export type LayoutMode = "compact" | "expanded";

/**
 * The only layout switch screens may use (architecture D25).
 * Always "compact" (phone) during the hackathon; "expanded" is reserved for
 * the post-hackathon sitter desktop layout.
 */
export function useLayoutMode(): LayoutMode {
  return "compact";
}
