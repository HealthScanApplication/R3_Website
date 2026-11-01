/*
 * Prices on a Guardian's public page follow the visitor's picker (region, language, currency): an amount in another
 * currency is converted at the day's rate and shown in the chosen one, in the chosen language's number format, with "≈"
 * to say it is converted (what you are charged stays in the currency it is sold in). Without rates, or when the
 * currencies match, the price is shown as it is.
 */
import { createContext, useContext, useEffect, useState } from 'react';

export interface LocalePick { currency: string; locale: string }
/** Provided by the public page with the visitor's pick; anything outside it shows prices as they are. */
export const PublicLocaleContext = createContext<LocalePick | null>(null);

/** An amount in cents as money in a currency and language: no decimals for whole amounts. */
export function formatMoneyCents(cents: number, currency: string, locale?: string): string {
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}

/** Cents in one currency as cents in another, using rates all quoted against one base; null when either rate is missing. */
export function convertCents(cents: number, from: string, to: string, rates: Record<string, number> | null): number | null {
  if (from === to) return cents;
  const source = rates?.[from], target = rates?.[to];
  if (!source || !target) return null;
  return Math.round((cents * target) / source);
}

/** The text to show for a price under the visitor's pick. */
export function displayMoney(cents: number, currency: string, pick: LocalePick | null, rates: Record<string, number> | null): string {
  if (!pick || !pick.currency || pick.currency === currency) return formatMoneyCents(cents, currency, pick?.locale);
  const converted = convertCents(cents, currency, pick.currency, rates);
  return converted == null ? formatMoneyCents(cents, currency, pick.locale) : `≈ ${formatMoneyCents(converted, pick.currency, pick.locale)}`;
}

let ratesPromise: Promise<Record<string, number> | null> | null = null;
/** Today's rates against the euro, fetched once per page. A failure leaves prices as they are. */
export function loadRates(): Promise<Record<string, number> | null> {
  if (!ratesPromise) {
    ratesPromise = fetch('https://api.frankfurter.dev/v1/latest?base=EUR')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => (data?.rates ? { EUR: 1, ...data.rates } as Record<string, number> : null))
      .catch(() => null);
    ratesPromise.then((rates) => { if (!rates) ratesPromise = null; });
  }
  return ratesPromise;
}
/** For tests: forget the fetched rates. */
export const resetRates = () => { ratesPromise = null; };

/** A function that shows an amount under the visitor's pick, re-rendering when the rates arrive. */
export function useDisplayMoney(): (cents: number, currency: string) => string {
  const pick = useContext(PublicLocaleContext);
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const needsRates = !!pick?.currency;
  useEffect(() => { if (!needsRates) return; let live = true; loadRates().then((next) => { if (live) setRates(next); }); return () => { live = false; }; }, [needsRates]);
  return (cents, currency) => displayMoney(cents, currency, pick, rates);
}
