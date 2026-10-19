import { describe, expect, it } from 'vitest';
import {
  buildLibraryDraft, filterLibraryItems, libraryErrorMessage, librarySourceDocumentPath, librarySourcePrompt, librarySourceSubtitle,
  librarySourceUrls, normalizeDoi, normalizeIsbn, type LibrarySourceLike,
} from '../guideLibrarySources';

const source = (overrides: Partial<LibrarySourceLike & { folder_id: string | null }>) => ({
  kind: 'url', title: 'Source', source_url: null, file_path: null, transcript: null, metadata: {}, folder_id: null, ...overrides,
}) as LibrarySourceLike & { folder_id: string | null };

describe('identifiers', () => {
  it('accepts ISBN-10 and ISBN-13 with separators and rejects bad checksums', () => {
    expect(normalizeIsbn('0-306-40615-2')).toBe('0306406152');
    expect(normalizeIsbn('ISBN 978-0-306-40615-7')).toBe('9780306406157');
    expect(normalizeIsbn('080442957x')).toBe('080442957X');
    expect(normalizeIsbn('978-0-306-40615-8')).toBeNull();
    expect(normalizeIsbn('12345')).toBeNull();
  });

  it('normalises DOIs from bare, prefixed and link forms', () => {
    expect(normalizeDoi('10.1038/nature12373')).toBe('10.1038/nature12373');
    expect(normalizeDoi('doi: 10.1038/nature12373')).toBe('10.1038/nature12373');
    expect(normalizeDoi('https://doi.org/10.1038/nature12373')).toBe('10.1038/nature12373');
    expect(normalizeDoi('nature12373')).toBeNull();
  });
});

describe('buildLibraryDraft', () => {
  it('builds a book with an Open Library link from its ISBN', () => {
    const draft = buildLibraryDraft('book', { title: ' Food Is Medicine ', fields: { author: 'A. Author', isbn: '978-0-306-40615-7' } });
    expect(draft).toEqual({ title: 'Food Is Medicine', source_url: 'https://openlibrary.org/isbn/9780306406157', file_path: null, transcript: null, metadata: { author: 'A. Author', isbn: '9780306406157' } });
    expect(buildLibraryDraft('book', { title: 'B', fields: { isbn: '9780306406157', link: 'https://publisher.com/b' } }).source_url).toBe('https://publisher.com/b');
    expect(() => buildLibraryDraft('book', { title: '', fields: {} })).toThrow('book title');
    expect(() => buildLibraryDraft('book', { title: 'B', fields: { isbn: '123' } })).toThrow('ISBN');
  });

  it('names a podcast from its show and episode when no title is given', () => {
    const draft = buildLibraryDraft('podcast', { title: '', fields: { show: 'Gut Talk', episode: 'Ep. 12', url: 'https://pod.example/12' }, notes: ' transcript ' });
    expect(draft.title).toBe('Gut Talk — Episode 12');
    expect(draft.source_url).toBe('https://pod.example/12');
    expect(draft.transcript).toBe('transcript');
    expect(draft.metadata).toEqual({ show: 'Gut Talk', episode: 'Ep. 12' });
    expect(() => buildLibraryDraft('podcast', { title: 'Only title', fields: {} })).toThrow('show name');
    expect(() => buildLibraryDraft('podcast', { title: '', fields: { url: 'ftp://x' } })).toThrow('https://');
  });

  it('builds a paper with a doi.org link, validated year and optional PDF', () => {
    const draft = buildLibraryDraft('paper', { title: 'Magnesium and sleep', fields: { authors: 'Smith J', doi: 'doi:10.1000/xyz123', journal: 'Sleep', year: '2021' }, file: { path: 'u/library-1.pdf', name: 'mg.pdf' } }, 2026);
    expect(draft.source_url).toBe('https://doi.org/10.1000/xyz123');
    expect(draft.file_path).toBe('u/library-1.pdf');
    expect(draft.metadata).toEqual({ authors: 'Smith J', doi: '10.1000/xyz123', journal: 'Sleep', year: 2021, file_name: 'mg.pdf' });
    expect(() => buildLibraryDraft('paper', { title: 'P', fields: { year: '3000' } }, 2026)).toThrow('year');
    expect(() => buildLibraryDraft('paper', { title: 'P', fields: { doi: 'abc' } })).toThrow('DOI');
  });

  it('requires an audio file or URL and titles it from either', () => {
    expect(buildLibraryDraft('audio', { title: '', fields: {}, file: { path: 'u/library-2.m4a', name: 'Morning talk.m4a' } })).toMatchObject({ title: 'Morning talk', file_path: 'u/library-2.m4a', source_url: null, metadata: { file_name: 'Morning talk.m4a' } });
    expect(buildLibraryDraft('audio', { title: '', fields: { url: 'https://cdn.example/lectures/fasting-101.mp3' } }).title).toBe('fasting-101');
    expect(() => buildLibraryDraft('audio', { title: 'A', fields: {} })).toThrow('audio file');
  });
});

describe('builder hand-off', () => {
  const book = source({ kind: 'book', title: 'Food Is Medicine', source_url: 'https://openlibrary.org/isbn/9780306406157', metadata: { author: 'A. Author', isbn: '9780306406157' } });
  const paper = source({ kind: 'paper', title: 'Magnesium and sleep', source_url: 'https://doi.org/10.1000/xyz123', file_path: 'u/p.pdf', transcript: 'Abstract text', metadata: { authors: 'Smith J', year: 2021, journal: 'Sleep', doi: '10.1000/xyz123' } });
  const podcast = source({ kind: 'podcast', title: 'Fibre', source_url: 'https://pod.example/12', transcript: 'x'.repeat(50), metadata: { show: 'Gut Talk', episode: '12' } });
  const audio = source({ kind: 'audio', title: 'Talk', file_path: 'u/a.m4a', metadata: { file_name: 'a.m4a' } });

  it('describes each source with its metadata and a capped excerpt', () => {
    expect(librarySourcePrompt(book)).toBe('- Book: "Food Is Medicine" by A. Author (ISBN 9780306406157) — https://openlibrary.org/isbn/9780306406157');
    expect(librarySourcePrompt(paper)).toBe('- Research paper: Smith J (2021). "Magnesium and sleep". Sleep. doi:10.1000/xyz123 — https://doi.org/10.1000/xyz123 (PDF u/p.pdf)\n  Abstract text');
    expect(librarySourcePrompt(podcast, 10)).toBe(`- Podcast: Gut Talk, episode 12 — "Fibre" — https://pod.example/12\n  ${'x'.repeat(10)}`);
    expect(librarySourcePrompt(audio)).toBe('- Audio: Talk (uploaded audio u/a.m4a)');
    expect(librarySourcePrompt(source({ kind: 'transcript', title: 'T', transcript: 'hello world' }))).toBe('- Transcript: T\n  hello world');
  });

  it('collects fetchable URLs and the first readable document', () => {
    const page = source({ kind: 'url', source_url: 'https://pod.example/12' });
    expect(librarySourceUrls([book, paper, podcast, audio, page])).toEqual(['https://openlibrary.org/isbn/9780306406157', 'https://doi.org/10.1000/xyz123', 'https://pod.example/12']);
    expect(librarySourceDocumentPath([audio, paper])).toBe('u/p.pdf');
    expect(librarySourceDocumentPath([paper, source({ kind: 'pdf', file_path: 'u/doc.pdf' })])).toBe('u/doc.pdf');
    expect(librarySourceDocumentPath([book, audio])).toBeNull();
  });

  it('summarises sources for the list view', () => {
    expect(librarySourceSubtitle(book)).toBe('A. Author · ISBN 9780306406157');
    expect(librarySourceSubtitle(paper)).toBe('Smith J · Sleep · 2021');
    expect(librarySourceSubtitle(podcast)).toBe('Gut Talk · Ep. 12');
    expect(librarySourceSubtitle(audio)).toBe('Private audio · a.m4a');
  });
});

describe('Library filters and errors', () => {
  it('filters by folder and type together', () => {
    const items = [source({ kind: 'book', folder_id: 'a' }), source({ kind: 'paper', folder_id: 'a' }), source({ kind: 'book', folder_id: null })];
    expect(filterLibraryItems(items, 'all', 'book')).toHaveLength(2);
    expect(filterLibraryItems(items, 'a', 'book')).toHaveLength(1);
    expect(filterLibraryItems(items, 'unfiled', 'all')).toHaveLength(1);
  });

  it('explains a missing migration for the new kinds only', () => {
    expect(libraryErrorMessage({ code: '23514', message: 'violates check constraint' }, 'podcast')).toContain('Podcasts need the latest Library database update');
    expect(libraryErrorMessage({ code: 'PGRST204', message: "Could not find the 'metadata' column" }, 'book')).toContain('Books need');
    expect(libraryErrorMessage({ message: 'boom' }, 'url')).toBe('boom');
  });
});
