import { useTheme } from "../../providers/ThemeProvider";

// The page font does not reach a plain <a> inside the app frame (it came out serif), so the system stack is named.
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type Props = {
  label: string;
  href: string;
  /** `text` looks like TextButton, for a link that sits next to other text links. */
  look?: "button" | "text";
  testID?: string;
};

/**
 * A secondary button that opens an outside page in a new tab. On the web it is a real `<a>`: Safari
 * blocks `window.open` calls that go through the app's press handling, but never a plain link click.
 * Looks like Button `secondary` (DESIGN.md §6).
 */
export function LinkButton({ label, href, look = "button", testID }: Props) {
  const theme = useTheme();
  if (look === "text") {
    return (
      <a
        href={href}
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
