import { IgPhotoService, describeIgError } from './ig-photo.service';

describe('IgPhotoService', () => {
  const service = new IgPhotoService();

  it('reads the username from a profile URL', () => {
    expect(service.extractUsername('https://www.instagram.com/some.idol_01/?hl=ja')).toBe('some.idol_01');
    expect(service.extractUsername('not a url')).toBeNull();
  });

  it('returns the photo URL, or an error an editor can act on', async () => {
    spyOn(window, 'fetch').and.returnValues(
      Promise.resolve(new Response(JSON.stringify({ photo_url: 'https://x/ig/a.jpg' }))),
      Promise.resolve(new Response(JSON.stringify({ error: 'blocked' }), { status: 403 })),
    );
    expect(await service.fetchPhotoUrl('https://instagram.com/a')).toEqual({ photo_url: 'https://x/ig/a.jpg' });
    expect((await service.fetchPhotoUrl('https://instagram.com/a')).error).toContain('Instagram 暫時擋住');
  });

  it('describes each failure', () => {
    expect(describeIgError(502, 'Image download failed: unsupported image type image/heic')).toContain('格式不支援');
    expect(describeIgError(502, 'Image download failed: 500')).toContain('下載 Instagram 大頭貼失敗');
    expect(describeIgError(500, 'Upload failed: mime type not supported')).toBe('照片存檔失敗：mime type not supported');
    expect(describeIgError(404, undefined)).toContain('ig-photo');
  });
});
