/** Interim design tokens (8px grid). Replace with Figma variables when ready. */
export const tokens = {
  color: {
    background: "#F7F7F5",
    surface: "#FFFFFF",
    text: "#1A1A1A",
    textMuted: "#5C5C5C",
    primary: "#2D6A4F",
    primaryText: "#FFFFFF",
    border: "#E5E5E0",
    error: "#B42318",
    success: "#067647",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
  fontSize: {
    title: 24,
    body: 16,
    small: 14,
  },
} as const;
