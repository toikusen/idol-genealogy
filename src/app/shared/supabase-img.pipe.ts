import { Pipe, PipeTransform } from '@angular/core';

const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

@Pipe({ name: 'supabaseImg', standalone: true, pure: true })
export class SupabaseImgPipe implements PipeTransform {
  transform(url: string | null | undefined, width = 128, quality = 80): string | null | undefined {
    if (!url) return url;
    const idx = url.indexOf(OBJECT_PATH);
    if (idx === -1) return url;
    const params = new URLSearchParams({
      width: String(width),
      quality: String(quality),
      resize: 'contain',
    });
    return url.slice(0, idx) + RENDER_PATH + url.slice(idx + OBJECT_PATH.length) + `?${params.toString()}`;
  }
}
