/**
 * Connected page wrapper for MaterialView.
 * Wires Supabase-backed file storage as the MaterialPersistence.
 */

import MaterialView, { type MaterialPersistence, type MaterialItem } from '@presentation/views/MaterialView';
import { fileStorage } from '@data/storage';
import { supabase } from '@data/supabase';
import type { UploadPolicy } from '@domain/services/storageRouter';

const STUDY_MATERIAL_POLICY: UploadPolicy = {
  allowedTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  maxSizeBytes: 25 * 1024 * 1024, // 25 MB
};

const persistence: MaterialPersistence = {
  async uploadMaterial(file: File): Promise<MaterialItem> {
    const result = await fileStorage.uploadFile({
      category: 'study-material',
      data: file,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      policy: STUDY_MATERIAL_POLICY,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return {
      id: result.value.fileId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      url: result.value.url,
      createdAt: new Date().toISOString(),
    };
  },

  async loadMaterials(): Promise<MaterialItem[]> {
    const { data } = await supabase
      .from('files')
      .select('id, file_name, mime_type, size_bytes, url, created_at')
      .eq('category', 'study-material')
      .order('created_at', { ascending: false });
    if (!data) return [];
    return data.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      fileName: row.file_name as string,
      mimeType: row.mime_type as string,
      sizeBytes: row.size_bytes as number,
      url: row.url as string,
      createdAt: row.created_at as string,
    }));
  },
};

export default function MaterialPage() {
  return <MaterialView persistence={persistence} />;
}
