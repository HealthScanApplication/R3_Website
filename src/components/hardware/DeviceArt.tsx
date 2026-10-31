import React, { useId } from 'react';

export function RingArt() {
  const uid = useId().replace(/[^\w-]/g, '');
  const bg = `ring-bg-${uid}`;
  const shell = `ring-shell-${uid}`;
  const shadow = `ring-shadow-${uid}`;
  return (
    <svg viewBox="0 0 640 520" role="img" aria-label="Concept illustration of the R3 Note smart ring">
      <defs>
        <radialGradient id={bg} cx="48%" cy="42%" r="70%">
          <stop offset="0" stopColor="#2a2d29" />
          <stop offset="1" stopColor="#10110f" />
        </radialGradient>
        <linearGradient id={shell} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#474a45" />
          <stop offset="0.42" stopColor="#121311" />
          <stop offset="0.75" stopColor="#343632" />
          <stop offset="1" stopColor="#090a09" />
        </linearGradient>
        <filter id={shadow} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="26" stdDeviation="22" floodColor="#000" floodOpacity=".55" />
        </filter>
      </defs>
      <rect width="640" height="520" fill={`url(#${bg})`} />
      <ellipse cx="320" cy="430" rx="190" ry="32" fill="#000" opacity=".36" />
      <g filter={`url(#${shadow})`} transform="translate(320 248) rotate(-13)">
        <ellipse rx="190" ry="212" fill={`url(#${shell})`} />
        <ellipse rx="112" ry="138" fill="#0d0e0d" stroke="#555852" strokeWidth="5" />
        <ellipse cx="-88" cy="-8" rx="48" ry="108" fill="#222421" stroke="#686b64" strokeWidth="3" />
        <circle cx="93" cy="-40" r="11" fill="#c7d99f" />
        <circle cx="93" cy="-40" r="4" fill="#f4f1ea" />
        <circle cx="93" cy="20" r="7" fill="#5b5f58" />
      </g>
    </svg>
  );
}

export function ClipArt() {
  const uid = useId().replace(/[^\w-]/g, '');
  const bg = `clip-bg-${uid}`;
  const shellId = `clip-case-${uid}`;
  const shadow = `clip-shadow-${uid}`;
  return (
    <svg viewBox="0 0 640 520" role="img" aria-label="Concept illustration of the R3 Clip camera wearable">
      <defs>
        <radialGradient id={bg} cx="50%" cy="40%" r="75%">
          <stop offset="0" stopColor="#17332c" />
          <stop offset="1" stopColor="#09120f" />
        </radialGradient>
        <linearGradient id={shellId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#545852" />
          <stop offset=".38" stopColor="#121412" />
          <stop offset="1" stopColor="#2a2d29" />
        </linearGradient>
        <filter id={shadow} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="26" stdDeviation="22" floodColor="#000" floodOpacity=".58" />
        </filter>
      </defs>
      <rect width="640" height="520" fill={`url(#${bg})`} />
      <ellipse cx="320" cy="438" rx="176" ry="28" fill="#000" opacity=".38" />
      <g filter={`url(#${shadow})`}>
        <path d="M280 38h80l16 132H264z" fill="#151714" stroke="#4a4e47" strokeWidth="4" />
        <path d="M264 351h112l-16 132h-80z" fill="#151714" stroke="#4a4e47" strokeWidth="4" />
        <rect x="201" y="137" width="238" height="238" rx="54" transform="rotate(45 320 256)" fill={`url(#${shellId})`} stroke="#73786e" strokeWidth="5" />
        <rect x="223" y="159" width="194" height="194" rx="42" transform="rotate(45 320 256)" fill="#070807" stroke="#30342f" strokeWidth="4" />
        <path d="M253 260h34l17-38 30 72 18-34h35" fill="none" stroke="#f4f1ea" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="410" cy="163" r="19" fill="#090a09" stroke="#747a70" strokeWidth="4" />
        <circle cx="410" cy="163" r="8" fill="#c7d99f" />
        <circle cx="410" cy="163" r="3" fill="#fff" />
      </g>
    </svg>
  );
}
