import { ReactNode, useRef } from "react";
import { Platform, ScrollView, StyleProp, StyleSheet, ViewStyle } from "react-native";

type Props = {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A row that scrolls sideways (DESIGN.md §6 · §7.7): finger drag on a phone, the plain mouse wheel on the desktop
 * frame. Items keep their natural width, so the next one peeks in at the edge and the row reads as scrollable.
 */
export function HorizontalList({ children, contentStyle, testID }: Props) {
  const ref = useRef<ScrollView>(null);
  const scrollX = useRef(0);

  // Web: a wheel turn over the row moves it sideways (a trackpad's own sideways swipe already does).
  const webProps =
    Platform.OS === "web"
      ? {
          onWheel: (e: { deltaX: number; deltaY: number }) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) ref.current?.scrollTo({ x: scrollX.current + e.deltaY, animated: false });
          },
        }
      : {};

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      onScroll={(e) => {
        scrollX.current = e.nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={16}
      contentContainerStyle={[styles.content, contentStyle]}
      testID={testID}
      {...webProps}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Room above the row and a peek on the right so a corner badge isn't clipped and the next item shows.
  content: {
    alignItems: "center",
    paddingTop: 8,
    paddingRight: 24,
  },
});
