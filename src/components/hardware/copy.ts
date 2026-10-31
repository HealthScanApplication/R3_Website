export const PRODUCTS = {
  ring:   { key: 'ring'   as const, name: 'R³ Ring',        priceCents: 17900, regPriceCents: 19900 },
  bundle: { key: 'bundle' as const, name: 'R³ Ring + Clip', priceCents: 29900, regPriceCents: 34900 },
};
export type ProductKey = keyof typeof PRODUCTS;
export const BATCH_GOAL = 250;
export const SHIP_WINDOW = 'Ships Q3 2027';
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}
