import table from './shareRoutes.json';

/**
 * What a shared link to each part of the site looks like in a chat or feed: the R³ mark and the route's name on the
 * ROUTINE³ background. shareRoutes.json is the one list; scripts/gen-share-pages.mjs writes each route's page from it at
 * build time (link crawlers do not run the app), scripts/gen-share-cards.mjs draws the card, scripts/check-routes.mjs
 * keeps netlify.toml and the static pages in step with it.
 */
export interface ShareRoute {
  id: string;
  /** The name drawn on the card, e.g. "R³ Guardians". */
  name: string;
  /** Canonical path (and query) of the route. */
  url: string;
  title: string;
  description: string;
  /** The card's headline, set like the home hero: lead in white, emphasis in italic ink. "\n" breaks a line. */
  card: { lead: string; emphasis: string };
  paths: string[];
  query?: Record<string, string>;
  page: string | string[];
}

export const SHARE_ORIGIN: string = table.origin;
export const SHARE_IMAGE_SIZE: { width: number; height: number } = table.image;
export const SHARE_ROUTES: ShareRoute[] = table.routes as ShareRoute[];
export const shareImagePath = (route: Pick<ShareRoute, 'id'>) => `/share/${route.id}.jpg`;
export const shareImageUrl = (route: Pick<ShareRoute, 'id'>) => `${SHARE_ORIGIN}${shareImagePath(route)}`;

/** "/guardians/*" matches "/guardians" and everything under it; "/@*" matches "/@anything". */
export function pathMatches(pattern: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (pattern.endsWith('/*')) { const base = pattern.slice(0, -2); return path === base || path.startsWith(`${base}/`); }
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

/** The route a URL belongs to. Anything the table does not name is the home route. */
export function shareRouteFor(pathname: string, search = ''): ShareRoute {
  const params = new URLSearchParams(search);
  const hit = SHARE_ROUTES.find((r) => r.paths.some((p) => pathMatches(p, pathname)) && Object.entries(r.query || {}).every(([k, v]) => params.get(k) === v));
  return hit || SHARE_ROUTES[0];
}
