-- Create public storage bucket for member photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-photos', 'member-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read (public bucket)
CREATE POLICY "Public read member-photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'member-photos');

-- Allow authenticated users to upload/update
CREATE POLICY "Auth upload member-photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'member-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Auth update member-photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'member-photos' AND auth.role() = 'authenticated');
