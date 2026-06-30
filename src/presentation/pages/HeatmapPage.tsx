import HeatmapView, { type HeatmapSectionOption, type HeatmapStudent } from '@presentation/views/HeatmapView';
import { createHeatmapAccess } from '@data/access/heatmapAccess';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

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
  const { selectedSection } = useSelectedSection();

  // The globally-selected section is authoritative — no per-page picker.
  const sections: HeatmapSectionOption[] = selectedSection ? [selectedSection] : [];

  return (
    <HeatmapView
      key={selectedSection?.id ?? 'none'}
      sections={sections}
      loadStudents={loadStudents}
      heatmap={heatmap}
    />
  );
}
