// Guardian products sold on the Guardian's own Shopify checkout (Phase 1 of
// docs/guardian-shopify-commerce.md). Pure and dependency-free so the mobile
// app can share this file unchanged: URL parsing, the Shopify product import
// and the attributed cart-permalink links.

export interface GuideProductLike {
  shop_domain: string;
  product_handle: string;
  variant_id: string | null;
  title: string;
  price_cents: number | null;
  currency: string;
  discount_code: string | null;
}

export interface ShopifyProductRef {
  shopDomain: string;
  handle: string;
  variantId: string | null;
}

export interface ImportedShopifyVariant {
  id: string;
  title: string;
  priceCents: number;
  available: boolean;
}

export interface ImportedShopifyProduct extends ShopifyProductRef {
  title: string;
  description: string;
  imageUrl: string | null;
  currency: string | null;
  myshopifyDomain: string | null;
  variants: ImportedShopifyVariant[];
}

export interface BuyLinkContext {
  /** Guardian slug, recorded on the order as a cart attribute. */
  guardianSlug?: string | null;
  /** Protocol the buyer came from, when there is one. */
  protocolSlug?: string | null;
  /** Where the tap happened: the Guardian website or the mobile app. */
  medium: 'web' | 'app';
}

/** The parts of Shopify's public /products/<handle>.js and /meta.json we read. Every field is unchecked input. */
interface ShopifyProductJson {
  title?: unknown;
  handle?: unknown;
  description?: unknown;
  featured_image?: unknown;
  images?: unknown[];
  variants?: unknown;
}
interface ShopifyVariantJson {
  id?: unknown;
  title?: unknown;
  price?: unknown;
  available?: unknown;
}
interface ShopifyMetaJson {
  currency?: unknown;
  myshopify_domain?: unknown;
}

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const HANDLE = /^[a-z0-9][a-z0-9_-]*$/;

export function normalizeShopDomain(value: string): string | null {
  const host = value.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  return DOMAIN.test(host) ? host : null;
}

/** Reads a Shopify product link: /products/handle, with optional locale or collection prefix and ?variant=. */
export function parseShopifyProductUrl(value: string): ShopifyProductRef {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Paste the full product link, including https://.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Paste the full product link, including https://.');
  const shopDomain = normalizeShopDomain(url.hostname);
  if (!shopDomain) throw new Error('That link has no shop address.');
  const segments = url.pathname.split('/').filter(Boolean);
  const index = segments.lastIndexOf('products');
  const handle = index >= 0 ? decodeURIComponent(segments[index + 1] || '').toLowerCase().replace(/\.(js|json)$/, '') : '';
  if (!handle || !HANDLE.test(handle)) throw new Error('Use a Shopify product page link, e.g. https://yourstore.com/products/your-product.');
  const variant = url.searchParams.get('variant');
  return { shopDomain, handle, variantId: variant && /^\d{1,20}$/.test(variant) ? variant : null };
}

function shopifyImage(src: unknown): string | null {
  if (typeof src !== 'string' || !src) return null;
  const absolute = src.startsWith('//') ? `https:${src}` : src;
  return /^https:\/\//.test(absolute) ? absolute : null;
}

function plainText(html: unknown, max = 600): string {
  if (typeof html !== 'string') return '';
  const text = html.replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Fetches a product from a standard Shopify online store. Both endpoints are
 * public and CORS-open; headless storefronts may not serve them, in which case
 * the Guardian fills the form by hand.
 */
export async function importShopifyProduct(productUrl: string, fetchImpl: typeof fetch = fetch): Promise<ImportedShopifyProduct> {
  const ref = parseShopifyProductUrl(productUrl);
  const base = `https://${ref.shopDomain}`;
  let response: Response;
  try { response = await fetchImpl(`${base}/products/${encodeURIComponent(ref.handle)}.js`, { headers: { Accept: 'application/json' } }); }
  catch { throw new Error('Could not reach that store. Check the link, or fill in the details by hand.'); }
  if (!response.ok) throw new Error(response.status === 404 ? 'That store did not return this product. It may be unpublished or on a custom storefront, so fill in the details by hand.' : `The store answered ${response.status}. Fill in the details by hand.`);
  const product = (await response.json().catch(() => null)) as ShopifyProductJson | null;
  if (!product || typeof product.title !== 'string' || !Array.isArray(product.variants)) throw new Error('That page is not a Shopify product. Fill in the details by hand.');
  const title = product.title;
  const meta = (await fetchImpl(`${base}/meta.json`).then((res) => (res.ok ? res.json() : null)).catch(() => null)) as ShopifyMetaJson | null;
  const variants: ImportedShopifyVariant[] = (product.variants as (ShopifyVariantJson | null)[])
    .filter((variant): variant is ShopifyVariantJson => !!variant && /^\d{1,20}$/.test(String(variant.id)))
    .map((variant) => ({ id: String(variant.id), title: String(variant.title || 'Default'), priceCents: typeof variant.price === 'number' && Number.isFinite(variant.price) ? Math.round(variant.price) : 0, available: variant.available !== false }));
  const chosen = ref.variantId && variants.some((variant) => variant.id === ref.variantId) ? ref.variantId : (variants.find((variant) => variant.available) || variants[0])?.id || null;
  const myshopify = typeof meta?.myshopify_domain === 'string' ? normalizeShopDomain(meta.myshopify_domain) : null;
  return {
    shopDomain: ref.shopDomain,
    handle: typeof product.handle === 'string' && HANDLE.test(product.handle) ? product.handle : ref.handle,
    variantId: chosen,
    title: title.trim().slice(0, 180),
    description: plainText(product.description),
    imageUrl: shopifyImage(product.featured_image) || shopifyImage(product.images?.[0]),
    currency: typeof meta?.currency === 'string' && /^[A-Z]{3}$/.test(meta.currency) ? meta.currency : null,
    myshopifyDomain: myshopify && myshopify.endsWith('.myshopify.com') ? myshopify : null,
    variants,
  };
}

export function normalizeDiscountCode(value: string | null | undefined): string | null {
  const code = value?.trim() || '';
  if (!code) return null;
  if (code.length < 3 || code.length > 40 || code.includes(',')) throw new Error('Discount codes are 3–40 characters with no commas.');
  return code;
}

function attributionParams(context: BuyLinkContext, discountCode: string | null): URLSearchParams {
  const params = new URLSearchParams();
  if (discountCode) params.set('discount', discountCode);
  params.set('ref', 'routine3');
  params.set('attributes[routine3_medium]', context.medium);
  if (context.guardianSlug) params.set('attributes[routine3_guardian]', context.guardianSlug);
  if (context.protocolSlug) params.set('attributes[routine3_protocol]', context.protocolSlug);
  params.set('utm_source', 'routine3');
  params.set('utm_medium', context.medium);
  if (context.protocolSlug || context.guardianSlug) params.set('utm_campaign', (context.protocolSlug || context.guardianSlug)!);
  return params;
}

/**
 * One checkout for several products from the same store: /cart/variant:qty,…
 * Products without a variant id cannot join a cart permalink and are skipped.
 */
export function buildCartPermalink(products: GuideProductLike[], context: BuyLinkContext, quantities: Record<string, number> = {}): string | null {
  const lines = products.filter((product) => product.variant_id);
  if (!lines.length) return null;
  const shop = lines[0].shop_domain;
  if (lines.some((product) => product.shop_domain !== shop)) throw new Error('A cart link can only hold products from one store.');
  const path = lines.map((product) => `${product.variant_id}:${Math.max(1, Math.floor(quantities[product.variant_id!] || 1))}`).join(',');
  const discount = lines.find((product) => product.discount_code)?.discount_code || null;
  return `https://${shop}/cart/${path}?${attributionParams(context, discount).toString()}`;
}

/** Buy link for one product: a cart permalink when the variant is known, else the product page (via the discount link when there is a code). */
export function buildProductBuyUrl(product: GuideProductLike, context: BuyLinkContext): string {
  const cart = buildCartPermalink([product], context);
  if (cart) return cart;
  const params = attributionParams(context, null);
  params.delete('discount');
  const page = `/products/${encodeURIComponent(product.product_handle)}?${params.toString()}`;
  return product.discount_code
    ? `https://${product.shop_domain}/discount/${encodeURIComponent(product.discount_code)}?redirect=${encodeURIComponent(page)}`
    : `https://${product.shop_domain}${page}`;
}

/** Europe is served by Tre Lune UK; Australia and New Zealand use the AU storefront. */
export function regionalProduct<T extends GuideProductLike & { regional_storefronts?: Record<string, Partial<GuideProductLike>> | null }>(product: T, locale = typeof navigator === 'undefined' ? '' : navigator.language, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): T {
  const token = `${locale} ${timeZone}`.toLowerCase();
  const region = /(^|[-_\s])(au|nz)([-_\s]|$)|australia|new zealand|pacific\/(auckland|chatham)/.test(token) ? 'AU' : /(^|[-_\s])(gb|uk|ie)([-_\s]|$)|united kingdom|eurozone|europe\//.test(token) ? 'UK' : 'AU';
  const override = product.regional_storefronts?.[region] || (region === 'UK' ? product.regional_storefronts?.EU : null);
  return override ? { ...product, ...override } : product;
}

/** Products grouped by store, in first-seen order, for "Buy all from …" checkouts. */
export function groupProductsByShop<T extends GuideProductLike>(products: T[]): { shopDomain: string; products: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const product of products) groups.set(product.shop_domain, [...(groups.get(product.shop_domain) || []), product]);
  return [...groups].map(([shopDomain, items]) => ({ shopDomain, products: items }));
}

export function formatProductPrice(priceCents: number | null, currency: string, locale?: string): string {
  if (priceCents == null) return '';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(priceCents / 100); }
  catch { return `${(priceCents / 100).toFixed(2)} ${currency}`; }
}

/** Commission ROUTINE³ invoices for a product: its own agreed rate, else the Guardian's. */
export function effectiveCommissionPercent(product: { commission_percent?: number | null }, guardianCommissionPercent: number): number {
  return product.commission_percent ?? guardianCommissionPercent;
}

/** Parses a typed price ("29", "29.90", "29,90") into cents. */
export function parsePriceToCents(value: string): number | null {
  const text = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Enter the price as a number, e.g. 29.90.');
  return Math.round(Number(text) * 100);
}

/** Short, URL-safe label for a Protocol name in cart attributes and UTM campaign. */
export function attributionSlug(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
