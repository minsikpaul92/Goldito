import { getSupabase } from "../../lib/supabase";

/**
 * Diary decorating (Phase 12.3b, D61): each person's own sticker layer on a sent daily report (`report_decor`, 013b).
 * The owner and the report's sitter both read both layers and write only their own; the report text is never touched.
 */
export type DecorItem = {
  sticker_id: string;
  /** Kept with the item, so a sticker deleted from the box stays where it was put. */
  public_id: string;
  /** Centre of the sticker, as 0–1 of the paper's width and height. */
  x: number;
  y: number;
  scale: number;
  /** Degrees, clockwise. */
  rotate: number;
  z: number;
  /** "back" sits under the text (the writing shows over it), "front" (the default) over it (12.4). */
  layer?: "front" | "back";
};

export type DecorLayer = { userId: string; items: DecorItem[] };

export const MAX_ITEMS = 20;

export async function listDecor(reportId: string): Promise<DecorLayer[]> {
  const { data, error } = await getSupabase().from("report_decor").select("user_id, items").eq("report_id", reportId);
  if (error) throw new Error("Couldn't load the stickers on this page.");
  return ((data ?? []) as { user_id: string; items: DecorItem[] | null }[]).map((row) => ({
    userId: row.user_id,
    items: Array.isArray(row.items) ? row.items : [],
  }));
}

/** Replaces my layer on this report (one row per report and person). */
export async function saveDecor(reportId: string, me: string, items: DecorItem[]): Promise<void> {
  const { error } = await getSupabase()
    .from("report_decor")
    .upsert(
      { report_id: reportId, user_id: me, items: items.slice(0, MAX_ITEMS), updated_at: new Date().toISOString() },
      { onConflict: "report_id,user_id" },
    );
  if (error) throw new Error("Couldn't save your stickers. Try again.");
}

/** What the paper's sticker canvas draws (web: `StickerCanvas.web.tsx`; native draws nothing for now). */
export type StickerCanvasProps = {
  /** Which side of the text this canvas is: the paper draws a back canvas under the writing and a front one over it. */
  which: "front" | "back";
  /** Stacking order on the paper. */
  zIndex: number;
  /** Drawn in this order: the other person's layer first, mine last (on top). */
  layers: { items: DecorItem[]; mine: boolean }[];
  /** My stickers can be picked and dragged; a click on the back canvas (bare paper) clears the pick. */
  editing: boolean;
  /** Index into my layer's items. */
  selected: number | null;
  onSelect: (index: number | null) => void;
  onMove: (index: number, x: number, y: number) => void;
  urlFor: (publicId: string) => string;
};
