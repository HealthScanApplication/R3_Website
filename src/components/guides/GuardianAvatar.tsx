import React, { useEffect, useState } from 'react';
import { listGuideBrands } from '../../utils/guidePortal';

/**
 * The signed-in Guardian's picture in the top-right of the header.
 *
 * Which picture: the first of the candidates given (the Guardian profile's photo, then the account photo), and only when there is
 * none the first brand's logo, so the nav never goes without a face once anything has been uploaded.
 *
 * Transparent images are welcome: the picture sits on a light tile, not on the dark header, so a transparent PNG or WebP of a dark
 * drawing or logo stays readable (it vanished against a dark background), and `cover` keeps a cut-out portrait filling the circle.
 * With no picture, or one that fails to load, the person's initials are shown instead.
 */
export const firstImage = (...candidates: Array<string | null | undefined>): string | null => candidates.find((c) => typeof c === 'string' && c.trim().length > 0)?.trim() ?? null;

export function initialsOf(name: string | null | undefined): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The picture for the nav: the first of `candidates`, else the first brand's logo (looked up only when nothing else is set). */
export function useGuardianAvatarUrl(userId: string | null | undefined, ...candidates: Array<string | null | undefined>): string | null {
  const direct = firstImage(...candidates);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  useEffect(() => {
    if (direct || !userId) { setBrandLogo(null); return undefined; }
    let live = true;
    listGuideBrands(userId)
      .then((brands) => { if (live) setBrandLogo(firstImage(...brands.map((brand) => brand.logo_url))); })
      .catch(() => { if (live) setBrandLogo(null); });
    return () => { live = false; };
  }, [direct, userId]);
  return direct ?? brandLogo;
}

export function GuardianAvatar({ url, name, size = 31, line = 'rgba(245,242,234,.28)', tile = '#F5F2EA', textColor = '#0B0C09' }: {
  url?: string | null;
  name?: string | null;
  size?: number;
  line?: string;
  tile?: string;
  textColor?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  const initials = initialsOf(name);
  const showImage = !!url && !failed;
  if (!showImage && !initials) return null;
  return (
    <span
      data-testid="guardian-avatar"
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, boxSizing: 'border-box', borderRadius: '50%', overflow: 'hidden', border: `1px solid ${line}`, background: tile, color: textColor, display: 'grid', placeItems: 'center', fontSize: Math.round(size * 0.36), fontWeight: 700, letterSpacing: '.04em', lineHeight: 1 }}
    >
      {showImage
        ? <img src={url as string} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
        : initials}
    </span>
  );
}
