import MaterialView, { type MaterialPersistence, type MaterialItem } from '@presentation/views/MaterialView';
import { fileStorage } from '@data/storage';
import { supabase } from '@data/supabase';
import { useSelectedSemester } from '@presentation/hooks';
import type { UploadPolicy, FileCategory } from '@domain/services/storageRouter';

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
    const sem = localStorage.getItem('mis_selected_semester') || 'Semester 5';
    const result = await fileStorage.uploadFile({
      category: `study-material-${sem}` as FileCategory,
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
    const sem = localStorage.getItem('mis_selected_semester') || 'Semester 5';
    const categories = [`study-material-${sem}`];
    
    // For backward compatibility, Semester 5 also loads the old legacy 'study-material' category files
    if (sem === 'Semester 5') {
      categories.push('study-material');
    }

    const { data } = await supabase
      .from('files')
      .select('id, file_name, mime_type, size_bytes, url_or_path, created_at')
      .in('category', categories)
      .order('created_at', { ascending: false });
    if (!data) return [];
    return data.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      fileName: row.file_name as string,
      mimeType: row.mime_type as string,
      sizeBytes: row.size_bytes as number,
      url: row.url_or_path as string,
      createdAt: row.created_at as string,
    }));
  },
};

export default function MaterialPage() {
  const semester = useSelectedSemester();

  return <MaterialView key={semester} persistence={persistence} />;
}
