/*
 * The brand's logo as a round badge cut from the card it sits on, placed by the caller across the edge between a card's
 * picture and its text. A flat black-on-transparent logo is shown white on a dark card and black on a light one; a photo
 * (a Guardian's portrait) is shown as it is.
 */
import { isMonoLogoUrl } from '../../utils/brandLogo';

const serif = '"CanelaText", "Canela Text", Georgia, serif';

export function LogoBadge({ url, name, surface, onDark, size = 68 }: { url?: string | null; name: string; surface: string; onDark: boolean; size?: number }) {
  const mono = isMonoLogoUrl(url);
  return (
    <span data-destination-badge style={{ position: 'absolute', right: 18, bottom: -(size / 2), width: size, height: size, boxSizing: 'border-box', borderRadius: '50%', overflow: 'hidden', background: surface, boxShadow: `0 0 0 4px ${surface}`, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      {url
        ? <img src={url} alt="" style={mono ? { width: '100%', height: '100%', objectFit: 'contain', ...(onDark ? { filter: 'invert(1)' } : {}) } : { width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: onDark ? '#F5F2EA' : '#11120F', fontFamily: serif, fontSize: size * 0.38 }}>{name.charAt(0)}</span>}
    </span>
  );
}
