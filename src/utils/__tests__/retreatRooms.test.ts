import { describe, expect, it } from 'vitest';
import { guestsLabel, lowestRoomPrice, parseRetreatOptions, roomPrice } from '../retreatRooms';

const lodge = { label: 'Lodge Room', note: 'Shared bathroom.', currency: 'AUD', prices: [{ guests: 2, cents: 585000 }, { guests: 1, cents: 365000 }, { guests: 3, cents: 785000 }] };

describe('parseRetreatOptions', () => {
  it('reads valid rooms in their saved order, with prices sorted by guests', () => {
    const rooms = parseRetreatOptions([lodge, { ...lodge, label: 'Family Unit', prices: [{ guests: 1, cents: 550000 }] }]);
    expect(rooms.map((room) => room.label)).toEqual(['Lodge Room', 'Family Unit']);
    expect(rooms[0].prices.map((price) => price.guests)).toEqual([1, 2, 3]);
  });
  it('drops anything malformed instead of showing it', () => {
    expect(parseRetreatOptions(null)).toEqual([]);
    expect(parseRetreatOptions('nope')).toEqual([]);
    expect(parseRetreatOptions([null, 3, { label: '', currency: 'AUD', prices: [{ guests: 1, cents: 1 }] }, { label: 'No price', currency: 'AUD', prices: [] }, { label: 'Bad currency', currency: 'aud', prices: [{ guests: 1, cents: 1 }] }])).toEqual([]);
    expect(parseRetreatOptions([{ ...lodge, prices: [{ guests: 0, cents: 1 }, { guests: 1, cents: 1.5 }, { guests: 2, cents: 2 }] }])[0].prices).toEqual([{ guests: 2, cents: 2 }]);
  });
});

describe('roomPrice and lowestRoomPrice', () => {
  const [room] = parseRetreatOptions([lodge]);
  it('prices the chosen guest count, and falls back to the smallest the room takes', () => {
    expect(roomPrice(room, 2).cents).toBe(585000);
    expect(roomPrice(room, 4).cents).toBe(365000);
  });
  it('finds the lowest price across rooms', () => {
    expect(lowestRoomPrice(parseRetreatOptions([lodge, { ...lodge, label: 'Deluxe', prices: [{ guests: 1, cents: 415000 }] }]))).toEqual({ cents: 365000, currency: 'AUD' });
    expect(lowestRoomPrice([])).toBeNull();
  });
  it('says guests in words', () => { expect(guestsLabel(1)).toBe('1 person'); expect(guestsLabel(3)).toBe('3 people'); });
});
