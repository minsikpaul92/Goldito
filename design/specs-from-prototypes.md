# Design specs from the prototypes (for Minsik)

Mook · 2026-10-05.
Matches the live app's tabs (D47 / D47b): **Home · Bookings · Feed · Diary · Mood**.
Each section links the prototype screen to try (`python3 -m http.server 4001 --directory design/concept-prototypes`, then open the link) and the task it supports.

The prototypes are frozen as reference: their tab names (Stay, Care, Reports) are old. Use the behavior and layout, not the tab names.

---

## 1. Diary · 5-second check and daily note (7.3, 7.7 — current focus)

Prototype: `compare.html#check/all` · Figma: Suggestion Chip, Daily Note, Photo Tile

**Where:** Sitter → Diary → "Write today's note" (evening). Owner → Diary shows the sent note.

**Sitter screen, top to bottom**
1. **Photos (0/2)**: four tiles from today's Feed; tap to pick up to 2. A third tap shows a short message "Up to 2 photos" (no error state).
2. **Suggested from today**: chips the server builds from check-ins and tasks (7.7), plus photo chips from vision. All start **on**. One tap turns a chip **off** (struck through, faded); tap again to turn it back on. No editing inside chips.
3. **Short note (optional)**: one line, counter `0/200`.
4. **Generate daily note** (the one filled button). Disabled only if every chip is off *and* the note is empty.
5. While writing: "Writing Max's daily note in Lucy's voice…" with three dots.
6. **Review**: the draft in a soft bubble labelled "Draft · only from the chips and note", the chosen photos under it, then **Send to Chloe** (filled) and a text link **Change chips or note** (goes back with everything kept).
7. **Sent**: "✓ Daily note sent to Chloe · 6:04 PM"; the owner gets a notification "Lucy sent Max's daily note 📝".

**Rules**
- The note may only use facts from chips that are on, plus the sitter's note. A chip turned off must not appear (the prototype checks this).
- No required typing (DESIGN.md §7.2).

---

## 2. Trip · live map and arrival (6B.3, 6B.4)

Prototype: `compare.html#stage-4/all` · Figma: Trip Map, Photo Check, Entry Info Card

**Where:** Bookings → booking detail on pick-up day (and Home shows a "Trip in progress" card while it runs).

1. **Before**: one line saying who drives and when ("Lucy picks Max up at 7:30 AM"), then the driver's button **Start the drive**. The other side sees a waiting line, no button.
2. **Driving**: map card with "Sharing location until arrival" (green dot) and who is driving; the map itself (route, car, destination) with **+ / −** only, no dragging; under it the **ETA** in big numbers ("6 min · ETA · live").
3. **Arrived**: the map stays and the ETA reads **Arrived** ("Location sharing stopped"). Below it the arrival card: sitter drives → buzzer and lockbox (Entry Info Card, **Show code** hides again after 10 s); owner drives → visitor parking and buzz number.
4. **Handoff photo**: sitter's **Take the handoff photo** → "Checking the handoff photo…" → result card: photo plus "✓ Max is in the photo · ✓ Crate secured in the car · Checked by MiniCPM-V".
5. **Done**: "Pick-up complete — care has started · photo verified" and a toast on the owner side.

**Rules**: the map never captures mouse drags (§7.7); the code is never shown in a notification.

---

## 3. Home safe, review and Life Record (7C.3, 7C.5)

Prototype: `compare.html#stage-5/all` · Figma: Star, Life Record Card

1. **Home safe** card: return photo plus "Max is home safe 🏠 · Return photo verified · Mon 5:00 PM".
2. **How was Lucy?**: five large stars (44 px targets), then optional quick chips ("Thank you, Lucy!", "Max loved it", "Great photos"). **Send review** is disabled until a star is picked. After sending: "✓ Review sent to Lucy", read-only.
3. **Writing the Life Record…** (dots), then the **Life Record** card: Eats · Meds · Potty · Behavior · Heads-up · Sitter tips. Each line has its source in small text ("From Lucy · Oct 9–12", "From your profile · Treat Guard"). A tag "Only recorded facts".
4. "The next sitter's checklist and AI replies start from this." and **Plan the next stay**.

---

## 4. Question for Minsik: Feed categories

The README promises a **timeline album by category (Meals · Walks · Naps · Play)**. The live Feed is a photo grid with the pet toggle, without categories. Prototype with filter chips: `compare.html#care/all` → Feed tab.
Is this still planned (9.1 caption + category), or should the README change?

---

## Later (not now)

- **Sitter Home Tamagotchi** (11.12, P1): the pixel-room idea from Gemini fits D47b "sitter Home while caring". Concept B shows a working version. Build after P0.
- **Mood** (11.9) and **pet-photo theme** (11.10): P1; prototypes exist if needed.
