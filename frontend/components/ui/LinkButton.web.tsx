import { useTheme } from "../../providers/ThemeProvider";

// The page font does not reach a plain <a> inside the app frame (it came out serif), so the system stack is named.
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type Props = {
  label: string;
  href: string;
  /** `text` looks like TextButton, for a link that sits next to other text links. */
  look?: "button" | "text";
  /** Open in its own small browser window instead of a tab (a calendar page that is closed after saving). */
  newWindow?: boolean;
  testID?: string;
};

const WINDOW = "popup=yes,width=560,height=720";

/**
 * A secondary button that opens an outside page in a new tab. On the web it is a real `<a>`: Safari
 * blocks `window.open` calls that go through the app's press handling, but never a plain link click.
 * Looks like Button `secondary` (DESIGN.md §6).
 */
export function LinkButton({ label, href, look = "button", newWindow, testID }: Props) {
  const theme = useTheme();
  // A plain link click stays the gesture (Safari), the window features only change how it opens; blocked: the link itself opens a tab.
  const onClick = newWindow
    ? (e: { preventDefault: () => void }) => {
        // Not "noopener" in the features: that makes window.open return null, so a blocked popup could not be told apart.
        const w = window.open(href, "_blank", WINDOW);
        if (w) {
          w.opener = null;
          e.preventDefault();
        }
      }
    : undefined;
  if (look === "text") {
    return (
      <a
        href={href}
        onClick={onClick}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={testID}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 44,
          padding: `0 ${theme.spacing.sm}px`,
          textDecoration: "none",
          cursor: "pointer",
          color: theme.color.primary,
          fontFamily: FONT,
          fontSize: theme.fontSize.body,
          fontWeight: 600,
        }}
      >
        {label}
      </a>
    );
  }
  return (
    <a
      href={href}
      onClick={onClick}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testID}
      style={{
        display: "block",
        boxSizing: "border-box",
        textAlign: "center",
        textDecoration: "none",
        cursor: "pointer",
        backgroundColor: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.md,
        color: theme.color.primary,
        fontFamily: FONT,
        fontSize: theme.fontSize.body,
        fontWeight: 600,
        padding: `${theme.spacing.sm + 4}px ${theme.spacing.md}px`,
      }}
    >
      {label}
    </a>
  );
}
