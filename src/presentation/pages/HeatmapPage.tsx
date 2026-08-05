import { useMemo } from 'react';
import HeatmapView, {
  type HeatmapPersistence,
  type HeatmapSectionOption,
} from '@presentation/views/HeatmapView';
import { createHeatmapAccess } from '@data/access/heatmapAccess';
import { demoNumber, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

const supabaseHeatmap = createHeatmapAccess(supabase);

function createLocalHeatmap(): HeatmapPersistence {
  return {
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
  const heatmap = useMemo(
    () => (isLocalDemoMode() ? createLocalHeatmap() : supabaseHeatmap),
    [],
  );

  return (
    <HeatmapView
      key={selectedSection?.id ?? 'none'}
      sections={sections}
      heatmap={heatmap}
    />
  );
}
