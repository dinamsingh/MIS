import { useEffect, useState } from 'react';
import HeatmapView, { type HeatmapSectionOption, type HeatmapStudent } from '@presentation/views/HeatmapView';
import { createHeatmapAccess } from '@data/access/heatmapAccess';
import { createSectionsAccess } from '@data/access/sectionsAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';

const heatmap = createHeatmapAccess(supabase);
const sectionsAccess = createSectionsAccess(supabase);

async function loadStudents(sectionId: string): Promise<HeatmapStudent[]> {
  // Query students table which has section_id
  const { data } = await supabase
    .from('students')
    .select('id, name, enrollment_number')
    .eq('section_id', sectionId)
    .order('name');
  if (!data) return [];
  return data.map((row: { id: string; name: string; enrollment_number?: string | null }) => ({
    id: row.id,
    name: row.name,
    enrollmentNumber: row.enrollment_number || undefined,
  }));
}

export default function HeatmapPage() {
  const [sections, setSections] = useState<HeatmapSectionOption[]>([]);
  const semester = useSelectedSemester();
  const section = useSelectedSection();

  useEffect(() => {
    void (async () => {
      try {
        const dbSemester = mapSemesterToDb(semester);
        const semNum = dbSemester[0];
        const suffix = `${semNum}${section}`;

        // Real section list (with labels), narrowed to the selected section.
        const allSections = await sectionsAccess.listSections();
        setSections(allSections.filter((s) => s.name.endsWith(suffix)));
      } catch {
        // View handles empty state.
      }
    })();
  }, [semester, section]);

  return (
    <HeatmapView
      key={`${semester}-${section}`}
      sections={sections}
      loadStudents={loadStudents}
      heatmap={heatmap}
    />
  );
}
