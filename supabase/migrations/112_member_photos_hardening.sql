-- Migration 112: harden the member-photos bucket.
--
-- * Only raster images, ≤ 5 MB: the bucket accepted any content type, so a
--   signed-in user could upload an SVG / HTML file. The app only ever uploads
--   JPEG (cropped) or JPEG/PNG (storage.service.ts); the ig-photo edge
--   function stores whatever raster type Instagram's CDN returns (JPEG/WebP),
--   so the common raster types all stay allowed.
-- * Drop the UPDATE policy: any signed-in user could overwrite any existing
--   photo. The app uploads new files only (upsert: false) and never updates
--   objects (ig-photo's upsert uses the service role, which bypasses RLS),
--   so nothing legitimate relies on it.
-- Guarded so it also runs on databases without the storage schema.

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
       set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
           file_size_limit    = 5 * 1024 * 1024
     where id = 'member-photos';
  end if;

  if to_regclass('storage.objects') is not null then
    drop policy if exists "Auth update member-photos" on storage.objects;
  end if;
end $$;
