import { describe, expect, it } from 'vitest';
import { originalImageUrl, profileLogoCandidates } from '../../../supabase/functions/make-server-ed0fe4c2/profile-logos';

const page = new URL('https://www.example.com/');

describe('originalImageUrl', () => {
  it('takes the size off a Wix image so the original is fetched', () => {
    expect(originalImageUrl('https://static.wixstatic.com/media/2fb2a3_051ef~mv2.png/v1/fill/w_32%2Ch_32%2Clg_1/2fb2a3_051ef~mv2.png', page)).toBe('https://static.wixstatic.com/media/2fb2a3_051ef~mv2.png');
  });
  it('takes the thumbnail size and crop off a Shopify image, and resolves protocol-relative links to https', () => {
    expect(originalImageUrl('//www.example.com/cdn/shop/files/Logo.png?crop=center&height=32&v=17&width=32', page)).toBe('https://www.example.com/cdn/shop/files/Logo.png?v=17');
  });
  it('refuses anything that is not a web image link', () => {
    expect(originalImageUrl('data:image/png;base64,AAAA', page)).toBe('');
    expect(originalImageUrl('javascript:alert(1)', page)).toBe('');
  });
});

describe('profileLogoCandidates', () => {
  it('puts the structured-data logo first, then logo-named images, then touch icons, then tab icons', () => {
    const html = `<html><head>
      <link rel="icon" sizes="32x32" href="/favicon-32.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/touch-180.png">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","logo":{"@type":"ImageObject","url":"https://cdn.example.com/org-logo.png"}}]}</script>
      </head><body><img class="header__logo" src="/img/brand.png"><img src="/hero.jpg" alt="A hero"></body></html>`;
    expect(profileLogoCandidates(html, page)).toEqual([
      'https://cdn.example.com/org-logo.png',
      'https://www.example.com/img/brand.png',
      'https://www.example.com/touch-180.png',
      'https://www.example.com/favicon-32.png',
    ]);
  });
  it('lists a repeated image once, ignores inline data images, and survives broken structured data', () => {
    const html = `<script type="application/ld+json">{not json</script>
      <img alt="logo" src="data:image/png;base64,AAAA"><img alt="Site logo" src="/a.png"><img alt="logo" src="/a.png">
      <link rel="icon" href="/a.png">`;
    expect(profileLogoCandidates(html, page)).toEqual(['https://www.example.com/a.png']);
  });
  it('returns nothing for a page with no logo', () => {
    expect(profileLogoCandidates('<html><body><p>Hello</p></body></html>', page)).toEqual([]);
  });
});
