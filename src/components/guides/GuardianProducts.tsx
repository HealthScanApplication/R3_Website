// Guardian products: the workspace "My products" manager and the public "Shop" block.
// Buyers check out on the Guardian's own Shopify store; ROUTINE³ attribution and the
// Guardian's discount code travel in the cart permalink (docs/guardian-shopify-commerce.md).
import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Pencil, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { deleteGuideProduct, listGuideProducts, listPublicGuideProducts, saveGuideProduct, type GuideProduct } from '../../utils/guidePortal';
import {
  buildProductBuyUrl, formatProductPrice, importShopifyProduct, normalizeDiscountCode, parsePriceToCents, parseShopifyProductUrl,
  type ImportedShopifyVariant,
} from '../../utils/guideProducts';

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

export function GuardianProducts({ guideId, guardianSlug, commissionPercent, protocols, defaultCurrency = 'USD' }: { guideId: string; guardianSlug: string; commissionPercent: number; protocols: { id: string; name: string }[]; defaultCurrency?: string }) {
  const [products, setProducts] = useState<GuideProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ProductForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const buyUrl = (product: Pick<GuideProduct, 'shop_domain' | 'product_handle' | 'variant_id' | 'title' | 'price_cents' | 'currency' | 'discount_code'>) => buildProductBuyUrl(product, { medium: 'web', guardianSlug });

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

    <div style={{ marginTop: 18 }}>
      {loading ? <p style={{ color: muted, fontSize: 12 }}>Loading products…</p> : products.length ? products.map((product) => {
        const onProtocols = product.protocol_ids.map((id) => protocols.find((protocol) => protocol.id === id)?.name).filter(Boolean);
        return <article key={product.id} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) auto', gap: 16, alignItems: 'center', borderTop: `1px solid ${line}`, padding: '16px 2px' }}>
          {product.image_url ? <img src={product.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', background: '#fff' }} /> : <div style={{ width: 64, height: 64, border: `1px solid ${line}`, display: 'grid', placeItems: 'center', color: muted }}><ShoppingBag size={20} strokeWidth={1.3} /></div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><span style={{ color: product.status === 'published' ? acid : muted, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{product.status === 'published' ? 'Live' : 'Draft'} · {product.shop_domain}{product.discount_code ? ` · code ${product.discount_code}` : ''}</span><span style={{ display: 'flex', gap: 5 }}><span style={{ border: `1px solid ${line}`, padding: '3px 6px', color: ink, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Yours</span><span style={{ border: `1px solid ${line}`, padding: '3px 6px', color: product.status === 'published' ? acid : muted, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{product.status === 'published' ? 'Public' : 'Private'}</span></span></div>
            <h3 style={{ fontFamily: serif, fontSize: 22, fontWeight: 300, margin: '4px 0 3px' }}>{product.title}{product.variant_title ? <span style={{ color: muted, fontSize: 15 }}> · {product.variant_title}</span> : null}</h3>
            <span style={{ color: muted, fontSize: 11 }}>{[formatProductPrice(product.price_cents, product.currency), onProtocols.length ? `On ${onProtocols.join(', ')}` : 'Not on a Protocol yet', !product.variant_id && 'opens the product page (no variant)'].filter(Boolean).join(' · ')}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href={buyUrl(product)} target="_blank" rel="noopener noreferrer" title="Open buy link" aria-label={`Open buy link for ${product.title}`} style={{ ...iconBtn, textDecoration: 'none' }}><ExternalLink size={14} /></a>
            <button type="button" title="Copy buy link" aria-label={`Copy buy link for ${product.title}`} onClick={() => void copyLink(product)} style={iconBtn}>{copiedId === product.id ? <Check size={14} color={acid} /> : <Copy size={14} />}</button>
            <button type="button" title="Edit product" aria-label={`Edit ${product.title}`} onClick={() => { setForm(formFromProduct(product)); setMessage(''); }} style={iconBtn}><Pencil size={14} /></button>
            <button type="button" title="Remove product" aria-label={`Remove ${product.title}`} onClick={() => void remove(product)} style={{ ...iconBtn, color: muted }}><Trash2 size={14} /></button>
          </div>
        </article>;
      }) : !form && <div style={{ border: `1px dashed ${line}`, padding: 'clamp(24px,4vw,40px)', marginTop: 4, textAlign: 'center' }}><ShoppingBag size={34} strokeWidth={1} color={acid} /><h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 28, margin: '12px 0 6px' }}>No products yet</h2><p style={{ color: muted, fontSize: 12, margin: '0 auto 16px', maxWidth: 420 }}>Paste a product link from your Shopify store. It will show on your site and on the Protocols you choose.</p><button type="button" onClick={() => setForm(emptyForm(defaultCurrency))} style={btn}><Plus size={14} />Add your first product</button></div>}
    </div>
  </section>;
}

const APP = { surface: '#FFFFFF', text: '#111827', muted: '#6B7280', border: '#E5E7EB', greenDark: '#047857', font: "'Poppins', 'Inter', sans-serif" };

/** Public "Shop" block on a Guardian's site. Renders nothing until there are published products. */
export function GuardianShop({ guideId, guardianSlug, guardianName, pagePadding }: { guideId: string; guardianSlug: string; guardianName: string; pagePadding: string }) {
  const [products, setProducts] = useState<GuideProduct[]>([]);
  useEffect(() => {
    let live = true;
    listPublicGuideProducts(guideId).then((rows) => { if (live) setProducts(rows); }).catch(() => { if (live) setProducts([]); });
    return () => { live = false; };
  }, [guideId]);
  if (!products.length) return null;
  return <section id="shop" aria-label={`Shop ${guardianName}'s products`} style={{ padding: `clamp(72px,10vw,132px) ${pagePadding}`, borderTop: '1px solid rgba(17,18,15,.2)', background: '#F2EFE7', color: APP.text }}>
    <div style={{ fontFamily: APP.font, textAlign: 'center', margin: '0 auto 28px', maxWidth: 640 }}>
      <span style={{ display: 'block', color: APP.greenDark, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>All products · {products.length}</span>
      <h2 style={{ fontFamily: APP.font, fontSize: 'clamp(28px,4vw,40px)', fontWeight: 700, color: APP.text, margin: '0 0 8px' }}>{guardianName}’s complete shop</h2>
      <p style={{ color: APP.muted, fontSize: 15, fontWeight: 600, margin: 0 }}>Every published product, bought directly from {guardianName}’s own store.</p>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),280px))', justifyContent: 'center', gap: 18 }}>
      {products.map((product) => <article key={product.id} style={{ background: APP.surface, border: `1px solid ${APP.border}`, borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: APP.font, color: APP.text }}>
        {product.image_url ? <img src={product.image_url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', background: '#F6F8FA' }} /> : <div style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', background: '#F6F8FA', color: APP.muted }}><ShoppingBag size={40} strokeWidth={1.2} /></div>}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{product.title}</h3>
          {product.description && <p style={{ color: APP.muted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>{product.description.length > 140 ? `${product.description.slice(0, 139)}…` : product.description}</p>}
          <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ fontSize: 15 }}>{formatProductPrice(product.price_cents, product.currency)}</strong>
            <a href={buildProductBuyUrl(product, { medium: 'web', guardianSlug, protocolSlug: null })} target="_blank" rel="noopener noreferrer" style={{ background: '#000', color: '#FFF', borderRadius: 12, padding: '10px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Buy</a>
          </div>
          {product.discount_code && <span style={{ color: APP.greenDark, fontSize: 11, fontWeight: 600 }}>Code {product.discount_code} applied at checkout</span>}
        </div>
      </article>)}
    </div>
  </section>;
}

