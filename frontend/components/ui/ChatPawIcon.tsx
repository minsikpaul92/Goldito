import { forwardRef } from "react";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";

type Props = { size?: number; color?: string; strokeWidth?: number; fill?: string; testID?: string };

/**
 * The Chat tab: a square speech bubble with a paw, drawn in Lucide's style (24 grid, round joins) so it sits with the
 * house, calendar and photos icons (Muk's nav trial, #329). Same props as a Lucide icon.
 */
export const ChatPawIcon = forwardRef<Svg, Props>(function ChatPawIcon({ size = 24, color = "currentColor", strokeWidth = 2, testID }, ref) {
  return (
    <Svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden testID={testID}>
      <Path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Ellipse cx={12} cy={11.6} rx={2.4} ry={1.85} fill={color} />
      <Circle cx={9.4} cy={9} r={1.1} fill={color} />
      <Circle cx={12} cy={7.6} r={1.1} fill={color} />
      <Circle cx={14.6} cy={9} r={1.1} fill={color} />
    </Svg>
  );
});
