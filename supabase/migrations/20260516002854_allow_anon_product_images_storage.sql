/*
  # Allow anonymous upload and read on product-images bucket

  1. Security Changes
    - Add INSERT policy for anon role on storage.objects for product-images bucket
    - Add SELECT policy for anon role on storage.objects for product-images bucket

  2. Notes
    - The bucket is already public (created previously)
    - These policies mirror the existing rfq-files policies
*/

CREATE POLICY "Allow anon upload to product-images"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Allow public read on product-images"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'product-images');
