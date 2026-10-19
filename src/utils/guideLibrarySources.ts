// Pure helpers for Guardian Library sources: per-kind fields, validation, display
// lines and the text/URLs handed to the AI Protocol and Offer builders.

export type GuideLibraryKind = 'pdf' | 'url' | 'transcript' | 'book' | 'podcast' | 'paper' | 'audio';

/** Kind-specific details stored in guide_library_items.metadata. */
export interface GuideLibraryMetadata {
  author?: string;
  isbn?: string;
  show?: string;
  episode?: string;
  authors?: string;
  doi?: string;
  journal?: string;
  year?: number;
  file_name?: string;
}

export interface LibrarySourceLike {
  kind: GuideLibraryKind;
  title: string;
  source_url: string | null;
  file_path: string | null;
  transcript: string | null;
  metadata?: GuideLibraryMetadata | null;
}

export interface LibraryField {
  key: 'author' | 'isbn' | 'link' | 'show' | 'episode' | 'url' | 'authors' | 'doi' | 'journal' | 'year';
  label: string;
  placeholder: string;
  inputMode?: 'url' | 'numeric' | 'text';
}

export interface LibraryKindDefinition {
  kind: GuideLibraryKind;
  label: string;
  plural: string;
  addLabel: string;
  titleLabel: string;
  titlePlaceholder: string;
  fields: LibraryField[];
  /** File the Guardian may attach; audio needs a file or a URL, a paper's PDF is optional. */
  file?: { accept: string; label: string; required: boolean };
  /** Optional pasted transcript or notes, used as AI context. */
  notes?: string;
}

export const LIBRARY_KINDS: LibraryKindDefinition[] = [
  { kind: 'pdf', label: 'PDF', plural: 'PDFs', addLabel: 'Upload PDF', titleLabel: 'Source title', titlePlaceholder: 'Give this source a clear name', fields: [] },
  { kind: 'url', label: 'Webpage', plural: 'Webpages', addLabel: 'Save URL', titleLabel: 'Source title', titlePlaceholder: 'Give this source a clear name', fields: [] },
  { kind: 'transcript', label: 'Transcript', plural: 'Transcripts', addLabel: 'Add transcript', titleLabel: 'Source title', titlePlaceholder: 'Give this source a clear name', fields: [] },
  {
    kind: 'book', label: 'Book', plural: 'Books', addLabel: 'Add book', titleLabel: 'Book title', titlePlaceholder: 'The Book Title',
    fields: [
      { key: 'author', label: 'Author', placeholder: 'Author name' },
      { key: 'isbn', label: 'ISBN', placeholder: '978-0-00-000000-0' },
      { key: 'link', label: 'Link', placeholder: 'https://publisher.com/book', inputMode: 'url' },
    ],
    notes: 'Key passages or notes',
  },
  {
    kind: 'podcast', label: 'Podcast', plural: 'Podcasts', addLabel: 'Add podcast', titleLabel: 'Episode title', titlePlaceholder: 'Episode title',
    fields: [
      { key: 'show', label: 'Show', placeholder: 'Podcast name' },
      { key: 'episode', label: 'Episode', placeholder: 'e.g. 112' },
      { key: 'url', label: 'Episode URL', placeholder: 'https://podcasts.apple.com/…', inputMode: 'url' },
    ],
    notes: 'Transcript or show notes',
  },
  {
    kind: 'paper', label: 'Paper', plural: 'Papers', addLabel: 'Add paper', titleLabel: 'Paper title', titlePlaceholder: 'Full paper title',
    fields: [
      { key: 'authors', label: 'Authors', placeholder: 'Smith J, Lee K' },
      { key: 'doi', label: 'DOI', placeholder: '10.1000/xyz123' },
      { key: 'url', label: 'URL', placeholder: 'https://pubmed.ncbi.nlm.nih.gov/…', inputMode: 'url' },
      { key: 'journal', label: 'Journal', placeholder: 'Journal name' },
      { key: 'year', label: 'Year', placeholder: '2024', inputMode: 'numeric' },
    ],
    file: { accept: 'application/pdf,.pdf', label: 'Attach paper PDF (optional)', required: false },
    notes: 'Abstract or key findings',
  },
  {
    kind: 'audio', label: 'Audio', plural: 'Audio', addLabel: 'Add audio', titleLabel: 'Audio title', titlePlaceholder: 'Lecture, voice memo, talk…',
    fields: [{ key: 'url', label: 'Audio URL', placeholder: 'https://example.com/talk.mp3', inputMode: 'url' }],
    file: { accept: 'audio/*,.mp3,.m4a,.wav,.aac,.ogg,.webm', label: 'Choose audio file', required: false },
    notes: 'Transcript',
  },
];

export const NEW_LIBRARY_KINDS: GuideLibraryKind[] = ['book', 'podcast', 'paper', 'audio'];

/** Audio types the guide-files bucket accepts once the library migration is applied. */
export const LIBRARY_AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'];

export function libraryKindDefinition(kind: GuideLibraryKind): LibraryKindDefinition {
  return LIBRARY_KINDS.find((entry) => entry.kind === kind) || LIBRARY_KINDS[0];
}

/** Strips separators and checks the ISBN-10 or ISBN-13 checksum. Returns null when invalid. */
export function normalizeIsbn(value: string): string | null {
  const raw = value.replace(/^isbn(?:-1[03])?:?\s*/i, '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(raw)) {
    const sum = raw.split('').reduce((total, char, index) => total + (char === 'X' ? 10 : Number(char)) * (10 - index), 0);
    return sum % 11 === 0 ? raw : null;
  }
  if (/^\d{13}$/.test(raw)) {
    const sum = raw.split('').reduce((total, char, index) => total + Number(char) * (index % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? raw : null;
  }
  return null;
}

/** Accepts bare DOIs, doi: prefixes and doi.org links. Returns null when it is not a DOI. */
export function normalizeDoi(value: string): string | null {
  const raw = value.trim().replace(/^doi:\s*/i, '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  return /^10\.\d{4,9}\/\S+$/.test(raw) ? raw : null;
}

function cleanUrl(value: string | undefined, field: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { throw new Error(`Enter a complete ${field}, including https://.`); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error(`Enter a complete ${field}, including https://.`);
  return parsed.toString();
}

function compact(metadata: GuideLibraryMetadata): GuideLibraryMetadata {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== '')) as GuideLibraryMetadata;
}

export interface LibraryDraftInput {
  title: string;
  fields: Partial<Record<LibraryField['key'], string>>;
  notes?: string;
  /** Storage path of an already uploaded file, with its original name. */
  file?: { path: string; name: string } | null;
}

export interface LibraryDraft {
  title: string;
  source_url: string | null;
  file_path: string | null;
  transcript: string | null;
  metadata: GuideLibraryMetadata;
}

/** Validates the form for a book, podcast, paper or audio source and shapes the row to insert. */
export function buildLibraryDraft(kind: 'book' | 'podcast' | 'paper' | 'audio', input: LibraryDraftInput, currentYear = new Date().getFullYear()): LibraryDraft {
  const field = (key: LibraryField['key']) => input.fields[key]?.trim() || '';
  const notes = input.notes?.trim() || null;
  let title = input.title.trim();

  if (kind === 'book') {
    if (!title) throw new Error('Add the book title.');
    const isbnInput = field('isbn');
    const isbn = isbnInput ? normalizeIsbn(isbnInput) : null;
    if (isbnInput && !isbn) throw new Error('That ISBN does not look right. Check the 10 or 13 digits.');
    const link = cleanUrl(field('link'), 'book link') || (isbn ? `https://openlibrary.org/isbn/${isbn}` : null);
    return { title, source_url: link, file_path: null, transcript: notes, metadata: compact({ author: field('author') || undefined, isbn: isbn || undefined }) };
  }

  if (kind === 'podcast') {
    const show = field('show');
    const episode = field('episode');
    const url = cleanUrl(field('url'), 'episode URL');
    if (!show && !url) throw new Error('Add the show name or the episode URL.');
    title ||= [show, episode && `Episode ${episode.replace(/^(?:ep(?:isode)?\.?\s*)/i, '')}`].filter(Boolean).join(' — ') || new URL(url!).hostname.replace(/^www\./, '');
    return { title, source_url: url, file_path: null, transcript: notes, metadata: compact({ show: show || undefined, episode: episode || undefined }) };
  }

  if (kind === 'paper') {
    if (!title) throw new Error('Add the paper title.');
    const doiInput = field('doi');
    const doi = doiInput ? normalizeDoi(doiInput) : null;
    if (doiInput && !doi) throw new Error('A DOI starts with 10. followed by a slash, e.g. 10.1000/xyz123.');
    const yearInput = field('year');
    const year = yearInput ? Number(yearInput) : undefined;
    if (yearInput && (!Number.isInteger(year) || year! < 1600 || year! > currentYear + 1)) throw new Error('Enter the publication year as four digits.');
    const url = cleanUrl(field('url'), 'paper URL') || (doi ? `https://doi.org/${doi}` : null);
    return {
      title, source_url: url, file_path: input.file?.path || null, transcript: notes,
      metadata: compact({ authors: field('authors') || undefined, doi: doi || undefined, journal: field('journal') || undefined, year, file_name: input.file?.name }),
    };
  }

  const url = cleanUrl(field('url'), 'audio URL');
  if (!url && !input.file) throw new Error('Choose an audio file or add an audio URL.');
  title ||= input.file ? input.file.name.replace(/\.[a-z0-9]+$/i, '') : new URL(url!).pathname.split('/').filter(Boolean).pop()?.replace(/\.[a-z0-9]+$/i, '') || new URL(url!).hostname;
  return { title, source_url: url, file_path: input.file?.path || null, transcript: notes, metadata: compact({ file_name: input.file?.name }) };
}

function wordCount(text: string | null): number {
  return text?.split(/\s+/).filter(Boolean).length || 0;
}

/** The small grey line under a source title in the Library list. */
export function librarySourceSubtitle(item: LibrarySourceLike): string {
  const meta = item.metadata || {};
  switch (item.kind) {
    case 'url': return item.source_url || '';
    case 'transcript': return `${wordCount(item.transcript)} words`;
    case 'pdf': return 'Private PDF';
    case 'book': return [meta.author, meta.isbn && `ISBN ${meta.isbn}`].filter(Boolean).join(' · ') || item.source_url || 'Book';
    case 'podcast': return [meta.show, meta.episode && `Ep. ${meta.episode}`].filter(Boolean).join(' · ') || item.source_url || 'Podcast';
    case 'paper': return [meta.authors, meta.journal, meta.year].filter(Boolean).join(' · ') || (meta.doi ? `doi:${meta.doi}` : item.source_url || 'Paper');
    case 'audio': return item.file_path ? `Private audio${meta.file_name ? ` · ${meta.file_name}` : ''}` : item.source_url || 'Audio';
  }
}

/** One bullet describing a source for the AI builders, with a capped excerpt of any text body. */
export function librarySourcePrompt(item: LibrarySourceLike, excerptChars = 1500): string {
  const meta = item.metadata || {};
  const excerpt = item.transcript?.trim() ? `\n  ${item.transcript.trim().slice(0, excerptChars)}` : '';
  const link = item.source_url ? ` — ${item.source_url}` : '';
  switch (item.kind) {
    case 'url': return `- Webpage: ${item.title}${link}`;
    case 'transcript': return `- Transcript: ${item.title}${excerpt}`;
    case 'pdf': return `- PDF: ${item.title} (uploaded file ${item.file_path})`;
    case 'book': return `- Book: "${item.title}"${meta.author ? ` by ${meta.author}` : ''}${meta.isbn ? ` (ISBN ${meta.isbn})` : ''}${link}${excerpt}`;
    case 'podcast': return `- Podcast: ${[meta.show, meta.episode && `episode ${meta.episode}`].filter(Boolean).join(', ') || 'episode'} — "${item.title}"${link}${excerpt}`;
    case 'paper': {
      const citation = [meta.authors, meta.year && `(${meta.year})`].filter(Boolean).join(' ');
      return `- Research paper: ${citation ? `${citation}. ` : ''}"${item.title}"${meta.journal ? `. ${meta.journal}` : ''}${meta.doi ? `. doi:${meta.doi}` : ''}${link}${item.file_path ? ` (PDF ${item.file_path})` : ''}${excerpt}`;
    }
    case 'audio': return `- Audio: ${item.title}${link}${item.file_path ? ` (uploaded audio ${item.file_path})` : ''}${excerpt}`;
  }
}

/** Web addresses the builders can fetch, deduplicated and in Library order. */
export function librarySourceUrls(items: LibrarySourceLike[]): string[] {
  return [...new Set(items.map((item) => item.source_url).filter((url): url is string => !!url && /^https?:\/\//.test(url)))];
}

/** The first uploaded document the builders can read: a PDF, then a paper's attached PDF. */
export function librarySourceDocumentPath(items: LibrarySourceLike[]): string | null {
  return items.find((item) => item.kind === 'pdf' && item.file_path)?.file_path
    || items.find((item) => item.kind === 'paper' && item.file_path)?.file_path
    || null;
}

export function filterLibraryItems<T extends LibrarySourceLike & { folder_id: string | null }>(items: T[], folder: string, kind: GuideLibraryKind | 'all'): T[] {
  return items.filter((item) => (folder === 'all' || (folder === 'unfiled' ? !item.folder_id : item.folder_id === folder)) && (kind === 'all' || item.kind === kind));
}

/** Friendlier copy when the database has not been migrated for the new kinds yet. */
export function libraryErrorMessage(error: { code?: string; message?: string } | null | undefined, kind: GuideLibraryKind): string {
  const message = error?.message || '';
  if (NEW_LIBRARY_KINDS.includes(kind) && (error?.code === '23514' || error?.code === 'PGRST204' || /metadata|check constraint|mime type/i.test(message))) {
    return `${libraryKindDefinition(kind).plural} need the latest Library database update. Ask an admin to apply it, then try again.`;
  }
  return message || 'Could not save this source.';
}
