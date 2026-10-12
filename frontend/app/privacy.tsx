import { StyleSheet, Text, View } from "react-native";

import { Screen } from "../components/ui/Screen";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Section = { title: string; body: string[] };

// What Goldito stores and who else receives it — kept next to the code that does it (backend/app/routers/geo.py,
// meet_greet.py, ai/*). Update this page in the same change when a new service or kind of data is added.
const UPDATED = "October 12, 2026";

const SECTIONS: Section[] = [
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
      "Sitters: your profile (bio, service area, home notes, prices, house rules), your calendar, and your replies and daily reports.",
      "Both: bookings, messages in an inquiry, notifications, photos shared in the feed, daily reports, reviews, and the Life Record written after a stay.",
      "The data lives in a Supabase database (hosted in Canada). Row-level security keeps each person to their own records and to the bookings they are part of.",
    ],
  },
  {
    title: "Who can see it",
    body: [
      "A sitter sees an owner's pets and care notes for the booking. An owner's home address is shown only to a sitter with a confirmed booking, and entry codes only after the booking is paid and the hand-off is close.",
      "While a trip is running, the person travelling shares their position with the other person in that booking, and only then. On the web it works only while the screen stays on.",
    ],
  },
  {
    title: "AI",
    body: [
      "Goldito drafts replies, care checklists, captions, daily reports and Life Records with AI models (NVIDIA Nemotron and other open models) run on Nebius Token Factory. For each request the text and photos needed for that task are sent there: the question, the booking dates, the pet's care notes, the sitter's policy text, the day's check-ins and photos.",
      "Prices, availability and dates come from our own database, not from the model. Entry codes are never sent to a model.",
      "A sitter approves every reply and report before the owner sees it, unless the sitter turned on auto-send. AI drafts can be wrong and are not veterinary advice or a judgment of a pet's behaviour. The provider's own terms apply to what it receives.",
    ],
  },
  {
    title: "Other services that receive data",
    body: [
      "OpenStreetMap: when you save a home address, the address text is sent once to OpenStreetMap's Nominatim search to place the pin on the map. The map pictures on the trip screen load from OpenStreetMap tile servers in your browser, so they see your IP address and the map area you view.",
      "Cloudinary stores and delivers photos.",
      "Google Calendar creates the video link for a first Meet & Greet, from a Goldito account. When invites are switched on, the owner's and the sitter's email addresses go on the invite. Demo accounts never get invites.",
      "Vercel hosts the website and Render hosts our server. Both see ordinary request logs such as IP addresses.",
    ],
  },
  {
    title: "On your device",
    body: [
      "Your sign-in session is kept in your browser's storage so you stay signed in. A few small settings (for example, what you ticked on a packing list) are kept in your browser too. We do not use advertising or tracking cookies.",
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

/** Public privacy page (10.11): reachable signed out — the Google sign-in consent screen and the Welcome screen link here. */
export default function Privacy() {
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen contentStyle={styles.content} testID="privacy">
      <Text accessibilityRole="header" style={styles.title}>
        Privacy
      </Text>
      <Text style={styles.updated}>Last updated {UPDATED}</Text>
      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section} testID={`privacy-${section.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
          <Text accessibilityRole="header" style={styles.heading}>
            {section.title}
          </Text>
          {section.body.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
    title: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    updated: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    section: { gap: theme.spacing.sm },
    heading: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    paragraph: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
  });
