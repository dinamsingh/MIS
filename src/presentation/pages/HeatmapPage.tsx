/**
 * Connected page wrapper for HeatmapView.
 * Wires Supabase-backed heatmapAccess and loads sections/students.
 */

import { useEffect, useState } from 'react';
import HeatmapView, { type HeatmapSectionOption, type HeatmapStudent } from '@presentation/views/HeatmapView';
import { createHeatmapAccess } from '@data/access/heatmapAccess';
import { supabase } from '@data/supabase';

const heatmap = createHeatmapAccess(supabase);

async function loadStudents(sectionId: string): Promise<HeatmapStudent[]> {
  const { data } = await supabase
    .from('student_roster')
    .select('id, name, enrollment_number')
    .eq('section_id', sectionId)
    .order('name');
  if (!data) return [];
  return data.map((row: { id: string; name: string; enrollment_number?: string }) => ({
    id: row.id,
    name: row.name,
    enrollmentNumber: row.enrollment_number,
  }));
}

export default function HeatmapPage() {
  const [sections, setSections] = useState<HeatmapSectionOption[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.from('sections').select('id, name').order('name');
        if (data) {
          setSections(data as HeatmapSectionOption[]);
        }
      } catch {
        // View handles empty state.
      }
    })();
  }, []);

  return (
    <HeatmapView
      sections={sections}
      loadStudents={loadStudents}
      heatmap={heatmap}
    />
  );
}
