-- Create storage policies for vto-images bucket
-- Allow anyone to upload files (for kiosk users without auth)
CREATE POLICY "Allow public uploads to vto-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vto-images');

-- Allow anyone to read files from vto-images (for signed URLs to work)
CREATE POLICY "Allow public read from vto-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'vto-images');

-- Allow updates (for upsert functionality)
CREATE POLICY "Allow public update to vto-images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vto-images');