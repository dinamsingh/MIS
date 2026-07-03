import { useMemo } from 'react';
import HeatmapView, {
  type HeatmapPersistence,
  type HeatmapSectionOption,
  type HeatmapStudent,
} from '@presentation/views/HeatmapView';
import { createHeatmapAccess } from '@data/access/heatmapAccess';
import { demoNumber, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSection } from '@presentation/loaders/rosterStudents';
import type { Section } from '@data/access/rows';

const supabaseHeatmap = createHeatmapAccess(supabase);

function createStudentLoader(sections: readonly Section[]) {
  return async function loadStudents(sectionId: string): Promise<HeatmapStudent[]> {
    const section = sections.find((item) => item.id === sectionId);
    if (!section) {
      return [];
    }
    const roster = await loadRosterStudentsForSection(section);
    return roster.map((student) => ({
      id: student.id,
      name: student.name,
      enrollmentNumber: student.enrollmentNumber,
    }));
  };
}

function createLocalHeatmap(
  loadStudentsForSection: (sectionId: string) => Promise<HeatmapStudent[]>,
): HeatmapPersistence {
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

  // The globally-selected section is authoritative; no per-page picker.
  const sections: HeatmapSectionOption[] = selectedSection ? [selectedSection] : [];
  const loadStudents = useMemo(
    () => createStudentLoader(selectedSection ? [selectedSection] : []),
    [selectedSection],
  );
  const heatmap = useMemo(
    () => (isLocalDemoMode() ? createLocalHeatmap(loadStudents) : supabaseHeatmap),
    [loadStudents],
  );

  return (
    <HeatmapView
      key={selectedSection?.id ?? 'none'}
      sections={sections}
      loadStudents={loadStudents}
      heatmap={heatmap}
    />
  );
}
