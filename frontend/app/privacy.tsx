import { LegalPage, LegalSection } from "../components/LegalPage";

// What Goldito stores and who else receives it — kept next to the code that does it (backend/app/routers/geo.py,
// meet_greet.py, ai/*). Update this page in the same change when a new service or kind of data is added.
const UPDATED = "October 24, 2026";

const SECTIONS: LegalSection[] = [
  {
    title: "What this is",
    body: [
      "Goldito is a pet-care app built for the Nebius x NVIDIA Global AI Hackathon. It is a prototype: please do not enter real payment details or anything you would not want a demo to hold. The demo accounts use fictional people, pets and addresses.",
    ],
  },
  {
    title: "What we store",
    body: [
      "Your account: email address, display name and whether you use Goldito as a pet owner or a sitter.",
      "Owners: pet profiles (name, species, breed, notes, allergies, care tasks), your home address, an emergency contact, your vet, bookings, and the entry information you choose to save for a sitter.",
      "Sitters: your profile (bio, service area, home notes, prices, house rules), your calendar, and your replies and diary pages.",
      "Both: bookings, messages in an inquiry, notifications, photos shared in Moments, diary pages, reviews, and the Life Record written after a stay.",
      "Profile photos (up to 8 each). A sitter's are shown to owners. An owner's are shown only to a sitter you share a booking or inquiry with.",
      "The data lives in a Supabase database (hosted in Canada). Row-level security keeps each person to their own records and to the bookings they are part of.",
    ],
  },
  {
    title: "Who can see it",
    body: [
      "A sitter sees an owner's pets and care notes for the booking. An owner's home address, emergency contact and vet are shown to a sitter only once their booking is paid, and only until a day after the pick-up. Entry codes open only after payment and close to the hand-off.",
      "Reviews are shared. An owner's review of a sitter shows on the sitter's profile. A sitter's review of an owner is seen by that owner and by other sitters. Reviewers are shown by first name.",
      "While a trip is running, the person travelling shares their position with the other person in that booking, and only then. On the web it works only while the screen stays on.",
    ],
  },
  {
    title: "AI",
    body: [
      "Goldito drafts replies, care checklists, captions, diary pages and Life Records with AI models (NVIDIA Nemotron and other open models) run on Nebius Token Factory. For each request the text and photos needed for that task are sent there: the question, the booking dates, the pet's care notes, the sitter's policy text, the day's check-ins and photos.",
      "Prices, availability and dates come from our own database, not from the model. Entry codes are never sent to a model.",
      "A sitter approves every reply and diary page before the owner sees it. AI drafts can be wrong and are not veterinary advice or a judgment of a pet's behaviour. The provider's own terms apply to what it receives.",
    ],
  },
  {
    title: "Other services that receive data",
    body: [
      "OpenStreetMap: when you save a home address, the address text is sent once to OpenStreetMap's Nominatim search to place the pin on the map. When you use your current location, for your home address or to search for sitters, that exact point is sent once to the same search to read the full address (house number included) and fill it in or show it in the search bar. You can change the address before you save it. Sitters never see your current location. The map pictures on the trip screen load from Esri tile servers in your browser, so they see your IP address and the map area you view.",
      "Cloudinary stores and delivers photos.",
      "Vercel hosts the website and Render hosts our server. Both see ordinary request logs such as IP addresses.",
    ],
  },
  {
    title: "Google Calendar and Meet",
    body: [
      "Goldito does not ask you to sign in with Google and never reads your Google account. One Google account owned by the Goldito team uses the Google Calendar API (only the calendar.events permission) to create, move and cancel the calendar event that carries the Google Meet link for a video Meet & Greet.",
      "That event holds the meeting time, a title with the pets' names and the sitter's name, and (when invites are switched on) the owner's and the sitter's email addresses as guests, so Google sends them the invite. Demo accounts never get invites. Goldito keeps only the event's ID and the Meet link, on the booking. A cancelled meeting's event is deleted.",
      "Goldito's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. That information is used only to run the video Meet & Greet; it is never sold, never used for advertising, and never sent to an AI model or used to train one.",
    ],
  },
  {
    title: "On your device",
    body: [
      "Your login session is kept in your browser's storage so you stay logged in. A few small settings (for example, what you ticked on a packing list) are kept in your browser too. We do not use advertising or tracking cookies.",
    ],
  },
  {
    title: "How long, and your choices",
    body: [
      "Because this is a hackathon project, we keep data only while the demo runs, which is through the judging period, and we may delete everything after it.",
      "To correct or delete your data, or to ask a question about this page, open an issue at github.com/minsikpaul92/Goldito.",
    ],
  },
];

/**
 * Public privacy page (10.11): reachable signed out — the Google OAuth consent screen (Branding) and the Welcome screen link here.
 * `/privacy?open=google-calendar-and-meet` opens that section, for the consent-screen reviewer.
 */
export default function Privacy() {
  return <LegalPage title="Privacy" updated={UPDATED} sections={SECTIONS} testID="privacy" />;
}
