/* Creates the design-system foundations when the file doesn't have them yet
   (variables matching frontend/theme/tokens.ts, and the six text styles).
   Existing collections, variables and styles are reused, never duplicated. */
const TOKENS = {
  color: [
    ["background", "#F7F7F5", ["FRAME_FILL", "SHAPE_FILL"], "background", "Screen background. Looks may change it."],
    ["surface", "#FFFFFF", ["FRAME_FILL", "SHAPE_FILL"], "surface", "Cards, inputs, sheets."],
    ["text", "#1A1A1A", ["TEXT_FILL", "FRAME_FILL", "SHAPE_FILL"], "text", "Body text."],
    ["text-muted", "#5C5C5C", ["TEXT_FILL"], "textMuted", "Secondary text, disabled labels."],
    ["primary", "#2D6A4F", ["FRAME_FILL", "SHAPE_FILL", "STROKE_COLOR", "TEXT_FILL"], "primary", "Brand / primary action."],
    ["primary-text", "#FFFFFF", ["TEXT_FILL"], "primaryText", "Text on primary fill."],
    ["accent", "#D8F3DC", ["FRAME_FILL", "SHAPE_FILL"], "accent", "Soft tint: selected chip, badges."],
    ["border", "#E5E5E0", ["STROKE_COLOR", "FRAME_FILL", "SHAPE_FILL"], "border", "Hairlines, card borders, disabled fill."],
    ["error", "#B42318", ["TEXT_FILL", "STROKE_COLOR", "FRAME_FILL", "SHAPE_FILL"], "error", "Errors and DANGER. Fixed across looks."],
    ["success", "#067647", ["TEXT_FILL", "FRAME_FILL", "SHAPE_FILL"], "success", "Success. Fixed across looks."],
    ["warning", "#B54708", ["TEXT_FILL", "STROKE_COLOR", "FRAME_FILL", "SHAPE_FILL"], "warning", "Warnings. Fixed across looks."],
    ["border-strong", "#86867F", ["STROKE_COLOR", "FRAME_FILL", "SHAPE_FILL"], "borderStrong", "Outlines of things you interact with (inputs, checkboxes, chips, switch off). ≥ 3:1 on every surface (WCAG 1.4.11)."],
    ["track", "#E5E5E0", ["FRAME_FILL", "SHAPE_FILL"], "track", "Empty part of progress bars; the primary fill stays ≥ 3:1 against it."],
    ["error-surface", "#FEF3F2", ["FRAME_FILL", "SHAPE_FILL"], "errorSurface", "Light background behind error text (tags, banners). Never put error text on error."],
    ["warning-surface", "#FFFAEB", ["FRAME_FILL", "SHAPE_FILL"], "warningSurface", "Light background behind warning text (heads-up)."],
    ["success-surface", "#ECFDF3", ["FRAME_FILL", "SHAPE_FILL"], "successSurface", "Light background behind success text."],
    ["overlay", "#1A1A1A", ["FRAME_FILL", "SHAPE_FILL"], "overlay", "Backdrop behind sheets (40%)."],
  ],
  size: [
    ...Object.entries({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }).map(([k, v]) => [`spacing/${k}`, v, ["GAP"], `theme.spacing.${k}`]),
    ...Object.entries({ sm: 8, md: 12, lg: 16 }).map(([k, v]) => [`radius/${k}`, v, ["CORNER_RADIUS"], `theme.radius.${k}`]),
    ...Object.entries({ sm: 22, md: 28, hero: 40 }).map(([k, v]) => [`icon/${k}`, v, ["WIDTH_HEIGHT"], `theme.icon.${k}`]),
    ["size/touch-target", 44, ["WIDTH_HEIGHT"], "theme.layout.touchTarget"],
    ["layout/content-max-width", 480, ["WIDTH_HEIGHT"], "theme.layout.contentMaxWidth"],
    ["layout/frame-width", 402, ["WIDTH_HEIGHT"], "theme.layout.frameWidth"],
    ["layout/frame-height", 874, ["WIDTH_HEIGHT"], "theme.layout.frameHeight"],
    ["layout/tab-bar-height", 60, ["WIDTH_HEIGHT"], "theme.layout.tabBarHeight"],
    ...Object.entries({ title: 24, body: 16, small: 14, caption: 11 }).map(([k, v]) => [`font-size/${k}`, v, ["FONT_SIZE"], `theme.fontSize.${k}`]),
  ],
  motion: [
    ["duration/fast", 120, [], "theme.motion.fast"], ["duration/base", 240, [], "theme.motion.base"], ["duration/slow", 420, [], "theme.motion.slow"],
    ["press/scale", 0.97, [], "theme.motion.pressScale"], ["press/opacity", 0.85, [], "theme.motion.pressOpacity"],
  ],
};
const TEXT_STYLES = [
  ["Title", "Bold", 24, 30, "font-size/title"], ["Body", "Regular", 16, 22, "font-size/body"], ["Body Strong", "Semi Bold", 16, 22, "font-size/body"],
  ["Small", "Regular", 14, 20, "font-size/small"], ["Small Strong", "Semi Bold", 14, 20, "font-size/small"], ["Caption", "Medium", 11, 14, "font-size/caption"],
];

async function ensureFoundations(log) {
  const made = { variables: 0, styles: 0 };
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const existing = await figma.variables.getLocalVariablesAsync();
  const getCol = (name, modeName) => {
    let c = cols.find((x) => x.name === name);
    if (!c) { c = figma.variables.createVariableCollection(name); c.renameMode(c.modes[0].modeId, modeName); cols.push(c); }
    return c;
  };
  const ensure = (col, name, type, value, scopes, code, desc) => {
    let v = existing.find((x) => x.name === name && x.variableCollectionId === col.id);
    if (v) return v;
    v = figma.variables.createVariable(name, col, type);
    for (const m of col.modes) v.setValueForMode(m.modeId, value); // same value in every look until changed
    v.scopes = scopes;
    v.setVariableCodeSyntax("WEB", code);
    if (desc) v.description = desc;
    existing.push(v); made.variables++;
    return v;
  };
  const color = getCol("Color", "Default"), size = getCol("Size", "Value"), motion = getCol("Motion", "Value");
  for (const [k, hex, scopes, code, desc] of TOKENS.color) {
    const val = k === "overlay" ? { ...hexRGB(hex), a: 0.4 } : hexRGB(hex);
    ensure(color, `color/${k}`, "COLOR", val, scopes, `theme.color.${code}`, desc);
  }
  for (const [n, v, scopes, code] of TOKENS.size) ensure(size, n, "FLOAT", v, scopes, code);
  for (const [n, v, scopes, code] of TOKENS.motion) ensure(motion, n, "FLOAT", v, scopes, code);

  const styles = await figma.getLocalTextStylesAsync();
  for (const st of ["Regular", "Medium", "Semi Bold", "Bold"]) await figma.loadFontAsync({ family: "Inter", style: st });
  for (const [name, style, sizePx, lh, sizeVar] of TEXT_STYLES) {
    if (styles.find((s) => s.name === name)) continue;
    const t = figma.createTextStyle();
    t.name = name; t.fontName = { family: "Inter", style }; t.fontSize = sizePx; t.lineHeight = { unit: "PIXELS", value: lh };
    const v = existing.find((x) => x.name === sizeVar);
    if (v) { try { t.setBoundVariable("fontSize", v); } catch (e) { /* fine without the binding */ } }
    made.styles++;
  }
  return made;
}
