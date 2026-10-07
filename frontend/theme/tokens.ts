/** Design tokens (8px grid). Mirrors the Figma variables in *PawNote Design System*; change both together (DESIGN.md). */
export const tokens = {
  color: {
    background: "#F7F7F5",
    surface: "#FFFFFF",
    text: "#1A1A1A",
    textMuted: "#5C5C5C",
    primary: "#2D6A4F",
    primaryText: "#FFFFFF",
    /** Soft tint for highlights (selected chip background, badges). Text on it uses `text`. */
    accent: "#D8F3DC",
    border: "#E5E5E0",
    /** Outlines of things you interact with (inputs, checkboxes, chips, switch off). ≥ 3:1 on every surface. */
    borderStrong: "#86867F",
    /** Empty part of progress bars; `primary` stays ≥ 3:1 against it. */
    track: "#E5E5E0",
    error: "#B42318",
    success: "#067647",
    warning: "#B54708",
    /** Light backgrounds behind status text (Tag, Banner). Never put status text on its solid color. */
    errorSurface: "#FEF3F2",
    warningSurface: "#FFFAEB",
    successSurface: "#ECFDF3",
    /** Dimmed backdrop behind modals and sheets. */
    overlay: "rgba(26, 26, 26, 0.4)",
    // Desktop phone frame only (DESIGN.md §2.1)
    frameBackdrop: "#E8E8E3",
    frameBezel: "#1A1A1A",
    frameShadow: "rgba(26, 26, 26, 0.18)",
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
    /** (proposed) Tiny labels inside dense grids, e.g. slot letters in SlotCalendar. */
    caption: 11,
  },
  /** Icon / emoji sizes: header + inline (sm), cards (md), empty states (hero). */
  icon: {
    sm: 22,
    md: 28,
    hero: 40,
  },
  layout: {
    /** Phone frame screen on desktop browsers (iPhone 17 class). */
    frameWidth: 402,
    frameHeight: 874,
    /** Bottom tab bar. The library default (49) squeezes the label on web. */
    tabBarHeight: 60,
    /** Minimum size of anything tappable (DESIGN.md §9). */
    touchTarget: 44,
    /** Content column width on wide screens (`Screen`). */
    contentMaxWidth: 480,
  },
  /** Durations in ms and the one press feel for every tappable (DESIGN.md §5.1). */
  motion: {
    fast: 120,
    base: 240,
    slow: 420,
    pressScale: 0.97,
    pressOpacity: 0.85,
  },
  breakpoint: {
    /** Reserved for the post-hackathon sitter desktop layout. */
    expanded: 1024,
  },
} as const;
