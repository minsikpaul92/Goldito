/**
 * Design tokens (8px grid), synced from the Figma Variables in Muk's Goldito-Design file
 * (`Default` mode). Each Figma variable's code syntax names its key here
 * (e.g. `color/text-muted` ↔ `color.textMuted`). Change values in Figma first, then here.
 */
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
    /** Outlines that must stay visible (unselected radio rings, inputs on tinted backgrounds). */
    borderStrong: "#86867F",
    /** Empty part of a progress bar or switch. */
    track: "#E5E5E0",
    error: "#B42318",
    success: "#067647",
    warning: "#B54708",
    /** Light backgrounds of status banners and tags; text on them uses the matching status color. */
    errorSurface: "#FEF3F2",
    warningSurface: "#FFFAEB",
    successSurface: "#ECFDF3",
    /** Dimmed backdrop behind modals and sheets. */
    overlay: "rgba(26, 26, 26, 0.4)",
    // Desktop phone frame only (DESIGN.md §2.1)
    frameBackdrop: "#E8E8E3",
    frameBezel: "#1A1A1A",
    frameShadow: "rgba(26, 26, 26, 0.18)",
    /** Letterbox behind photos and videos in viewers. */
    media: "#000000",
    /** Text and icons drawn on a photo, a video, or a solid status color. */
    onMedia: "#FFFFFF",
    // Brand (Muk's brand page): from the gold tag logo. Never skinned.
    /** Tag gold — the logo tag and celebration moments; never text on a light background. */
    gold: "#F4C35A",
    /** Gold that reads on light backgrounds (the logo heart, small gold accents). */
    goldOnLight: "#C9962E",
    /** Warm expressive ground for brand moments (welcome, celebration). */
    cream: "#FBF6EA",
    // Color blocks (Expressive): tinted card grounds. Text on them uses `text`.
    blockMint: "#D8F3DC",
    blockPeach: "#FDE2CC",
    blockButter: "#FBEFC8",
    blockBlush: "#FAD6CB",
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
    /** (Expressive) Color-block cards. */
    xl: 24,
    /** Fully rounded ends (pill buttons, segmented controls). */
    pill: 999,
  },
  fontSize: {
    title: 24,
    body: 16,
    small: 14,
    /** (proposed) Tiny labels inside dense grids, e.g. slot letters in SlotCalendar. */
    caption: 11,
  },
  /** Loaded font families. Unset = the platform font. A skin sets `display` for screen titles (Expressive: Fredoka). */
  fontFamily: {} as { display?: string },
  /** Figma text styles: Body = regular, Body/Small Strong = semibold, Title = bold, Caption = medium. */
  fontWeight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  /** Line height per Figma text style (Title 30, Body 22, Small 20, Caption 14). */
  lineHeight: {
    caption: 14,
    small: 20,
    body: 22,
    title: 30,
  },
  /** Press / disabled feedback on tappable elements. */
  opacity: {
    pressed: 0.7,
    disabled: 0.5,
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
    /** Minimum tap target, both sides. */
    touchTarget: 44,
    /** Widest a content column grows. */
    contentMaxWidth: 480,
  },
  /** Animation timing (ms) and press feedback. */
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
