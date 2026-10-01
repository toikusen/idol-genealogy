import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface IgPhotoResult {
  photo_url?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class IgPhotoService {
  extractUsername(igUrl: string): string | null {
    const match = igUrl.match(/instagram\.com\/([^/?#\s]+)/);
    return match?.[1] ?? null;
  }

  async fetchPhotoUrl(igUrl: string): Promise<IgPhotoResult> {
    const username = this.extractUsername(igUrl);
    if (!username) return { error: '無法解析 Instagram 帳號' };
    try {
      const res = await fetch(
        `${environment.supabaseUrl}/functions/v1/ig-photo?username=${encodeURIComponent(username)}`
      );
      const json = await res.json().catch(() => ({}));
      if (json.photo_url) return { photo_url: json.photo_url };
      return { error: describeIgError(res.status, json.error) };
    } catch (e: any) {
      return { error: e.message || '網路錯誤' };
    }
  }
}

/** Turns the edge function's error into something an editor can act on. */
export function describeIgError(status: number, error: string | undefined): string {
  if (error === 'blocked' || status === 403) return 'Instagram 暫時擋住了自動抓取，請稍後再試，或手動上傳照片';
  if (error?.startsWith('Image download failed: unsupported image type')) return 'Instagram 回傳的圖片格式不支援，請手動上傳照片';
  if (error?.startsWith('Image download failed')) return '下載 Instagram 大頭貼失敗，請稍後再試';
  if (error?.startsWith('Upload failed')) return `照片存檔失敗：${error.replace('Upload failed: ', '')}`;
  if (status === 404) return '找不到抓取功能，請確認 ig-photo 已部署';
  return error ?? `抓取失敗（${status}）`;
}
