import { useMemo } from 'react';
import HeatmapView, { type HeatmapPersistence, type HeatmapSectionOption, type HeatmapStudent } from '@presentation/views/HeatmapView';
import { createHeatmapAccess } from '@data/access/heatmapAccess';
import { demoNumber, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

const supabaseHeatmap = createHeatmapAccess(supabase);

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

function createLocalHeatmap(loadStudentsForSection: typeof loadStudents): HeatmapPersistence {
  async function loadStudentAttendance(sectionId: string) {
    const students = await loadStudentsForSection(sectionId);
    return students.map((student) => {
      const totalHeldPeriods = 48;
      const attendance = demoNumber(`${sectionId}:${student.id}:heatmap-attendance`, 58, 98);
      return {
        studentId: student.id,
        attendedPeriods: Math.round((attendance / 100) * totalHeldPeriods),
        totalHeldPeriods,
      };
    });
  }

  return {
    loadStudentAttendance,

    async loadDefaulters(sectionId) {
      const attendance = await loadStudentAttendance(sectionId);
      return attendance
        .filter((student) => (student.attendedPeriods / student.totalHeldPeriods) * 100 < 75)
        .map((student) => student.studentId);
    },

    async loadDayHeatLevels(sectionId) {
      const levels: Record<string, number> = {};
      const today = new Date();
      for (let offset = -45; offset <= 0; offset += 1) {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        const iso = date.toISOString().slice(0, 10);
        levels[iso] = Math.round(demoNumber(`${sectionId}:${iso}:heat`, 42, 96));
      }
      return levels;
    },
  };
}

export default function HeatmapPage() {
  const { selectedSection } = useSelectedSection();
  const heatmap = useMemo(
    () => (isLocalDemoMode() ? createLocalHeatmap(loadStudents) : supabaseHeatmap),
    [],
  );

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
