# Testing Checklist

Purpose: checklist for future implementation sessions.

Use the relevant sections based on the scope of the change.

## Desktop

- [ ] App loads without console-breaking errors.
- [ ] Sidebar is visible and usable.
- [ ] Topbar and global section selector are visible.
- [ ] Main content fits without unwanted horizontal overflow.
- [ ] Tables remain readable.
- [ ] Forms align correctly.
- [ ] Cards and charts fit their containers.
- [ ] Hover states work on interactive elements.
- [ ] Route navigation preserves active state.

## Tablet

- [ ] Layout remains usable between desktop and mobile breakpoints.
- [ ] Navigation does not overlap content.
- [ ] Controls remain touch-friendly.
- [ ] Tables or grids do not break the viewport.
- [ ] Dialogs/sheets fit the viewport.
- [ ] Charts remain readable.
- [ ] Section selector remains accessible.

## Mobile

- [ ] Mobile drawer opens and closes.
- [ ] Drawer overlay behaves correctly.
- [ ] No page-level horizontal overflow.
- [ ] Buttons and controls are easy to tap.
- [ ] Form fields fit the screen.
- [ ] Tables have a usable mobile strategy.
- [ ] Charts are readable or gracefully simplified.
- [ ] Dialogs/sheets fit and scroll correctly.
- [ ] Sticky/fixed elements do not cover important content.

## Dark Mode

- [ ] Dark mode is not enabled unless fully implemented.
- [ ] Background, surfaces, borders, text, inputs, and charts are tokenized.
- [ ] Text contrast is readable.
- [ ] Status colors remain understandable.
- [ ] Focus rings are visible.
- [ ] Skeletons are visible but not too bright.
- [ ] Dialogs and overlays have correct contrast.
- [ ] Charts have dark-mode-safe colors.

## Accessibility

- [ ] Keyboard can reach all interactive controls.
- [ ] Focus indicators are visible.
- [ ] Icon-only buttons have accessible labels.
- [ ] Form fields have labels or accessible names.
- [ ] Errors are close to fields and readable.
- [ ] Dialog focus is managed correctly.
- [ ] Escape closes dialogs where appropriate.
- [ ] Color is not the only status indicator.
- [ ] Motion respects reduced-motion preference.
- [ ] Text has adequate contrast.

## Performance

- [ ] Route lazy loading still works.
- [ ] UI changes do not introduce unnecessary large assets.
- [ ] Expensive charts/tables do not rerender excessively.
- [ ] Loading states appear for slow data.
- [ ] Skeletons match final layout to avoid large shifts.
- [ ] Production build completes.
- [ ] Bundle-impacting dependencies are not added without approval.

## Authentication

- [ ] Unauthenticated users redirect to `/sign-in`.
- [ ] Authenticated teacher redirects away from `/sign-in` to `/dashboard`.
- [ ] Teacher routes remain guarded.
- [ ] Sign-out returns to `/sign-in`.
- [ ] Student quiz public routes remain accessible.
- [ ] Locked AI routes still respect feature flag behavior.

## Supabase

- [ ] Data still loads for selected section.
- [ ] RLS-related failures show usable errors instead of blank screens.
- [ ] No service role key is introduced in frontend code.
- [ ] Dashboard still uses section-scoped data.
- [ ] Upload flows still route sensitive and public files correctly.
- [ ] Save/update/delete mutations still report success or failure clearly.
- [ ] No query was changed for visual-only work.

## Forms

- [ ] Required validation works.
- [ ] Invalid input shows clear errors.
- [ ] Submitting does not erase user input on failure.
- [ ] Loading/saving state is visible.
- [ ] Disabled state is understandable.
- [ ] Keyboard submission behavior is correct.
- [ ] Mobile keyboard does not hide critical actions.
- [ ] Long text wraps correctly.

## Tables

- [ ] Headers align with cells.
- [ ] Numeric values align consistently.
- [ ] Empty state is present.
- [ ] Loading state preserves structure.
- [ ] Error state is visible.
- [ ] Row actions remain accessible.
- [ ] Horizontal scrolling, if needed, is contained.
- [ ] Inline edits, if present, save and rollback correctly.
- [ ] Bulk actions, if present, clearly show selection.

## Animations

- [ ] Hover transitions do not shift layout.
- [ ] Page transitions do not delay usability.
- [ ] Drawer/dialog animations feel short and stable.
- [ ] Skeleton animation is calm.
- [ ] Reduced-motion mode disables movement.
- [ ] Focus is not lost during animated transitions.
- [ ] Data changes are not hidden by animation.

