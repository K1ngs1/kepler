-- ─── 004: Card Photos — optional user-uploaded photos for collection cards ───

-- Add photo_url column to user_cards
alter table public.user_cards
  add column if not exists photo_url text;

-- ─── Storage bucket for card photos ───
-- Run this in Supabase Dashboard > Storage > Create Bucket:
--   Name: card-photos
--   Public: true
--   File size limit: 512KB
--   Allowed MIME types: image/jpeg, image/png, image/webp
--
-- Then apply these RLS policies on the storage.objects table:
--
-- Policy: "Anyone can view card photos"
--   Operation: SELECT
--   USING: bucket_id = 'card-photos'
--
-- Policy: "Users can upload their own card photos"
--   Operation: INSERT
--   WITH CHECK: bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text
--
-- Policy: "Users can update their own card photos"
--   Operation: UPDATE
--   USING: bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text
--
-- Policy: "Users can delete their own card photos"
--   Operation: DELETE
--   USING: bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text
