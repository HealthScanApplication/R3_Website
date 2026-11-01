/*
 * Room choices on a retreat programme: each room has a price for the number of guests it takes. Read from the saved
 * `options` (anything malformed is dropped rather than shown), and priced for the chosen room and guest count.
 */
export interface RoomPrice { guests: number; cents: number }
export interface RetreatRoomOption { label: string; note: string | null; currency: string; prices: RoomPrice[] }

/** The valid rooms in saved data, in their saved order. A room with no usable price is left out. */
export function parseRetreatOptions(raw: unknown): RetreatRoomOption[] {
  if (!Array.isArray(raw)) return [];
  const rooms: RetreatRoomOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const room = item as Record<string, unknown>;
    const label = typeof room.label === 'string' ? room.label.trim() : '';
    const prices = (Array.isArray(room.prices) ? room.prices : [])
      .map((price) => price as Record<string, unknown>)
      .filter((price) => Number.isInteger(price?.guests) && (price.guests as number) > 0 && Number.isInteger(price?.cents) && (price.cents as number) >= 0)
      .map((price) => ({ guests: price.guests as number, cents: price.cents as number }))
      .sort((a, b) => a.guests - b.guests);
    const currency = typeof room.currency === 'string' && /^[A-Z]{3}$/.test(room.currency) ? room.currency : '';
    if (label && currency && prices.length) rooms.push({ label, note: typeof room.note === 'string' && room.note.trim() ? room.note.trim() : null, currency, prices });
  }
  return rooms;
}

/** The price for a room and guest count. A count the room does not take falls back to its smallest. */
export function roomPrice(room: RetreatRoomOption, guests: number): RoomPrice {
  return room.prices.find((price) => price.guests === guests) || room.prices[0];
}

export const guestsLabel = (guests: number) => (guests === 1 ? '1 person' : `${guests} people`);

/** The lowest price across all rooms, for "From". */
export function lowestRoomPrice(rooms: RetreatRoomOption[]): { cents: number; currency: string } | null {
  let best: { cents: number; currency: string } | null = null;
  for (const room of rooms) for (const price of room.prices) if (!best || price.cents < best.cents) best = { cents: price.cents, currency: room.currency };
  return best;
}
