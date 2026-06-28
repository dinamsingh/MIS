import { useEffect, useState } from 'react';
import HeatmapView, { type HeatmapSectionOption, type HeatmapStudent } from '@presentation/views/HeatmapView';
import { createHeatmapAccess } from '@data/access/heatmapAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';

const heatmap = createHeatmapAccess(supabase);

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
        const targetSectionName = `CS-${semNum}${section}`;

        const { data } = await supabase.from('sections').select('id, name').order('name');
        if (data) {
          const filteredSections = (data as HeatmapSectionOption[]).filter(
            (sec) => sec.name === targetSectionName
          );
          setSections(filteredSections);
        }
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
