import { useEffect } from 'react';
import { SHARE_IMAGE_SIZE, SHARE_ORIGIN, shareImageUrl, shareRouteFor } from '../config/shareRoutes';

type MetaDoc = Pick<Document, 'querySelector' | 'createElement' | 'head' | 'title'>;
const setTag = (doc: MetaDoc, attr: 'property' | 'name', key: string, content: string) => {
  let tag = doc.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = doc.createElement('meta');
    tag.setAttribute(attr, key);
    doc.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

/**
 * Keeps the tab title and the link-preview tags in step with the route being shown. Crawlers read the page the server sends
 * (scripts/gen-share-pages.mjs writes one per route); this keeps what a browser's own Share button reads the same.
 * The home route keeps the title index.html ships.
 */
export function applyShareMeta(pathname = window.location.pathname, search = window.location.search, doc: MetaDoc = document) {
  const route = shareRouteFor(pathname, search);
  const url = `${SHARE_ORIGIN}${route.url}`;
  const image = shareImageUrl(route);
  setTag(doc, 'name', 'description', route.description);
  setTag(doc, 'property', 'og:title', route.title);
  setTag(doc, 'property', 'og:description', route.description);
  setTag(doc, 'property', 'og:url', url);
  setTag(doc, 'property', 'og:image', image);
  setTag(doc, 'property', 'og:image:width', String(SHARE_IMAGE_SIZE.width));
  setTag(doc, 'property', 'og:image:height', String(SHARE_IMAGE_SIZE.height));
  setTag(doc, 'property', 'og:image:alt', `${route.name} on ROUTINE³`);
  setTag(doc, 'name', 'twitter:title', route.title);
  setTag(doc, 'name', 'twitter:description', route.description);
  setTag(doc, 'name', 'twitter:image', image);
  if (route.id !== 'home') doc.title = route.title;
}

export function useDocumentSetup() {
  useEffect(() => {
    // Prevent zoom on input focus while allowing user scaling
    let viewportTag = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!viewportTag) {
      viewportTag = document.createElement('meta');
      viewportTag.setAttribute('name', 'viewport');
      document.head.appendChild(viewportTag);
    }
    viewportTag.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover');

    applyShareMeta();
    const onNavigate = () => applyShareMeta();
    window.addEventListener('popstate', onNavigate);
    return () => window.removeEventListener('popstate', onNavigate);
  }, []);
}
