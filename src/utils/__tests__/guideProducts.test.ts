import { describe, expect, it, vi } from 'vitest';
import {
  buildCartPermalink, buildProductBuyUrl, effectiveCommissionPercent, formatProductPrice, groupProductsByShop, importShopifyProduct,
  normalizeDiscountCode, normalizeShopDomain, parsePriceToCents, parseShopifyProductUrl, type GuideProductLike,
} from '../guideProducts';

const product = (overrides: Partial<GuideProductLike> = {}): GuideProductLike => ({
  shop_domain: 'shop.example.com', product_handle: 'magnesium-glycinate', variant_id: '4001', title: 'Magnesium', price_cents: 2990, currency: 'EUR', discount_code: null, ...overrides,
});

describe('parseShopifyProductUrl', () => {
  it('reads plain, collection, locale and variant links', () => {
    expect(parseShopifyProductUrl('https://Shop.Example.com/products/Magnesium-Glycinate')).toEqual({ shopDomain: 'shop.example.com', handle: 'magnesium-glycinate', variantId: null });
    expect(parseShopifyProductUrl('https://shop.example.com/collections/sleep/products/mag?variant=123456')).toEqual({ shopDomain: 'shop.example.com', handle: 'mag', variantId: '123456' });
    expect(parseShopifyProductUrl('https://shop.example.com/en-gb/products/mag.js?variant=abc').variantId).toBeNull();
  });

  it('explains links it cannot use', () => {
    expect(() => parseShopifyProductUrl('shop.example.com/products/mag')).toThrow('https://');
    expect(() => parseShopifyProductUrl('https://shop.example.com/collections/sleep')).toThrow('product page link');
    expect(() => parseShopifyProductUrl('https://localhost/products/mag')).toThrow('shop address');
  });

  it('normalises shop domains', () => {
    expect(normalizeShopDomain('https://My-Store.myshopify.com/admin')).toBe('my-store.myshopify.com');
    expect(normalizeShopDomain('not a domain')).toBeNull();
  });
});

describe('buy links', () => {
  it('builds an attributed cart permalink with the discount code', () => {
    const url = new URL(buildProductBuyUrl(product({ discount_code: 'ROUTINE10' }), { medium: 'app', guardianSlug: 'barbara', protocolSlug: 'deep-sleep' }));
    expect(`${url.origin}${url.pathname}`).toBe('https://shop.example.com/cart/4001:1');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      discount: 'ROUTINE10', ref: 'routine3', 'attributes[routine3_medium]': 'app', 'attributes[routine3_guardian]': 'barbara', 'attributes[routine3_protocol]': 'deep-sleep',
      utm_source: 'routine3', utm_medium: 'app', utm_campaign: 'deep-sleep',
    });
  });

  it('falls back to the product page, through the discount link when there is a code', () => {
    expect(buildProductBuyUrl(product({ variant_id: null }), { medium: 'web', guardianSlug: 'barbara' }))
      .toBe('https://shop.example.com/products/magnesium-glycinate?ref=routine3&attributes%5Broutine3_medium%5D=web&attributes%5Broutine3_guardian%5D=barbara&utm_source=routine3&utm_medium=web&utm_campaign=barbara');
    const viaDiscount = new URL(buildProductBuyUrl(product({ variant_id: null, discount_code: 'SLEEP 15' }), { medium: 'web' }));
    expect(viaDiscount.pathname).toBe('/discount/SLEEP%2015');
    expect(viaDiscount.searchParams.get('redirect')).toBe('/products/magnesium-glycinate?ref=routine3&attributes%5Broutine3_medium%5D=web&utm_source=routine3&utm_medium=web');
  });

  it('puts several products from one store into one checkout and refuses mixed stores', () => {
    const url = buildCartPermalink([product(), product({ variant_id: '4002', discount_code: 'KIT' }), product({ variant_id: null })], { medium: 'web' }, { '4002': 2 });
    expect(url).toMatch(/^https:\/\/shop\.example\.com\/cart\/4001:1,4002:2\?discount=KIT&ref=routine3/);
    expect(buildCartPermalink([product({ variant_id: null })], { medium: 'web' })).toBeNull();
    expect(() => buildCartPermalink([product(), product({ shop_domain: 'other.example.com' })], { medium: 'web' })).toThrow('one store');
  });

  it('groups products by store in first-seen order', () => {
    const groups = groupProductsByShop([product(), product({ shop_domain: 'b.example.com' }), product({ variant_id: '9' })]);
    expect(groups.map((group) => [group.shopDomain, group.products.length])).toEqual([['shop.example.com', 2], ['b.example.com', 1]]);
  });
});

describe('importShopifyProduct', () => {
  it('reads the public product and store endpoints', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://shop.example.com/products/runner.js') return Response.json({
        id: 1, title: " Men's Runner ", handle: 'runner', description: '<p>Light &amp; breathable.</p><p>Washable</p>',
        featured_image: '//cdn.shopify.com/s/files/runner.png', variants: [{ id: 11, title: '8', price: 10000, available: false }, { id: 12, title: '9', price: 10500, available: true }],
      });
      if (url === 'https://shop.example.com/meta.json') return Response.json({ currency: 'USD', myshopify_domain: 'weare.myshopify.com' });
      return new Response('', { status: 404 });
    });
    const imported = await importShopifyProduct('https://shop.example.com/products/runner', fetchImpl as unknown as typeof fetch);
    expect(imported).toEqual({
      shopDomain: 'shop.example.com', handle: 'runner', variantId: '12', title: "Men's Runner", description: 'Light & breathable. Washable',
      imageUrl: 'https://cdn.shopify.com/s/files/runner.png', currency: 'USD', myshopifyDomain: 'weare.myshopify.com',
      variants: [{ id: '11', title: '8', priceCents: 10000, available: false }, { id: '12', title: '9', priceCents: 10500, available: true }],
    });
    const linked = await importShopifyProduct('https://shop.example.com/products/runner?variant=11', fetchImpl as unknown as typeof fetch);
    expect(linked.variantId).toBe('11');
  });

  it('asks for manual entry when the store does not serve the product', async () => {
    const missing = vi.fn(async () => new Response('<html>', { status: 404 }));
    await expect(importShopifyProduct('https://headless.example.com/products/x', missing as unknown as typeof fetch)).rejects.toThrow('fill in the details by hand');
    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(importShopifyProduct('https://down.example.com/products/x', offline as unknown as typeof fetch)).rejects.toThrow('Could not reach that store');
    const notShopify = vi.fn(async () => Response.json({ hello: 'world' }));
    await expect(importShopifyProduct('https://x.example.com/products/x', notShopify as unknown as typeof fetch)).rejects.toThrow('not a Shopify product');
  });
});

describe('small helpers', () => {
  it('validates discount codes and prices', () => {
    expect(normalizeDiscountCode('  SLEEP15 ')).toBe('SLEEP15');
    expect(normalizeDiscountCode('')).toBeNull();
    expect(() => normalizeDiscountCode('a,b,c')).toThrow('no commas');
    expect(parsePriceToCents('29,90')).toBe(2990);
    expect(parsePriceToCents('')).toBeNull();
    expect(() => parsePriceToCents('29.999')).toThrow('number');
  });

  it('formats prices and picks the agreed commission', () => {
    expect(formatProductPrice(2990, 'EUR', 'en-IE')).toBe('€29.90');
    expect(formatProductPrice(null, 'EUR')).toBe('');
    expect(effectiveCommissionPercent({ commission_percent: null }, 15)).toBe(15);
    expect(effectiveCommissionPercent({ commission_percent: 20 }, 15)).toBe(20);
  });
});
