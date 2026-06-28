import { useEffect, useState } from 'react';

export function useSelectedSemester(): string {
  const [semester, setSemester] = useState(() => {
    return localStorage.getItem('mis_selected_semester') || 'Semester 5';
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setSemester(customEvent.detail);
      }
    };
    window.addEventListener('semesterChanged', handler);
    return () => {
      window.removeEventListener('semesterChanged', handler);
    };
  }, []);

  return semester;
}

export function useSelectedSection(): string {
  const [section, setSection] = useState(() => {
    return localStorage.getItem('mis_selected_section') || 'A';
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setSection(customEvent.detail);
      }
    };
    window.addEventListener('sectionChanged', handler);
    return () => {
      window.removeEventListener('sectionChanged', handler);
    };
  }, []);

  return section;
}

export function useSectionNames(semester: string): { A: string; B: string; C: string } {
  const getNamesForSemester = (sem: string) => {
    const saved = localStorage.getItem('mis_section_names');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed[sem]) {
          return parsed[sem];
        }
      } catch {
        // ignore
      }
    }
    return { A: 'A', B: 'B', C: 'C' };
  };

  const [sectionNames, setSectionNames] = useState(() => getNamesForSemester(semester));

  useEffect(() => {
    setSectionNames(getNamesForSemester(semester));
  }, [semester]);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<Record<string, { A: string; B: string; C: string }>>;
      if (customEvent.detail && customEvent.detail[semester]) {
        setSectionNames(customEvent.detail[semester]);
      }
    };
    window.addEventListener('sectionNamesChanged', handler);
    return () => {
      window.removeEventListener('sectionNamesChanged', handler);
    };
  }, [semester]);

  return sectionNames;
}

export function mapSemesterToDb(sem: string): string {
  const num = sem.replace('Semester ', '');
  if (num === '1') return '1st Semester';
  if (num === '2') return '2nd Semester';
  if (num === '3') return '3rd Semester';
  return `${num}th Semester`;
}
