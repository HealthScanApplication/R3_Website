// Guardian products: the workspace "My products" manager and the public "Shop" block.
// Buyers check out on the Guardian's own Shopify store; ROUTINE³ attribution and the
// Guardian's discount code travel in the cart permalink (docs/guardian-shopify-commerce.md).
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Grid2X2, List, Loader2, Pencil, Plus, ShoppingBag, Smartphone, Trash2, X } from 'lucide-react';
import { CoverImageActions } from './CoverImageActions';
import { deleteGuideProduct, listGuideProducts, listPublicGuideProducts, saveGuideProduct, type GuideProduct } from '../../utils/guidePortal';
import {
  attributionSlug, buildCartPermalink, buildProductBuyUrl, effectiveCommissionPercent, formatProductPrice, importShopifyProduct, normalizeDiscountCode, parsePriceToCents, parseShopifyProductUrl, regionalProduct, regionalProductOrNull,
  type ImportedShopifyVariant,
} from '../../utils/guideProducts';
import { listProtocolItems, type AdminProtocol } from '../../utils/protocolAdmin';
import { generateProtocolPdf } from '../../utils/protocolPdf';

export interface GuardianLocalePreference {
  region: string;
  locale: string;
  currency: string;
}

const DEFAULT_PRODUCT_CATEGORIES = ['All', 'Books', 'Bundles', 'Creams & skincare', 'Herbal treatments', 'Minerals', 'Other'];

const PRODUCT_IMAGE_FALLBACKS: Record<string, string> = {
  trelune_wild_yam_cream_teen: 'https://cdn.shopify.com/s/files/1/0912/6196/0527/files/TreLuneWildYamTeen-FrontInternational_shopify.webp?v=1776704396',
  trelune_wild_yam_cream_male: 'https://cdn.shopify.com/s/files/1/0912/6196/0527/files/TreLuneWildYamMale-FrontInternational_shopify_9b83c6b5-fc66-4f8f-bc56-5976bb665e05.webp?v=1776704766',
};

function PublicProductImage({ product, regional }: { product: GuideProduct; regional: GuideProduct }) {
  const fallback = product.catalog_product_id ? PRODUCT_IMAGE_FALLBACKS[product.catalog_product_id] : undefined;
  const initial = regional.image_url || product.image_url || fallback || '';
  const [src, setSrc] = useState(initial);
  useEffect(() => setSrc(initial), [initial]);
  if (!src) return <div style={{ width: '100%', aspectRatio: '1', display: 'grid', placeItems: 'center', background: '#EEEAE2', color: APP.muted }}><ShoppingBag size={40} strokeWidth={1.2} /></div>;
  return <div style={{ position: 'relative', width: '100%', aspectRatio: '1', overflow: 'hidden', background: '#EEEAE2' }}><img src={src} alt={product.title} loading="lazy" onError={() => { if (fallback && src !== fallback) setSrc(fallback); else setSrc(''); }} style={{ position: 'absolute', inset: -12, width: 'calc(100% + 24px)', height: 'calc(100% + 24px)', maxWidth: 'none', objectFit: 'cover', objectPosition: 'center', filter: 'grayscale(.18) contrast(1.02)', transform: 'translate3d(var(--product-px, 0px), var(--product-py, 0px), 0) scale(1.025)', transition: 'transform 500ms cubic-bezier(.16,1,.3,1), filter 500ms ease', willChange: 'transform' }} /></div>;
}

function productCategory(product: GuideProduct): string {
  const text = `${product.title} ${product.description || ''}`.toLowerCase();
  if (/\b(book|guide|handbook|self heal|sustain me)\b/.test(text)) return 'Books';
  if (/\b(bundle|package|collection|kit)\b/.test(text)) return 'Bundles';
  if (/\b(cream|soap|salve|oil|skin|beauty|yam)\b/.test(text)) return 'Creams & skincare';
  if (/\b(tea|tincture|herb|reishi|mushroom|comfrey|castor)\b/.test(text)) return 'Herbal treatments';
  if (/\b(mineral|salt|magnesium|baja)\b/.test(text)) return 'Minerals';
  return 'Other';
}

const ink = '#F5F2EA';
const muted = '#B8B6AF';
const line = 'rgba(245,242,234,0.24)';
const black = '#090A08';
const panel = '#11120F';
const acid = '#C7D8A3';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const input: React.CSSProperties = { width: '100%', height: 44, boxSizing: 'border-box', border: `1px solid ${line}`, background: '#0D0E0C', color: ink, borderRadius: 2, padding: '0 12px', fontFamily: sans, fontSize: 13, outline: 'none' };
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7, marginTop: 12, lineHeight: 1.35 };
const btn: React.CSSProperties = { minHeight: 44, border: `1px solid ${line}`, background: ink, color: black, padding: '0 18px', borderRadius: 4, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, lineHeight: 1.2 };
const iconBtn: React.CSSProperties = { ...btn, width: 38, minHeight: 38, padding: 0, background: 'transparent', color: ink };

function retailer(product: GuideProduct): 'Amazon' | 'Shopify' {
  return /(^|\.)amazon\./i.test(product.shop_domain) ? 'Amazon' : 'Shopify';
}

function StoreBadge({ product }: { product: GuideProduct }) {
  const name = retailer(product);
  return <span title={`${name} purchase link`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${line}`, padding: '4px 7px', color: ink, fontSize: 9, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}><ShoppingBag size={11} />{name}</span>;
}

function regionVersion(product: GuideProduct, region: 'AU' | 'UK'): GuideProduct | null {
  const override = product.regional_storefronts?.[region] || (region === 'UK' ? product.regional_storefronts?.EU : null);
  if (override) return { ...product, ...override };
  return region === 'AU' ? product : null;
}

interface ProductForm {
  id?: string;
  url: string;
  shop_domain: string;
  myshopify_domain: string | null;
  product_handle: string;
  variant_id: string | null;
  variant_title: string | null;
  variants: ImportedShopifyVariant[];
  title: string;
  description: string;
  image_url: string;
  price: string;
  currency: string;
  discount_code: string;
  status: 'draft' | 'published';
  protocolIds: string[];
}

const emptyForm = (currency: string): ProductForm => ({ url: '', shop_domain: '', myshopify_domain: null, product_handle: '', variant_id: null, variant_title: null, variants: [], title: '', description: '', image_url: '', price: '', currency, discount_code: '', status: 'draft', protocolIds: [] });

function formFromProduct(product: GuideProduct): ProductForm {
  return {
    id: product.id, url: `https://${product.shop_domain}/products/${product.product_handle}${product.variant_id ? `?variant=${product.variant_id}` : ''}`,
    shop_domain: product.shop_domain, myshopify_domain: product.myshopify_domain, product_handle: product.product_handle, variant_id: product.variant_id, variant_title: product.variant_title,
    variants: [], title: product.title, description: product.description || '', image_url: product.image_url || '', price: product.price_cents == null ? '' : (product.price_cents / 100).toFixed(2),
    currency: product.currency, discount_code: product.discount_code || '', status: product.status, protocolIds: product.protocol_ids,
  };
}

/** Copy for a missing migration, so the panel explains itself before the table exists. */
export function productsErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  const message = error?.message || '';
  if (['42P01', 'PGRST205', 'PGRST200'].includes(error?.code || '') || /guide_products|guide_product_protocols/.test(message)) return 'Products need the latest database update. Ask an admin to apply it, then reload.';
  if (error?.code === '23505') return 'That product variant is already in your list.';
  return message || 'Could not save this product.';
}

export function GuardianProducts({ guideId, guardianSlug, commissionPercent, protocols, defaultCurrency = 'USD', onOpenContentBuilder }: { guideId: string; guardianSlug: string; commissionPercent: number; protocols: { id: string; name: string }[]; defaultCurrency?: string; onOpenContentBuilder?: () => void }) {
  const [products, setProducts] = useState<GuideProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ProductForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [basketProtocolId, setBasketProtocolId] = useState('');

  useEffect(() => {
    let live = true;
    listGuideProducts(guideId).then((rows) => { if (live) setProducts(rows); }).catch((error) => { if (live) setMessage(productsErrorMessage(error)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [guideId]);

  const update = (patch: Partial<ProductForm>) => setForm((current) => (current ? { ...current, ...patch } : current));

  async function fetchFromShopify() {
    if (!form) return;
    setImporting(true); setMessage('');
    try {
      const imported = await importShopifyProduct(form.url);
      const variant = imported.variants.find((entry) => entry.id === imported.variantId);
      update({
        shop_domain: imported.shopDomain, myshopify_domain: imported.myshopifyDomain, product_handle: imported.handle, variant_id: imported.variantId,
        variant_title: variant && imported.variants.length > 1 ? variant.title : null, variants: imported.variants, title: imported.title, description: imported.description,
        image_url: imported.imageUrl || '', price: variant ? (variant.priceCents / 100).toFixed(2) : form.price, currency: imported.currency || form.currency,
      });
    } catch (error: any) { setMessage(error?.message || 'Could not read that product.'); }
    finally { setImporting(false); }
  }

  function chooseVariant(id: string) {
    const variant = form?.variants.find((entry) => entry.id === id);
    if (variant) update({ variant_id: variant.id, variant_title: variant.title, price: (variant.priceCents / 100).toFixed(2) });
  }

  async function save() {
    if (!form) return;
    setBusy(true); setMessage('');
    try {
      // A hand-filled form still needs the store, handle and (optional) variant from the link.
      const ref = form.shop_domain && form.product_handle ? { shopDomain: form.shop_domain, handle: form.product_handle, variantId: form.variant_id } : parseShopifyProductUrl(form.url);
      const title = form.title.trim();
      if (!title) throw new Error('Add the product name.');
      const image = form.image_url.trim();
      if (image && !/^https:\/\//.test(image)) throw new Error('The image link must start with https://.');
      const saved = await saveGuideProduct(guideId, {
        id: form.id, shop_domain: ref.shopDomain, myshopify_domain: form.myshopify_domain, product_handle: ref.handle, variant_id: ref.variantId, variant_title: form.variant_title,
        title, description: form.description.trim().slice(0, 600) || null, image_url: image || null, price_cents: parsePriceToCents(form.price), currency: form.currency,
        discount_code: normalizeDiscountCode(form.discount_code), status: form.status, sort_order: form.id ? products.find((product) => product.id === form.id)?.sort_order ?? 0 : products.length,
      }, form.protocolIds);
      setProducts((current) => form.id ? current.map((product) => product.id === saved.id ? saved : product) : [...current, saved]);
      setForm(null); setMessage(`${saved.title} saved.`);
    } catch (error: any) { setMessage(productsErrorMessage(error)); }
    finally { setBusy(false); }
  }

  async function remove(product: GuideProduct) {
    if (!window.confirm(`Remove ${product.title} from your products?`)) return;
    try { await deleteGuideProduct(product.id); setProducts((current) => current.filter((entry) => entry.id !== product.id)); }
    catch (error: any) { setMessage(productsErrorMessage(error)); }
  }

  async function copyLink(product: GuideProduct) {
    try { await navigator.clipboard.writeText(buyUrl(product)); setCopiedId(product.id); window.setTimeout(() => setCopiedId(null), 1600); }
    catch { setMessage('Could not copy. Use the open button and copy the address instead.'); }
  }

  const buyUrl = (product: GuideProduct) => buildProductBuyUrl(regionalProduct(product), { medium: 'web', guardianSlug });
  const protocolOptions = useMemo(() => protocols.filter((protocol) => products.some((product) => product.protocol_ids.includes(protocol.id))), [products, protocols]);
  const selectedProtocolId = basketProtocolId || protocolOptions[0]?.id || '';
  const selectedProtocol = protocols.find((protocol) => protocol.id === selectedProtocolId);
  const basketProducts = useMemo(() => products.filter((product) => product.status === 'published' && product.protocol_ids.includes(selectedProtocolId)).map((product) => regionalProduct(product)), [products, selectedProtocolId]);
  const basketStores = [...new Set(basketProducts.map((product) => product.shop_domain))];
  const basketCurrency = basketProducts[0]?.currency;
  const basketHasOneCurrency = basketProducts.every((product) => product.currency === basketCurrency);
  const basketHasAllPrices = basketProducts.every((product) => product.price_cents != null);
  const basketSubtotal = basketHasOneCurrency && basketHasAllPrices ? basketProducts.reduce((total, product) => total + (product.price_cents || 0), 0) : null;
  const basketFee = basketHasOneCurrency && basketHasAllPrices ? basketProducts.reduce((total, product) => total + Math.round((product.price_cents || 0) * effectiveCommissionPercent(product, commissionPercent) / 100), 0) : null;
  const feeRates = [...new Set(basketProducts.map((product) => effectiveCommissionPercent(product, commissionPercent)))];
  const basketReady = basketProducts.length > 0 && basketStores.length === 1 && basketProducts.every((product) => !!product.variant_id);
  const basketUrl = basketReady ? buildCartPermalink(basketProducts, { medium: 'web', guardianSlug, protocolSlug: selectedProtocol ? attributionSlug(selectedProtocol.name) : null }) : null;

  const productMeta = (product: GuideProduct) => {
    const local = regionalProduct(product);
    const onProtocols = product.protocol_ids.map((id) => protocols.find((protocol) => protocol.id === id)?.name).filter(Boolean);
    return { local, onProtocols, cartReady: retailer(local) === 'Shopify' && !!local.variant_id };
  };

  return <section>
    <div style={{ border: `1px solid ${line}`, background: panel, padding: 'clamp(24px,4vw,40px)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 24, alignItems: 'end' }}>
      <div><div style={{ ...label, marginTop: 0, color: acid }}>My products</div><h1 style={{ fontFamily: serif, fontSize: 'clamp(38px,5vw,60px)', lineHeight: .95, fontWeight: 300, margin: '10px 0 14px' }}>Sell what you already make.</h1>
        <p style={{ color: muted, lineHeight: 1.6, maxWidth: 680, margin: 0, fontSize: 13 }}>Add products from your Shopify store and attach them to your Protocols. Buyers check out on your store with your discount code, so orders, payment and shipping stay with you. ROUTINE³ marks each order with a referral, and invoices <strong style={{ color: ink }}>{commissionPercent}%</strong> of those orders monthly.</p></div>
      <button type="button" onClick={() => { setForm(emptyForm(defaultCurrency)); setMessage(''); }} style={btn}><Plus size={14} />Add product</button>
    </div>

    {form && <div role="dialog" aria-label={form.id ? 'Edit product' : 'Add product'} style={{ border: `1px solid ${line}`, borderTop: 0, background: '#0D0E0C', padding: 'clamp(18px,3vw,28px)' }}>
      <label style={{ ...label, marginTop: 0 }} htmlFor="product-url">Shopify product link</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input id="product-url" type="url" style={{ ...input, flex: '1 1 320px' }} value={form.url} onChange={(event) => update({ url: event.target.value, shop_domain: '', product_handle: '', variant_id: null, variants: [] })} placeholder="https://yourstore.com/products/your-product" />
        <button type="button" onClick={() => void fetchFromShopify()} disabled={importing || !form.url.trim()} style={{ ...btn, background: acid }}>{importing ? <Loader2 className="animate-spin" size={14} /> : <ShoppingBag size={14} />}Fetch from Shopify</button>
      </div>
      <span style={{ display: 'block', color: muted, fontSize: 10, marginTop: 6 }}>We read the public product page. If your store blocks it, fill in the details below.</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px', gap: 18, marginTop: 6 }}>
        <div>
          <label style={label} htmlFor="product-title">Product name</label><input id="product-title" style={input} value={form.title} onChange={(event) => update({ title: event.target.value })} placeholder="Magnesium glycinate, 90 capsules" />
          {form.variants.length > 1 && <><label style={label} htmlFor="product-variant">Variant</label><select id="product-variant" style={input} value={form.variant_id || ''} onChange={(event) => chooseVariant(event.target.value)}>{form.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.title} · {formatProductPrice(variant.priceCents, form.currency)}{variant.available ? '' : ' (sold out)'}</option>)}</select></>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0 12px' }}>
            <div><label style={label} htmlFor="product-price">Price</label><input id="product-price" inputMode="decimal" style={input} value={form.price} onChange={(event) => update({ price: event.target.value })} placeholder="29.90" /></div>
            <div><label style={label} htmlFor="product-currency">Currency</label><input id="product-currency" style={input} value={form.currency} maxLength={3} onChange={(event) => update({ currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} placeholder="EUR" /></div>
            <div><label style={label} htmlFor="product-discount">Your discount code</label><input id="product-discount" style={input} value={form.discount_code} onChange={(event) => update({ discount_code: event.target.value })} placeholder="ROUTINE10" /></div>
          </div>
          <label style={label} htmlFor="product-image">Image link</label><input id="product-image" type="url" style={input} value={form.image_url} onChange={(event) => update({ image_url: event.target.value })} placeholder="https://cdn.shopify.com/…" />
          <CoverImageActions userId={guideId} title={form.title} description={form.description} kind="product" imageUrl={form.image_url || null} onChange={(url) => update({ image_url: url || '' })} onOpenContentBuilder={onOpenContentBuilder} hint="Upload a picture, or replace it with an AI drawing in your house style. It is kept when you press Save product." />
          <label style={label} htmlFor="product-description">Short description</label><textarea id="product-description" style={{ ...input, height: 84, paddingTop: 10, resize: 'vertical' }} value={form.description} maxLength={600} onChange={(event) => update({ description: event.target.value })} placeholder="Why you recommend it, in a sentence or two." />
        </div>
        <div style={{ paddingTop: 30 }}>{form.image_url ? <img src={form.image_url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', border: `1px solid ${line}`, background: '#fff' }} /> : <div style={{ width: '100%', aspectRatio: '1', border: `1px dashed ${line}`, display: 'grid', placeItems: 'center', color: muted }}><ShoppingBag size={28} strokeWidth={1.2} /></div>}</div>
      </div>
      <label style={label}>Show on Protocols</label>
      {protocols.length ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{protocols.map((protocol) => { const on = form.protocolIds.includes(protocol.id); return <button key={protocol.id} type="button" aria-pressed={on} onClick={() => update({ protocolIds: on ? form.protocolIds.filter((id) => id !== protocol.id) : [...form.protocolIds, protocol.id] })} style={{ ...btn, minHeight: 34, padding: '0 12px', background: on ? acid : 'transparent', color: on ? black : ink, textTransform: 'none', letterSpacing: 0, fontSize: 12, fontWeight: 600 }}>{on && <Check size={12} />}{protocol.name}</button>; })}</div> : <p style={{ color: muted, fontSize: 12, margin: 0 }}>Create a Protocol first to show this product inside it.</p>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 20 }}>
        <label style={{ display: 'inline-flex', gap: 9, alignItems: 'center', color: ink, fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={form.status === 'published'} onChange={(event) => update({ status: event.target.checked ? 'published' : 'draft' })} style={{ width: 18, height: 18, accentColor: acid }} />Show on my site and in the app</label>
        <span style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => setForm(null)} style={{ ...btn, background: 'transparent', color: ink }}><X size={14} />Cancel</button><button type="button" onClick={() => void save()} disabled={busy} style={{ ...btn, background: acid }}>{busy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}Save product</button></span>
      </div>
    </div>}

    {message && <p role="status" style={{ color: message.endsWith('saved.') ? acid : '#F0A7A7', fontSize: 12 }}>{message}</p>}

    {!loading && products.length > 0 && <>
      <section style={{ border: `1px solid ${line}`, marginTop: 18, padding: 'clamp(18px,3vw,26px)', background: panel }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
          <div><span style={{ ...label, margin: 0, color: acid }}>Protocol basket</span><h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 28, margin: '6px 0 0' }}>One checkout, when the store supports it.</h2></div>
          {protocolOptions.length > 0 && <select aria-label="Protocol basket" value={selectedProtocolId} onChange={(event) => setBasketProtocolId(event.target.value)} style={{ ...input, width: 'min(100%,320px)' }}>{protocolOptions.map((protocol) => <option key={protocol.id} value={protocol.id}>{protocol.name}</option>)}</select>}
        </div>
        {selectedProtocol ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 18 }}>
          <div style={{ border: `1px solid ${line}`, padding: 14 }}><span style={label}>Products</span><strong style={{ fontFamily: serif, fontWeight: 300, fontSize: 25 }}>{basketProducts.length}</strong></div>
          <div style={{ border: `1px solid ${line}`, padding: 14 }}><span style={label}>Protocol price</span><strong style={{ fontFamily: serif, fontWeight: 300, fontSize: 25 }}>{basketSubtotal == null ? 'Store prices' : formatProductPrice(basketSubtotal, basketCurrency)}</strong></div>
          <div style={{ border: `1px solid ${line}`, padding: 14 }}><span style={label}>ROUTINE³ fee</span><strong style={{ fontFamily: serif, fontWeight: 300, fontSize: 25 }}>{feeRates.length === 1 ? `${feeRates[0]}%` : 'Blended'}{basketFee == null ? '' : ` · ${formatProductPrice(basketFee, basketCurrency)}`}</strong></div>
          <div style={{ border: `1px solid ${line}`, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{basketUrl ? <a href={basketUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none', background: acid }}>Buy all {basketProducts.length}</a> : <><strong style={{ color: '#F0C28A', fontSize: 12 }}>One-click basket unavailable</strong><span style={{ color: muted, fontSize: 10, lineHeight: 1.4, marginTop: 5 }}>{basketStores.length > 1 ? 'Products use different stores.' : 'One or more products needs a Shopify variant.'}</span></>}</div>
        </div> : <p style={{ color: muted, fontSize: 12, marginBottom: 0 }}>Attach products to a Protocol to create its price and buy-all basket.</p>}
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <span style={{ color: muted, fontSize: 11 }}>Regional storefronts and checkout readiness are based on the saved product links.</span>
        <span style={{ display: 'flex' }}><button type="button" aria-label="Card view" aria-pressed={view === 'cards'} onClick={() => setView('cards')} style={{ ...iconBtn, background: view === 'cards' ? ink : 'transparent', color: view === 'cards' ? black : ink }}><Grid2X2 size={14} /></button><button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')} style={{ ...iconBtn, background: view === 'list' ? ink : 'transparent', color: view === 'list' ? black : ink }}><List size={14} /></button></span>
      </div>
    </>}

    <div style={{ marginTop: 12 }}>
      {loading ? <p style={{ color: muted, fontSize: 12 }}>Loading products…</p> : products.length ? <div style={view === 'cards' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 14 } : undefined}>{products.map((product) => {
        const { local, onProtocols, cartReady } = productMeta(product);
        const regions = (['AU', 'UK'] as const).map((region) => ({ region, product: regionVersion(product, region) }));
        const actions = <div style={{ display: 'flex', gap: 6 }}><a href={buyUrl(product)} target="_blank" rel="noopener noreferrer" title="Open buy link" aria-label={`Open buy link for ${product.title}`} style={{ ...iconBtn, textDecoration: 'none' }}><ExternalLink size={14} /></a><button type="button" title="Copy buy link" aria-label={`Copy buy link for ${product.title}`} onClick={() => void copyLink(product)} style={iconBtn}>{copiedId === product.id ? <Check size={14} color={acid} /> : <Copy size={14} />}</button><button type="button" title="Edit product" aria-label={`Edit ${product.title}`} onClick={() => { setForm(formFromProduct(product)); setMessage(''); }} style={iconBtn}><Pencil size={14} /></button><button type="button" title="Remove product" aria-label={`Remove ${product.title}`} onClick={() => void remove(product)} style={{ ...iconBtn, color: muted }}><Trash2 size={14} /></button></div>;
        if (view === 'list') return <article key={product.id} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) auto', gap: 16, alignItems: 'center', borderTop: `1px solid ${line}`, padding: '16px 2px' }}>{product.image_url ? <img src={product.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', background: '#fff' }} /> : <div style={{ width: 64, height: 64, border: `1px solid ${line}`, display: 'grid', placeItems: 'center', color: muted }}><ShoppingBag size={20} /></div>}<div style={{ minWidth: 0 }}><div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}><StoreBadge product={product} /><span style={{ color: product.status === 'published' ? acid : muted, fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>{product.status === 'published' ? 'Public' : 'Private'}</span><span style={{ color: cartReady ? acid : '#F0C28A', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>{cartReady ? 'Mobile cart ready' : 'Product page only'}</span></div><h3 style={{ fontFamily: serif, fontSize: 22, fontWeight: 300, margin: '5px 0 3px' }}>{product.title}</h3><span style={{ color: muted, fontSize: 11 }}>{formatProductPrice(local.price_cents, local.currency) || 'See store price'} · {onProtocols.length ? `On ${onProtocols.join(', ')}` : 'Not on a Protocol yet'}</span></div>{actions}</article>;
        return <article key={product.id} style={{ border: `1px solid ${line}`, background: panel, minWidth: 0, display: 'flex', flexDirection: 'column' }}><div style={{ position: 'relative', aspectRatio: '1.35', background: '#F3F1EA', overflow: 'hidden' }}>{product.image_url ? <img src={product.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#777' }}><ShoppingBag size={40} /></div>}<span style={{ position: 'absolute', top: 10, left: 10 }}><StoreBadge product={product} /></span><span style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 5 }}><span style={{ border: `1px solid ${line}`, background: black, padding: '4px 7px', fontSize: 8, fontWeight: 800 }}>YOURS</span><span style={{ border: `1px solid ${line}`, background: black, color: product.status === 'published' ? acid : muted, padding: '4px 7px', fontSize: 8, fontWeight: 800 }}>{product.status === 'published' ? 'PUBLIC' : 'PRIVATE'}</span></span></div><div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}><div><h3 style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.05, fontWeight: 300, margin: 0 }}>{product.title}</h3><span style={{ color: cartReady ? acid : '#F0C28A', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>{cartReady ? 'Mobile cart ready' : 'Product page only — no direct variant'}</span></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>{regions.map(({ region, product: item }) => <div key={region} style={{ border: `1px solid ${line}`, padding: 9 }}><strong style={{ display: 'block', fontSize: 10 }}>{region} store</strong><span style={{ color: muted, fontSize: 10 }}>{item ? (formatProductPrice(item.price_cents, item.currency) || 'See store price') : 'Not configured'}</span><span style={{ display: 'block', color: item?.variant_id ? acid : muted, fontSize: 8, marginTop: 3 }}>{item ? (item.variant_id ? 'Cart ready' : 'Page link') : 'No storefront'}</span></div>)}</div><span style={{ color: muted, fontSize: 10 }}>{onProtocols.length ? `On ${onProtocols.join(', ')}` : 'Not on a Protocol yet'}</span><div style={{ marginTop: 'auto' }}>{actions}</div></div></article>;
      })}</div> : !form && <div style={{ border: `1px dashed ${line}`, padding: 'clamp(24px,4vw,40px)', marginTop: 4, textAlign: 'center' }}><ShoppingBag size={34} strokeWidth={1} color={acid} /><h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 28, margin: '12px 0 6px' }}>No products yet</h2><p style={{ color: muted, fontSize: 12, margin: '0 auto 16px', maxWidth: 420 }}>Paste a product link from your Shopify store. It will show on your site and on the Protocols you choose.</p><button type="button" onClick={() => setForm(emptyForm(defaultCurrency))} style={btn}><Plus size={14} />Add your first product</button></div>}
    </div>
  </section>;
}

const APP = { surface: '#FFFFFF', text: '#11120F', muted: '#66645F', border: 'rgba(17,18,15,.2)', greenDark: '#667245', font: sans };

const publicProductCardMotion = {
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const card = event.currentTarget;
    const bounds = card.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    card.style.setProperty('--product-rx', `${((.5 - y) * 5).toFixed(2)}deg`);
    card.style.setProperty('--product-ry', `${((x - .5) * 6).toFixed(2)}deg`);
    card.style.setProperty('--product-px', `${((.5 - x) * 16).toFixed(1)}px`);
    card.style.setProperty('--product-py', `${((.5 - y) * 16).toFixed(1)}px`);
    card.style.setProperty('--product-lift', '-5px');
    card.style.boxShadow = '0 24px 46px -22px rgba(17,18,15,.5)';
  },
  onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
    const card = event.currentTarget;
    card.style.setProperty('--product-rx', '0deg');
    card.style.setProperty('--product-ry', '0deg');
    card.style.setProperty('--product-px', '0px');
    card.style.setProperty('--product-py', '0px');
    card.style.setProperty('--product-lift', '0px');
    card.style.boxShadow = 'none';
  },
};

const publicProductCardStyle: React.CSSProperties = {
  background: APP.surface,
  border: `1px solid ${APP.border}`,
  borderRadius: 6,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: APP.font,
  color: APP.text,
  transform: 'perspective(1100px) rotateX(var(--product-rx, 0deg)) rotateY(var(--product-ry, 0deg)) translateY(var(--product-lift, 0px))',
  transformStyle: 'preserve-3d',
  transition: 'transform 420ms cubic-bezier(.16,1,.3,1), box-shadow 420ms cubic-bezier(.16,1,.3,1)',
  willChange: 'transform',
};

/** Public "Shop" block on a Guardian's site. Renders nothing until there are published products. */
export function GuardianShop({ guideId, guardianSlug, guardianName, pagePadding, protocols = [], localePreference, categoryOrder }: { guideId: string; guardianSlug: string; guardianName: string; pagePadding: string; protocols?: AdminProtocol[]; localePreference?: GuardianLocalePreference; categoryOrder?: string }) {
  const [products, setProducts] = useState<GuideProduct[]>([]);
  const [usage, setUsage] = useState<Record<string, string[]>>({});
  const [downloading, setDownloading] = useState('');
  const [message, setMessage] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let live = true;
    listPublicGuideProducts(guideId).then((rows) => { if (live) setProducts(rows); }).catch(() => { if (live) setProducts([]); });
    return () => { live = false; };
  }, [guideId]);
  useEffect(() => {
    let live = true;
    fetch('https://api.frankfurter.dev/v1/latest?base=EUR').then((response) => response.ok ? response.json() : null).then((data) => {
      if (live && data?.rates) setRates({ EUR: 1, ...data.rates });
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all(protocols.map(async (protocol) => ({ protocol, items: await listProtocolItems('', protocol.id).catch(() => []) }))).then((rows) => {
      if (!live) return;
      const next: Record<string, string[]> = {};
      for (const { protocol, items } of rows) for (const item of items) if (item.catalog_product_id) next[item.catalog_product_id] = [...new Set([...(next[item.catalog_product_id] || []), protocol.id])];
      setUsage(next);
    });
    return () => { live = false; };
  }, [protocols]);
  async function downloadProtocol(protocol: AdminProtocol) {
    setDownloading(protocol.id); setMessage('');
    try { await generateProtocolPdf({ accessToken: '', protocol, items: await listProtocolItems('', protocol.id), day: 1 }); }
    catch { setMessage('This Protocol PDF is not available for public download yet.'); }
    finally { setDownloading(''); }
  }
  if (!products.length) return null;
  const regionalProducts = products.map((product) => ({ source: product, regional: regionalProductOrNull(product, localePreference?.locale || navigator.language, localePreference?.region || Intl.DateTimeFormat().resolvedOptions().timeZone) })).filter((entry): entry is { source: GuideProduct; regional: GuideProduct } => !!entry.regional);
  const configured = (categoryOrder || '').split(',').map((value) => value.trim()).filter(Boolean);
  const categories = ['All', ...(configured.length ? configured : DEFAULT_PRODUCT_CATEGORIES.slice(1))].filter((category, index, all) => all.indexOf(category) === index && (category === 'All' || regionalProducts.some(({ source }) => productCategory(source) === category)));
  const shownProducts = activeCategory === 'All' ? regionalProducts : regionalProducts.filter(({ source }) => productCategory(source) === activeCategory);
  const shopHeading = guardianSlug === 'barbara-oneill'
    ? `${guardianName}’s endorsed products.`
    : `${guardianName}’s products.`;
  const displayPrice = (product: GuideProduct) => {
    if (product.price_cents == null) return 'See local price';
    const target = localePreference?.currency || product.currency;
    const sourceRate = rates?.[product.currency];
    const targetRate = rates?.[target];
    if (!rates || !sourceRate || !targetRate || target === product.currency) return formatProductPrice(product.price_cents, product.currency, localePreference?.locale);
    return `≈ ${formatProductPrice(Math.round(product.price_cents * targetRate / sourceRate), target, localePreference?.locale)}`;
  };
  return <section id="shop" aria-label={`Shop ${guardianName}'s products`} style={{ padding: `clamp(72px,10vw,132px) ${pagePadding}`, borderTop: '1px solid rgba(242,239,231,.18)', background: '#11120F', color: '#F2EFE7' }}>
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
    <div style={{ fontFamily: APP.font, margin: '0 0 clamp(30px,5vw,52px)', maxWidth: 760 }}>
      <span style={{ display: 'block', color: '#CADA91', fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 12 }}>Local shop · {regionalProducts.length} products</span>
      <h2 style={{ fontFamily: serif, fontSize: 'clamp(42px,7vw,82px)', fontWeight: 300, lineHeight: .94, letterSpacing: '-.045em', color: '#F2EFE7', margin: '0 0 18px' }}>{shopHeading}</h2>
      <p style={{ color: '#B8B6AF', fontSize: 16, lineHeight: 1.55, margin: 0, maxWidth: 620 }}>Shop products directly, then open the Protocols that use them in ROUTINE³ or keep a printable PDF.</p>
    </div>
    <div role="tablist" aria-label="Product categories" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 26px' }}>{categories.map((category) => <button key={category} type="button" role="tab" aria-selected={activeCategory === category} onClick={() => setActiveCategory(category)} style={{ border: `1px solid ${activeCategory === category ? '#F2EFE7' : 'rgba(242,239,231,.34)'}`, background: activeCategory === category ? '#F2EFE7' : 'transparent', color: activeCategory === category ? '#11120F' : '#F2EFE7', minHeight: 38, padding: '0 14px', fontFamily: APP.font, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{category}</button>)}</div>
    {message && <p role="alert" style={{ color: '#8A3D2F', fontSize: 12 }}>{message}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 18 }}>
      {shownProducts.map(({ source: product, regional }) => { const linkedIds = [...new Set([...product.protocol_ids, ...(product.catalog_product_id ? usage[product.catalog_product_id] || [] : [])])]; const linked = linkedIds.map((id) => protocols.find((protocol) => protocol.id === id)).filter((protocol): protocol is AdminProtocol => !!protocol); return <article key={product.id} {...publicProductCardMotion} style={publicProductCardStyle} onPointerDown={(event) => { if (event.pointerType !== 'mouse') event.currentTarget.style.setProperty('--product-lift', '-2px'); }} onPointerUp={(event) => { if (event.pointerType !== 'mouse') event.currentTarget.style.setProperty('--product-lift', '0px'); }}>
        <PublicProductImage product={product} regional={regional} />
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <span style={{ color: APP.greenDark, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Product · {regional.shop_domain}</span>
          <h3 style={{ fontFamily: serif, fontSize: 27, fontWeight: 300, margin: 0, lineHeight: 1.08 }}>{product.title}</h3>
          {product.description && <p style={{ color: APP.muted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>{product.description.length > 140 ? `${product.description.slice(0, 139)}…` : product.description}</p>}
          {linked.length > 0 && <details style={{ borderTop: `1px solid ${APP.border}`, marginTop: 8, paddingTop: 12 }}><summary style={{ color: APP.greenDark, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer' }}>Used in {linked.length} Protocol{linked.length === 1 ? '' : 's'} · View</summary>{linked.map((protocol) => <div key={protocol.id} style={{ marginTop: 9 }}><strong style={{ display: 'block', fontFamily: serif, fontSize: 16, fontWeight: 300 }}>{protocol.name.replace(/^R3 Protocol\s*>\s*/i, '')}</strong><span style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}><a href={`/protocol/${encodeURIComponent(protocol.id)}`} style={{ border: `1px solid ${APP.border}`, color: APP.text, padding: '7px 9px', fontSize: 9, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'uppercase', letterSpacing: '.07em' }}><Smartphone size={12} />Open in app</a><button type="button" disabled={downloading === protocol.id} onClick={() => void downloadProtocol(protocol)} style={{ border: `1px solid ${APP.border}`, background: 'transparent', color: APP.text, padding: '7px 9px', fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'uppercase', letterSpacing: '.07em' }}><Download size={12} />{downloading === protocol.id ? 'Preparing…' : 'PDF'}</button></span></div>)}</details>}
          <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ fontFamily: serif, fontWeight: 300, fontSize: 20 }}>{displayPrice(regional)}</strong>
            <a href={buildProductBuyUrl(regional, { medium: 'web', guardianSlug, protocolSlug: linked[0] ? attributionSlug(linked[0].name) : null })} target="_blank" rel="noopener noreferrer" style={{ background: '#11120F', color: '#FFF', borderRadius: 2, padding: '11px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', textDecoration: 'none' }}>{regional.variant_id ? 'Add to basket' : 'View product'}</a>
          </div>
          {localePreference && regional.price_cents != null && regional.currency !== localePreference.currency && <span style={{ color: APP.muted, fontSize: 10 }}>Checkout uses {formatProductPrice(regional.price_cents, regional.currency, localePreference.locale)} in the selected regional store.</span>}
          {product.discount_code && <span style={{ color: APP.greenDark, fontSize: 11, fontWeight: 600 }}>Code {product.discount_code} applied at checkout</span>}
        </div>
      </article>; })}
    </div>
    </div>
  </section>;
}

