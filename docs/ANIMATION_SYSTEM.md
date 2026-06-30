# Animation System

Purpose: define the motion strategy for future UI migration work.

This document contains no implementation code.

## Principles

- Motion should clarify state changes, not decorate them.
- Animations must be short, calm, and consistent.
- Every animation must respect reduced-motion preferences.
- Important data must remain readable during transitions.
- Loading motion should reassure users without implying false progress.
- Avoid motion that changes layout unexpectedly.

## Page Transitions

Use page transitions only after the layout and screen visual systems are stable.

Recommended behavior:

- Subtle fade and slight vertical movement for route content.
- Duration: 160-220ms.
- New content should become readable quickly.
- Avoid full-page sliding transitions in a data-heavy MIS.
- Keep layout shell stable while only page content transitions.

Reduced-motion behavior:

- Disable movement.
- Use instant content swap or very short opacity transition only.

## Sidebar Animations

Desktop sidebar:

- Active item indicator may animate position or background softly.
- Hover state should transition color/background only.
- Group expansion, if added later, should be height/opacity controlled and short.

Mobile drawer:

- Drawer may slide from the left.
- Overlay may fade in.
- Duration: 180-240ms.
- Focus should move predictably into the drawer when opened and return to trigger when closed.

Reduced-motion behavior:

- Drawer appears/disappears without sliding.
- Overlay may appear instantly.

## Card Animations

Cards should feel stable.

Allowed:

- Subtle hover lift for clickable cards.
- Border or shadow emphasis on hover.
- Soft content fade when data refreshes.

Avoid:

- Large scale effects.
- Bouncy movement on dashboard metrics.
- Hover effects that change card dimensions.
- Animating large tables row-by-row on every render.

Recommended duration:

- Hover in/out: 120-180ms.
- Data refresh emphasis: 160-220ms.

## Dialog Animations

Dialogs, sheets, dropdowns, and popovers should use predictable transitions.

Recommended behavior:

- Backdrop fade.
- Dialog fade plus small scale or vertical shift.
- Sheet slide from its edge.
- Dropdown/popover fade and small translate.

Recommended duration:

- Open: 140-200ms.
- Close: 100-160ms.

Accessibility:

- Motion must not delay focus trapping.
- Close animation must not prevent keyboard users from continuing.
- Escape key and outside-click behavior should remain reliable.

## Hover Interactions

Hover should communicate clickability and hierarchy.

Recommended:

- Buttons: background, border, or shadow transition.
- Icon buttons: background tint and color transition.
- Table rows: subtle background transition.
- Cards: border/shadow emphasis only when clickable.

Avoid:

- Hover states that move neighboring elements.
- Hover-only information that is unavailable to keyboard/touch users.
- Excessive color changes.

## Loading Animations

Loading should use:

- Skeletons for page sections and structured content.
- Spinner only for short unknown waits or full lazy-route fallback.
- Progress indicators only when real progress is available.

Avoid:

- Fake progress bars.
- Large animated decorative loaders.
- Multiple competing loaders on the same screen.

## Skeleton Animations

Skeleton behavior:

- Use calm pulse animation.
- Match final layout dimensions.
- Avoid skeletons that shift when content loads.
- Keep skeleton contrast subtle but visible.

Recommended duration:

- Pulse cycle: 1.2-1.8s.

Reduced-motion behavior:

- Replace pulse with static skeleton blocks.

## Motion Durations

Recommended motion scale:

- Instant: 0ms for critical state changes and reduced motion.
- Fast: 100-140ms for hover and small controls.
- Standard: 160-220ms for page content, cards, menus.
- Slow: 240-320ms for drawers or large sheets.

Avoid animations longer than 320ms in the main workflow.

## Easing

Recommended easing principles:

- Use ease-out for entering elements.
- Use ease-in or standard ease for exiting elements.
- Use ease-in-out for hover and active state transitions.
- Spring motion should be subtle and reserved for active indicators or tabs.

Avoid:

- Aggressive bounce.
- Elastic overshoot in productivity workflows.
- Different easing styles on adjacent components.

## Accessibility

Every animation must respect `prefers-reduced-motion`.

Reduced-motion mode should:

- Remove translation, scale, and parallax.
- Keep opacity transitions optional and very short.
- Keep skeletons static.
- Keep drawer/dialog behavior instant or near-instant.

Additional accessibility rules:

- Motion must not be required to understand state.
- Focus indicators must not be hidden by animation.
- Animated content must not steal focus unexpectedly.
- Do not animate numbers if it delays reading important stats.

