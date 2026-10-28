## Inspiration

After dozens of stays as pet sitters, many with the same dogs and cats, we kept seeing the same loop. Owners text *"Did they eat?" "Did you walk them?" "Send a photo."* Sitters spend the day answering DMs instead of caring for the pet. Apps connect owners and sitters, but the stay itself (replies, house rules, medication times, daily notes) is still typed by hand, and a lot of it happens outside the app. Keeping owners in the loop takes us **at least 40 minutes a day**. Goldito cuts that to about **13 minutes** (our estimate), so sitters can focus on care.

We also noticed who gets left out. Owners who find typing hard, often seniors, leave their pet's profile half empty. So we asked: what if the AI did the typing and people only approved?

And we noticed something else. When a sitter's photo arrives, the owner doesn't just feel relieved. They smile. That small burst of love is the best part of having a pet, and it shouldn't only happen when you leave town. So we built a pet-care agent, and around it a place that is yours and your pet's every day.

Our benchmark was **Rover** (booking, fast replies) × **Kidsnote** (the Korean daily-report and album app) × **Uber** (live trips), rebuilt for dogs and cats.

## What it does

**Goldito** is an AI agent that runs the whole pet stay, from the first inquiry to the ride home, for owners and part-time sitters. It is also a home for your pet's everyday life: a photo **Feed**, a decorated **Diary**, and a **Snap** tab for play. Owners never have to ask. Sitters just **care, snap, and tap**. A person approves everything the AI sends to the other side.

### Care: the five-stage stay
1. **Inquiry:** Nemotron drafts the sitter's reply *in the sitter's own writing style*, using her calendar, a server-calculated quote, her house policy, and the pet's Life Record (RAG). Reply chips build the message in one thread with the owner. One tap to send, or auto-send at a human pace.
2. **Meet & Greet:** the owner's care note ("8 AM kibble · 2 PM pill in a treat · no knocking") becomes a timed **checklist** and Heads-up cards. First-time pairs meet in person or on video with a Google Meet link.
3. **Booking:** consents, demo payment, and timed unlock of entry info. Fixed rules only, never the model.
4. **Care & Pet Transit:** an Uber-style live trip with ETA. The sitter taps Feed, Walk, Poop, or Nap on the pet's **8-bit room** and the owner sees it live. Each evening the AI suggests chips from the day's check-ins and photos, the sitter turns off any that are wrong, and Nemotron writes the **daily note** in her voice.
5. **Completion:** a "home safe" report and reviews. The stay becomes the pet's **Life Record**, so the next sitter's reply and checklist already know the pet.

New owners start with a photo and a few spoken sentences: the AI suggests the breed, coat color, and profile facts, the owner confirms each one, and Goldito builds the pet as an **8-bit character**.

### Feed: your pet's cute little photo album
Every photo the sitter (or you) shares lands in a warm, Kidsnote-style timeline made just for your pet. AI captions every photo and sorts the album into Meals · Walks · Naps, so you never have to scroll through a chat to find the moment. Scroll it on a rough day and your heart fills back up. It is pet healing in your pocket. Owners with several pets can switch between them, and a private post stays private. Soon you can also show your pet off to everyone and meet other people's pets (see What's next).

### Diary: make an ordinary day a memory
The Diary is your pet's own picture diary. Every stay becomes a page: the daily note, the photos, the little things like a squirrel at the park. You can stick on stickers, write your own lines, and decorate each page. Owner and sitter each decorate on their own layer, so one ordinary Tuesday becomes something you will want to look back on. Stickers are made from your own pet: the pet is cut out in the browser into a transparent sticker with a white outline.

### Snap: safety and a bit of play (both roles)
- **Treat check:** snap a treat label. Nemotron 3.5 Super VL reads it, a rule table checks the pet's allergens and species toxins, **Tavily** pulls trusted vet and FDA pages, and Nemotron Ultra double-checks hidden sources (like chicken in "animal fat"). The result is SAFE, WARNING, or DANGER with sources. DANGER opens a red screen that only "I understand" closes, and notifies the owner.
- **Pet mood:** a photo or short clip gets a box around each pet and eight emotions in percent. For fun. The vision model only names visible body-language tags, and a fixed rule table turns them into the numbers, so the same photo always gives the same result.
- **Stickers:** cut your pet out of any photo and drop it into the Diary.

**Try it:** open the demo on a computer. It runs inside a phone frame (click = tap, drag or scroll = swipe). Tap **Try the demo**, then **Robert, the owner** or **Chloe, the sitter**, for a free Judge seat that starts from a clean stay. **Show both phones** puts the owner and the sitter side by side, with a panel that runs the five scenes. No sign-up, sample photos are built in, and payment is simulated.

## How we built it

| Layer | Stack |
| :--- | :--- |
| Frontend | Expo (React Native for Web), Vercel |
| Backend | FastAPI (Python 3.12), Render |
| Data / Auth / Realtime | Supabase (Postgres, RLS, pgvector) |
| Media | Cloudinary |
| Maps / Video | Leaflet + OpenStreetMap, Google Meet via the Google Calendar API |
| AI | **Nebius Token Factory**, called from the backend only · **Tavily** search · Groq Whisper for speech to text |

**Models on Token Factory**
- **NVIDIA Nemotron 3 Nano:** the sitter's "yes", spoken profile facts, the mood line
- **NVIDIA Nemotron 3 Super:** chat chips and drafts, checklists, daily notes, Life Records
- **NVIDIA Nemotron 3 Ultra:** treat-check reasoning
- **NVIDIA Nemotron 3.5 Super VL:** reads treat labels and photos: captions, album sorting, breed guess, mood tags
- **Qwen3 Embedding:** RAG retrieval

Two design rules shaped everything. First, **the model writes around facts, never invents them**: prices, dates, and availability come from the server, and entry codes never enter a prompt or the RAG index. Second, **a person approves** before anything AI-written reaches the other side.

## Challenges we ran into

- **Vision on the shared API:** NVIDIA's first vision models were dedicated-endpoint only, and keeping one running through judging would cost more than our credits. When Nemotron 3.5 Super VL reached the shared API we measured it on our own photos, moved to it, and switch its default thinking off per call.
- **Keeping the AI honest:** we moved all numbers and availability into server rules the AI only reads.
- **Judges use mice, not phones:** we built a phone-frame shell where every action works with a click or a drag.
- **Live location on the web:** browsers pause location in the background, so we added a clear prompt, a "start without sharing" option, and a simulated drive for demo accounts.
- **A free backend that sleeps:** a keep-alive ping every 10 minutes keeps the demo responsive for judging.

## Accomplishments that we're proud of

- The full five-stage stay works end to end in the live demo, on both the owner and sitter sides.
- A pet **Life Record** that follows the pet to any sitter and makes the next stay start smarter.
- A Feed, Diary, and Snap tab that make the app something you open for joy, not only for logistics.
- RLS-first data design: entry info unlocks only for the booked sitter, 2 hours before the visit, and trips share one live position with no route history stored.
- Fictional demo data only, and real messages used for tone are anonymized before any prompt.

## What we learned

- For care, **notifications and history beat chat**. Sitters will tap; they won't write essays.
- Trust comes from *what the AI is not allowed to do*: fixed rules for money, dates, and safety make the drafts safe to send.
- People come back for feelings, not features. A cute photo or a decorated diary page brings the owner back long after the stay ends.
- RLS and grants are the product. No UI polish matters if the wrong person can see a pet.

## What's next for Goldito

- **Pawstagram:** a public feed where you can show off your pet's cuteness to everyone and scroll through other people's adorable pets, plus a pet-friendly map of cafés, stores, and parks.
- **Keepsake cards:** save a decorated diary page as one image to share.
- **Real payments** (Stripe, refunds, taxes) in place of the demo payment.
- **Native iOS and Android apps** with push notifications and background location on trips.
- **The handoff photo check in the app:** the vision check (pet visible, crate or seatbelt) already runs on the server.
- **Auto-send for sitters who opt in,** at a human pace, with a clear responsibility prompt.

## Not just for when you're away

Goldito isn't an app you open only when you leave your pet with someone. It is the app you live with your pet in: peek at the feed when you miss them, decorate a diary page after a good walk, snap a treat label before the shop, check their mood for fun. When it's time to go away, a sitter already knows them, because Goldito has been there all along.
