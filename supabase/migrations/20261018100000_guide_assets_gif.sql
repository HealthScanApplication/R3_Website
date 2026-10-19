-- Animated GIF backgrounds and logos for Guardian brand kits. Idempotent: adds image/gif only when missing.
-- Applied to Staging on 2026-10-18. Production has no Guardian schema yet; this runs with the Guardian migrations there.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'image/gif')
where id = 'guide-assets'
  and not ('image/gif' = any(allowed_mime_types));
