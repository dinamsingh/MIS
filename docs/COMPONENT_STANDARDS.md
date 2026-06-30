# Component Standards

Purpose: define standards for reusable UI components during future migration work.

This document contains no implementation code.

## General Standards

Every reusable component should be:

- Predictable.
- Accessible.
- Responsive.
- Easy to compose.
- Consistent with existing design tokens.
- Independent from unrelated business logic.

Shared components should not directly own Supabase queries unless their purpose is explicitly data access.

## Buttons

Button standards:

- Must have clear visual states: default, hover, active, focus, disabled, loading.
- Must keep text and icons aligned.
- Must not change dimensions between states.
- Icon-only buttons must have accessible labels.
- Destructive actions must use destructive styling.
- Primary actions should be visually limited to the main action in a region.
- Secondary and tertiary actions should be quieter.

Sizing:

- Minimum mobile touch target should be comfortable.
- Compact buttons are allowed only in dense tables/toolbars.

## Inputs

Input standards:

- Must have a visible label or accessible label.
- Must show validation errors near the relevant field.
- Must preserve typed values during validation errors.
- Must support disabled and read-only states.
- Must have visible focus state.
- Placeholder text must not replace labels.

Selects and filters:

- Must show current value clearly.
- Must handle empty option lists.
- Must preserve selected-section behavior when section-aware.

## Cards

Card standards:

- Cards represent a grouped unit of content, not every page section.
- Avoid cards inside cards.
- Card padding should match content density.
- Clickable cards must have hover/focus affordance.
- Non-clickable metric cards should remain visually stable.
- Card headers should be concise.

## Tables

Table standards:

- Headers must be clear and aligned with cells.
- Numeric values should align consistently.
- Loading state should preserve table dimensions where possible.
- Empty state should explain what is missing.
- Error state should offer retry when possible.
- Row hover should be subtle.
- Bulk actions should clearly indicate selected rows.
- Inline editing must preserve keyboard flow.

Responsive behavior:

- Wide tables may scroll horizontally inside a controlled container.
- Do not allow page-level horizontal overflow.
- On mobile, prefer readable stacked rows only when table density becomes unusable.

## Dialogs

Dialog standards:

- Use dialogs only for focused decisions or short workflows.
- Destructive confirmations must clearly name the affected item.
- Dialogs must support Escape close when safe.
- Focus should move into the dialog on open.
- Focus should return to the trigger on close.
- Background content should not be keyboard reachable while modal is open.
- Dialog content must fit mobile viewports.

## Forms

Form standards:

- Group related fields.
- Keep primary action near the end of the form.
- Disable submit while saving only when duplicate submission would be harmful.
- Show save errors without clearing user input.
- Validation copy must be direct and in English.
- Long forms should preserve progress on transient errors.

## Charts

Chart standards:

- Use the right chart for the job.
- Bar charts must start value axis at zero.
- Avoid chart colors that do not encode meaning.
- Use readable labels and legends.
- Provide empty states when data is insufficient.
- Avoid decorative chartjunk.
- Charts must remain readable on mobile.
- Important chart values should be available as text or accessible labels.

## Spacing

Spacing standards:

- Use a consistent spacing rhythm.
- Dense operational screens may use tighter spacing than marketing pages.
- Page-level spacing should be larger than component-level spacing.
- Related controls should be visually grouped.
- Avoid accidental crowding in table toolbars and forms.

## Typography

Typography standards:

- Use headings to establish hierarchy, not decoration.
- Keep dashboard card text compact.
- Avoid oversized headings inside dense panels.
- Labels and helper text should be readable but quiet.
- Use consistent weight for labels, values, and metadata.
- Do not rely on color alone to indicate importance.

## Responsive Behavior

Responsive standards:

- Desktop should prioritize scanning and efficient repeated work.
- Tablet should preserve major layout groups without crowding controls.
- Mobile should prioritize task completion and avoid horizontal page overflow.
- Navigation must remain reachable on mobile.
- Tables and charts must degrade gracefully.
- Buttons and controls must remain touch-friendly.

## Accessibility

Accessibility standards:

- Keyboard navigation must work for all interactive controls.
- Focus states must be visible.
- Icon-only controls must have accessible names.
- Form errors must be discoverable.
- Color contrast must remain readable.
- Motion must respect reduced-motion preferences.
- Loading states should communicate progress or waiting state.
- Disabled controls should not be the only explanation of unavailable actions.

