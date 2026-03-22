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
      const json = await res.json();
      if (json.photo_url) return { photo_url: json.photo_url };
      return { error: json.hint ?? json.error ?? '抓取失敗' };
    } catch (e: any) {
      return { error: e.message || '網路錯誤' };
    }
  }
}
