import { loadOwnerDefault, loadSitterWays, openingPlace } from "./handoffDefaults";
import { postBookingRequestCard } from "./chatApi";
import { getSitterProfile } from "../sitters/sitterApi";
import { BookingError, requestBooking } from "../../lib/bookings";

type StayInput = { dropOffAt: string; pickUpAt: string; pets: { id: string }[] };

/**
 * Starting a chat is the booking request: the booking is made from the chat's stay (dates and pets), at the sitter's
 * place unless the owner's usual is another, and its Meet & Greet card lands in the chat. Throws an Error whose message
 * the person can read.
 */
export async function createBookingFromStay(input: { threadId: string; ownerId: string; sitterId: string; sitterName: string; stay: StayInput }): Promise<string> {
  const { threadId, ownerId, sitterId, sitterName, stay } = input;
  const [sitter, mine, ways] = await Promise.all([getSitterProfile(sitterId), loadOwnerDefault(ownerId).catch(() => null), loadSitterWays(sitterId).catch(() => null)]);
  const houseSitting = !!sitter && !sitter.services.includes("boarding");
  const type = houseSitting ? ("owner_home" as const) : openingPlace(mine, ways);
  try {
    const bookingId = await requestBooking({
      sitterId,
      petIds: stay.pets.map((p) => p.id),
      dropOff: { at: stay.dropOffAt, locationType: type, note: null },
      pickUp: { at: stay.pickUpAt, locationType: type, note: null },
      note: null,
      serviceType: houseSitting ? "house_sitting" : "boarding",
    });
    await postBookingRequestCard(threadId, bookingId).catch(() => undefined);
    return bookingId;
  } catch (e) {
    const code = e instanceof BookingError ? e.code : "";
    if (code === "pet_already_booked") throw new Error("One of your pets already has a sitter (or a pending request) at that time.");
    if (code === "sitter_unavailable") throw new Error(`${sitterName} no longer has room for these dates.`);
    throw e;
  }
}
