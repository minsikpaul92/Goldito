import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** True when the person asked the OS for less motion (DESIGN.md 5.1; audit F42): animations then jump to their end state. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduce(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
