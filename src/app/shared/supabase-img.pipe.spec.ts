import { SupabaseImgPipe } from './supabase-img.pipe';

describe('SupabaseImgPipe', () => {
  const pipe = new SupabaseImgPipe();

  it('uses contain resizing to preserve the original image framing', () => {
    const result = pipe.transform(
      'https://example.supabase.co/storage/v1/object/public/member-photos/alice.jpg',
      80,
      70
    );

    expect(result).toBe(
      'https://example.supabase.co/storage/v1/render/image/public/member-photos/alice.jpg?width=80&quality=70&resize=contain'
    );
  });

  it('leaves non-Supabase storage URLs unchanged', () => {
    const url = 'https://cdn.example.com/alice.jpg';

    expect(pipe.transform(url, 80)).toBe(url);
  });

  it('passes through empty image values', () => {
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeUndefined();
  });
});
