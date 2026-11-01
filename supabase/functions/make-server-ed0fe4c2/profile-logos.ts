/*
 * Finds a website's logo for the profile importer: the logo in its structured data, an image on the page that calls
 * itself a logo, then its touch and tab icons. Dependency-free so the same code runs in the function and in tests.
 * Returns absolute https links, best guess first, with the resizing the site added (width, crop, Wix fill) taken off so
 * the original file is fetched rather than a 32 px thumbnail.
 */

const MAX_LOGOS = 6;

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').replace(/&amp;/g, '&').trim();
}

/** The same picture without the size the site asked for. */
export function originalImageUrl(raw: string, base: URL): string {
  let url: URL;
  try { url = new URL(raw.trim(), base); } catch { return ''; }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return '';
  // Wix serves /media/<file>/v1/fill/w_32,h_32/<name>: the bare /media/<file> is the original.
  if (/(^|\.)wixstatic\.com$/i.test(url.hostname)) url.pathname = url.pathname.replace(/\/v1\/.*$/, '');
  for (const key of ['width', 'height', 'w', 'h', 'crop', 'fit', 'quality', 'format']) url.searchParams.delete(key);
  return url.toString();
}

function logoFromJsonLd(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const queue: unknown[] = [JSON.parse(match[1])];
      while (queue.length) {
        const node = queue.shift() as Record<string, any> | undefined;
        if (!node || typeof node !== 'object') continue;
        if (Array.isArray(node)) { queue.push(...node); continue; }
        if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
        const logo = node.logo;
        if (typeof logo === 'string') found.push(logo);
        else if (logo && typeof logo === 'object' && typeof logo.url === 'string') found.push(logo.url);
      }
    } catch { /* Malformed third-party structured data is ignored. */ }
  }
  return found;
}

export function profileLogoCandidates(html: string, pageUrl: URL): string[] {
  const ordered: string[] = [];
  ordered.push(...logoFromJsonLd(html));
  // An image that calls itself the logo: by class, id, alt text or file name.
  for (const tag of (html.match(/<img\b[^>]*>/gi) || []).slice(0, 60)) {
    if (!/logo/i.test(`${attribute(tag, 'class')} ${attribute(tag, 'id')} ${attribute(tag, 'alt')} ${attribute(tag, 'src')}`)) continue;
    const src = attribute(tag, 'src') || attribute(tag, 'data-src');
    if (src && !src.startsWith('data:')) ordered.push(src);
  }
  const links = (html.match(/<link\b[^>]*>/gi) || []).map((tag) => ({ rel: attribute(tag, 'rel').toLowerCase(), href: attribute(tag, 'href'), size: parseInt(attribute(tag, 'sizes'), 10) || 0 }));
  // Larger icons first: they were drawn for display, not for a browser tab.
  for (const link of links.filter((item) => item.rel.includes('apple-touch-icon')).sort((a, b) => b.size - a.size)) ordered.push(link.href);
  for (const link of links.filter((item) => /(^|\s)(?:shortcut )?icon(\s|$)/.test(item.rel)).sort((a, b) => b.size - a.size)) ordered.push(link.href);
  const seen = new Set<string>();
  return ordered.map((value) => (value ? originalImageUrl(value, pageUrl) : '')).filter((value) => value && !seen.has(value) && !!seen.add(value)).slice(0, MAX_LOGOS);
}
