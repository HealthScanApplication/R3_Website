import { describe, expect, it } from 'vitest';
import { countryForPlace, flagEmoji, mapQueryFor } from '../placeCountry';

describe('flagEmoji', () => {
  it('turns a code into its flag', () => { expect(flagEmoji('AU')).toBe('🇦🇺'); expect(flagEmoji('za')).toBe('🇿🇦'); });
});

describe('countryForPlace', () => {
  it('finds the country from a title when the location is only a venue', () => {
    expect(countryForPlace('Cape Town, South Africa', 'Rots Church, 25 Lelie Street, Protea Hoogte')).toMatchObject({ code: 'ZA', name: 'South Africa', flag: '🇿🇦' });
    expect(countryForPlace('North Carolina, USA', 'VanHoy Family Campground')).toMatchObject({ code: 'US', flag: '🇺🇸' });
  });
  it('knows the cities events really happen in', () => {
    expect(countryForPlace('Dubai', 'Arjaan by Rotana, Dubai')).toMatchObject({ code: 'AE', name: 'United Arab Emirates' });
    expect(countryForPlace('Abu Dhabi', 'Beach Rotana, Abu Dhabi')?.code).toBe('AE');
    expect(countryForPlace('Misty Mountain Lifestyle Retreat, NSW')?.code).toBe('AU');
  });
  it('lets the last country named win, as an address ends with its country', () => {
    expect(countryForPlace('Paris, Texas, USA')?.code).toBe('US');
    expect(countryForPlace('Sydney, Australia')?.code).toBe('AU');
    expect(countryForPlace('London, England, UK')?.code).toBe('GB');
  });
  it('finds a multi-word name before a shorter one inside it', () => {
    expect(countryForPlace('Palm Hotel, New York')?.code).toBe('US');
    expect(countryForPlace('Abu Dhabi, United Arab Emirates')?.code).toBe('AE');
  });
  it('does not match inside another word', () => {
    expect(countryForPlace('Caravan Park, Actonville')).toBeNull(); // "act" is not "Acton"
    expect(countryForPlace('Indiana Jones Lecture Hall')).toBeNull(); // "india" is not "Indiana"
    expect(countryForPlace('The Peru Room')).toBeNull();
  });
  it('shows no flag rather than a wrong one', () => {
    expect(countryForPlace('Online')).toBeNull();
    expect(countryForPlace('', null, undefined)).toBeNull();
    expect(countryForPlace('Location to be announced')).toBeNull();
  });
});

describe('mapQueryFor', () => {
  it('joins the distinct lines, once each, so a venue gets its city and country from the title', () => {
    expect(mapQueryFor('Dubai', 'Arjaan by Rotana, Dubai', 'Arjaan by Rotana, Dubai')).toBe('Arjaan by Rotana, Dubai');
    expect(mapQueryFor('Cape Town, South Africa', 'Rots Church, 25 Lelie Street, Protea Hoogte')).toBe('Cape Town, South Africa, Rots Church, 25 Lelie Street, Protea Hoogte');
  });
  it('ignores blanks and caps the length', () => {
    expect(mapQueryFor('', null, '  ', 'Somewhere')).toBe('Somewhere');
    expect(mapQueryFor('x'.repeat(500)).length).toBe(200);
  });
});
