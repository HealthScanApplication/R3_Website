-- Guardian Library: books, podcasts, academic papers and audio as first-class sources.
-- NOT APPLIED automatically: apply to staging first, then production.
--
-- * kind gains 'book', 'podcast', 'paper', 'audio'
-- * metadata jsonb holds kind-specific details (author, ISBN, show, episode,
--   authors, DOI, journal, year, original file name)
-- * the per-kind source rule keeps PDFs/URLs/transcripts as before; audio needs
--   an uploaded file or a URL; books, podcasts and papers only need a title
-- * the private guide-files bucket accepts audio uploads (still 50 MB max)

alter table public.guide_library_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.guide_library_items
  drop constraint if exists guide_library_items_kind_check;
alter table public.guide_library_items
  add constraint guide_library_items_kind_check
  check (kind in ('pdf', 'url', 'transcript', 'book', 'podcast', 'paper', 'audio'));

alter table public.guide_library_items
  drop constraint if exists guide_library_item_source;
alter table public.guide_library_items
  add constraint guide_library_item_source check (
    (kind = 'pdf' and file_path is not null) or
    (kind = 'url' and source_url is not null) or
    (kind = 'transcript' and transcript is not null) or
    (kind in ('book', 'podcast', 'paper')) or
    (kind = 'audio' and (file_path is not null or source_url is not null))
  );

alter table public.guide_library_items
  drop constraint if exists guide_library_items_metadata_object;
alter table public.guide_library_items
  add constraint guide_library_items_metadata_object check (jsonb_typeof(metadata) = 'object');

update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'application/epub+zip', 'application/zip',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'
]
where id = 'guide-files';
