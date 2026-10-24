import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { FeedTimelinePost, canDeleteForBoth } from "../lib/feed";
import type { DeleteScope } from "../lib/feed";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  post: FeedTimelinePost | null;
  currentUserId: string | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: (scope: DeleteScope) => void;
};

/**
 * Delete a photo. Within 30 minutes of sending a shared photo its author picks both of you or only me; after that, and
 * for a photo the other person sent, it goes from my Feed only and the sheet says so. A photo only I can see is gone for good.
 */
export function FeedDeleteSheet({ post, currentUserId, deleting, onClose, onConfirm }: Props) {
  const styles = useThemedStyles(makeStyles);
  const both = post != null && canDeleteForBoth(post, currentUserId);
  const mine = post != null && post.visibility === "private";

  return (
    <Sheet
      visible={post != null}
      title="Delete this photo?"
      onClose={() => {
        if (!deleting) onClose();
      }}
      testID="feed-delete-sheet"
      footer={
        <View style={styles.footer}>
          {both ? (
            <>
              <Button
                label="Delete for both"
                variant="danger"
                disabled={deleting}
                onPress={() => onConfirm("everyone")}
                testID="feed-delete-both"
              />
              <Button
                label="Delete for me only"
                variant="secondary"
                disabled={deleting}
                onPress={() => onConfirm("me")}
                testID="feed-delete-me"
              />
            </>
          ) : (
            <Button
              label="Delete"
              variant="danger"
              disabled={deleting}
              onPress={() => onConfirm("me")}
              testID="feed-delete-confirm"
            />
          )}
        </View>
      }
    >
      <Text style={styles.body} testID="feed-delete-body">
        {both
          ? "Delete it for both of you, or only for you?"
          : mine
            ? "This deletes the photo for good."
            : "It will be deleted on your side only."}
      </Text>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    footer: { gap: theme.spacing.sm },
    body: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
      lineHeight: theme.fontSize.body * 1.4,
    },
  });
