import type { TextStyle, ViewStyle } from "react-native";

import { Theme } from "../../theme/themes";

/**
 * The one look for anything you pick (design site: decisions.html · qa-sitter-card.html, Oct 21–22):
 * a white chip with a strong line, mint with an ink ring when selected. Ink fill is for primary buttons only.
 * Chips, segments, choice chips and option cards all spread these, so a change here changes every picker.
 */
export function selectable(theme: Theme) {
  const chip: ViewStyle = {
    minHeight: theme.layout.touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.ui.radius.chip,
    borderWidth: 1.5,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface,
  };
  const chipOn: ViewStyle = { borderWidth: 2, borderColor: theme.color.text, backgroundColor: theme.color.accent };
  const label: TextStyle = { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text };
  const labelOn: TextStyle = { color: theme.color.text };
  const card: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    minHeight: 72,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface,
  };
  const cardOn: ViewStyle = { borderWidth: 2, borderColor: theme.color.text, backgroundColor: theme.color.accent };
  return { chip, chipOn, label, labelOn, card, cardOn };
}
