/**
 * Shared-across-sections notice (Shared-materials model).
 *
 * When one teacher teaches the same subject to several sections, the
 * Assignment, Quiz, Lab Manual, and Notes/Study Material are identical across
 * those sections — only attendance and marks are tracked per section. The
 * underlying data is already scoped by subject/unit (never by section), so this
 * notice simply makes that shared nature explicit to the teacher in the UI.
 *
 * Presentation-only: a small, inline info banner reused by the Assignment,
 * Quiz, and Study Material surfaces. When the concrete section labels are known
 * (resolved from the timetable via `formatSectionLabel`) they are listed so the
 * teacher can see exactly which class groups receive the shared item.
 */

interface SharedAcrossSectionsNoticeProps {
  /** The kind of item being shared, used in the sentence (e.g. "assignment"). */
  readonly itemNoun: string;
  /**
   * Human-readable section labels (from `formatSectionLabel`) that are taught
   * the subject. When provided and non-empty they are listed explicitly.
   */
  readonly sectionLabels?: readonly string[];
  /** Optional extra classes for layout tweaks at the call site. */
  readonly className?: string;
}

/** A compact info banner stating the item is shared across the subject's sections. */
export default function SharedAcrossSectionsNotice({
  itemNoun,
  sectionLabels,
  className,
}: SharedAcrossSectionsNoticeProps) {
  const hasLabels = sectionLabels !== undefined && sectionLabels.length > 0;
  return (
    <div
      className={[
        'flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-muted',
        className ?? '',
      ].join(' ')}
    >
      <span aria-hidden className="mt-0.5 text-accent">🔗</span>
      <p>
        This {itemNoun} is{' '}
        <span className="font-semibold text-text">shared across all sections</span>{' '}
        taught this subject. Attendance and marks stay separate per section.
        {hasLabels && (
          <>
            {' '}
            <span className="text-text">Sections:</span>{' '}
            {sectionLabels.join(', ')}.
          </>
        )}
      </p>
    </div>
  );
}
