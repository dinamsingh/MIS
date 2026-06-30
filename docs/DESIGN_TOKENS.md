# Design Tokens

Purpose: define the intended design-token language for future UI migration work.

This is a token specification only. It contains no implementation code.

## Color System

Use semantic color roles rather than one-off colors.

Core roles:

- Background: app canvas.
- Surface: cards, panels, menus, dialogs.
- Surface muted: subtle toolbars, table headers, sidebar accents.
- Border: standard dividers and card outlines.
- Input: form field borders and neutral control backgrounds.
- Ring: focus ring and active outline.
- Text primary: main readable text.
- Text secondary: labels and supporting content.
- Text muted: metadata and low-emphasis content.
- Accent: primary action and active navigation.
- Accent hover: primary hover state.
- Accent tint: selected/active low-emphasis background.

Status roles:

- Success: present, submitted, complete, healthy.
- Warning: pending, attention, partial progress.
- Danger: absent, failed, destructive, at risk.
- Info: neutral informational state.

Chart roles:

- Chart categorical 1-5 for category separation.
- Chart positive for good outcomes.
- Chart warning for moderate risk.
- Chart negative for poor outcomes.
- Chart neutral for baseline/reference values.

Rules:

- Use semantic roles before raw colors.
- Do not use color alone to communicate status.
- Keep contrast readable in tables and forms.
- Avoid introducing new colors unless a semantic gap exists.

## Spacing Scale

Spacing should follow a consistent rhythm:

- 4px: tiny icon/text gap.
- 8px: compact control gap.
- 12px: dense group spacing.
- 16px: default component spacing.
- 20px: card internal spacing.
- 24px: section spacing.
- 32px: major screen spacing.
- 40px and above: rare, page-level separation only.

Rules:

- Operational screens should stay dense but breathable.
- Repeated table/card layouts should use consistent gaps.
- Mobile spacing may tighten horizontally but must preserve tap targets.

## Radius

Radius roles:

- Small: badges, tiny controls.
- Control: buttons, inputs, selects, toolbar controls.
- Card: cards and panels.
- Full: avatars, pills, circular icon buttons.

Rules:

- Use fewer radius values.
- Cards should not become overly rounded.
- Tables and dense surfaces should use restrained radius.
- Radius should not be used to make unrelated elements feel like buttons.

## Shadow

Shadow roles:

- None: flat surfaces separated by borders.
- Soft: cards and subtle panels.
- Elevated: dropdowns, popovers, dialogs.
- Overlay: modal/sheet surfaces.

Rules:

- Borders should carry most layout separation.
- Use elevation only where layering matters.
- Avoid heavy decorative shadows.

## Typography

Typography roles:

- Page title.
- Section title.
- Card title.
- Body text.
- Label.
- Helper text.
- Metadata.
- Table header.
- Table cell.
- Metric value.
- Badge text.

Rules:

- Use size and weight to show hierarchy.
- Avoid large text in compact panels.
- Keep table and form typography stable across screens.
- UI text must be professional English.

## Icons

Icon roles:

- Navigation icons.
- Action icons.
- Status icons.
- Empty-state icons.
- File-type icons.
- Chart/metric icons.

Rules:

- Use one consistent icon style.
- Icon-only controls must have accessible names.
- Do not mix emoji-style icons with a formal SaaS visual system once a formal icon set is adopted.
- Status icons should reinforce text, not replace it.

## Motion Tokens

Duration roles:

- Instant: state changes with no animation.
- Fast: hover and small control transitions.
- Standard: menus, cards, content fades.
- Slow: drawers and large overlays.

Easing roles:

- Standard ease for control transitions.
- Ease-out for entering content.
- Ease-in for exiting content.
- Subtle spring only for active indicators if introduced.

Rules:

- Respect reduced-motion preferences.
- Motion must not affect data correctness or workflow speed.
- Do not animate layout in ways that cause content jumps.

## Dark Mode Tokens

Dark mode should be designed as semantic token pairs, not inverted raw colors.

Required dark-mode roles:

- Background dark.
- Surface dark.
- Surface muted dark.
- Border dark.
- Input dark.
- Ring dark.
- Text primary dark.
- Text secondary dark.
- Text muted dark.
- Accent dark.
- Accent hover dark.
- Accent tint dark.
- Status success/warning/danger/info dark.
- Chart palette dark.
- Sidebar background dark.
- Sidebar border dark.
- Sidebar active dark.

Rules:

- Do not ship partial dark mode.
- Every component must be readable in dark mode before enabling a toggle.
- Charts must be reviewed separately in dark mode.
- Shadows should be reduced or replaced with borders in dark mode.

