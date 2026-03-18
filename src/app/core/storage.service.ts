import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(['image/jpeg', 'image/png']);

@Injectable({ providedIn: 'root' })
export class StorageService {
  constructor(private supabase: SupabaseService) {}

  /** 上傳已裁切的 blob（跳過格式/大小驗證，由 component 負責） */
  async uploadCropped(
    blob: Blob,
    folder: 'members' | 'groups' | 'companies'
  ): Promise<string> {
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const path = `${folder}/${filename}`;
    const file = new File([blob], filename, { type: 'image/jpeg' });
    const { error } = await this.supabase.client.storage
      .from('member-photos')
      .upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    const { data } = this.supabase.client.storage
      .from('member-photos')
      .getPublicUrl(path);
    return data.publicUrl;
  }

  async uploadPhoto(
    file: File,
    folder: 'members' | 'groups' | 'companies'
  ): Promise<string> {
    if (file.size > MAX_SIZE) throw new Error('檔案大小不能超過 5MB');
    if (!ALLOWED.has(file.type)) throw new Error('僅支援 JPG、PNG 格式');

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await this.supabase.client.storage
      .from('member-photos')
      .upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);

    const { data } = this.supabase.client.storage
      .from('member-photos')
      .getPublicUrl(path);
    return data.publicUrl;
  }
}
