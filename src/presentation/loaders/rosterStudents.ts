import { isLocalDemoMode, listDemoRoster } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import type { Section } from '@data/access/rows';
import { formatSectionLabel } from '@presentation/format/sectionLabel';

export interface LoadedRosterStudent {
  readonly id: string;
  readonly name: string;
  readonly enrollmentNumber?: string;
  readonly sectionId?: string;
  readonly sectionLabel?: string;
  readonly sectionName?: string;
}

type SectionLike = Pick<Section, 'id' | 'name' | 'batch' | 'semester' | 'department'>;

interface StudentRow {
  readonly id: string;
  readonly name: string;
  readonly enrollment_number?: string | null;
  readonly section_id?: string | null;
}

function bySectionThenStudent(a: LoadedRosterStudent, b: LoadedRosterStudent): number {
  const sectionCompare = (a.sectionLabel ?? '').localeCompare(b.sectionLabel ?? '');
  if (sectionCompare !== 0) {
    return sectionCompare;
  }
  const enrollmentCompare = (a.enrollmentNumber ?? '').localeCompare(b.enrollmentNumber ?? '');
  if (enrollmentCompare !== 0) {
    return enrollmentCompare;
  }
  return a.name.localeCompare(b.name);
}

function mapImportedRoster(section: SectionLike): LoadedRosterStudent[] {
  const sectionLabel = formatSectionLabel(section);
  return listDemoRoster(section.id).map((student) => ({
    id: student.id,
    name: student.name,
    enrollmentNumber: student.enrollmentNumber,
    sectionId: section.id,
    sectionLabel,
    sectionName: sectionLabel,
  }));
}

async function loadSupabaseStudents(
  sectionIds: readonly string[],
  sectionById: ReadonlyMap<string, SectionLike>,
): Promise<LoadedRosterStudent[]> {
  if (sectionIds.length === 0) {
    return [];
  }

  let query = supabase
    .from('students')
    .select('id, name, enrollment_number, section_id')
    .order('name');

  query = sectionIds.length === 1 ? query.eq('section_id', sectionIds[0]) : query.in('section_id', sectionIds);

  const { data } = await query;
  return ((data ?? []) as StudentRow[]).map((row) => {
    const section = row.section_id ? sectionById.get(row.section_id) : undefined;
    const sectionLabel = section ? formatSectionLabel(section) : undefined;
    return {
      id: row.id,
      name: row.name,
      enrollmentNumber: row.enrollment_number ?? undefined,
      sectionId: row.section_id ?? undefined,
      sectionLabel,
      sectionName: sectionLabel,
    };
  });
}

export async function loadRosterStudentsForSection(
  section: SectionLike,
): Promise<LoadedRosterStudent[]> {
  if (isLocalDemoMode()) {
    const imported = mapImportedRoster(section);
    if (imported.length > 0) {
      return imported;
    }
  }

  return loadSupabaseStudents([section.id], new Map([[section.id, section]]));
}

export async function loadRosterStudentsForSections(
  sections: readonly SectionLike[],
): Promise<LoadedRosterStudent[]> {
  if (sections.length === 0) {
    return [];
  }

  const sectionById = new Map(sections.map((section) => [section.id, section] as const));
  const importedSectionIds = new Set<string>();
  const importedStudents: LoadedRosterStudent[] = [];

  if (isLocalDemoMode()) {
    for (const section of sections) {
      const imported = mapImportedRoster(section);
      if (imported.length > 0) {
        importedSectionIds.add(section.id);
        importedStudents.push(...imported);
      }
    }
  }

  const remainingSectionIds = sections
    .map((section) => section.id)
    .filter((sectionId) => !importedSectionIds.has(sectionId));
  const supabaseStudents = await loadSupabaseStudents(remainingSectionIds, sectionById);

  return [...importedStudents, ...supabaseStudents].sort(bySectionThenStudent);
}
