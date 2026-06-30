# Design System Audit

Audit date: 2026-06-30

Scope: current Tailwind/CSS/design-token implementation only. No UI changes were made.

## Typography

Configured in `tailwind.config.js`:

- Primary sans stack: `Geist`, `Inter`, system UI fallbacks.
- Mono stack: `Geist Mono`, system monospace fallbacks.

Loaded in `src/index.css`:

- Google Fonts import for Geist and Geist Mono.

Observations:

- Typography is primarily controlled through Tailwind utility classes in views.
- There is no centralized semantic text scale component or typography component.
- Screen headings, labels, helper text, and badges are manually styled per screen.
- Some older documentation still mentions Inter as the intended premium UX font, while the current Tailwind theme uses Geist first.

## Spacing

Spacing is Tailwind utility-driven.

Observed patterns:

- Layout shell uses `px-4`, `py-5`, `lg:px-6`.
- Cards commonly use `p-4`, `p-5`, or `p-6`.
- Repeated vertical layouts use `gap-4`, `gap-5`, `gap-6`.
- Dense nav uses smaller spacing such as `px-3`, `py-2`, and `gap-0.5`.

There is no custom spacing scale beyond Tailwind defaults.

## Colors

Configured custom color tokens in `tailwind.config.js`:

- `background`: `#ffffff`
- `surface`: `#ffffff`
- `border`: `#ebebeb`
- `input`: `#ebebeb`
- `ring`: `#b5b5b5`
- `accent.DEFAULT`: `#343434`
- `accent.hover`: `#242424`
- `accent.tint`: `#f7f7f7`
- `secondary`: `#f7f7f7`
- `text.DEFAULT`: `#252525`
- `text.soft`: `#5c5c5c`
- `text.muted`: `#8e8e8e`
- `status.green`: `#12b886`
- `status.amber`: `#f59e0b`
- `status.red`: `#f0506e`
- `status.blue`: `#4c8dff`
- `destructive`: `#e54848`
- `sidebar.DEFAULT`: `#fbfbfb`
- `sidebar.foreground`: `#252525`
- `sidebar.border`: `#ebebeb`
- `sidebar.accent`: `#f7f7f7`
- `chart.1`: `#e76e50`
- `chart.2`: `#2a9d90`
- `chart.3`: `#34556b`
- `chart.4`: `#e8c468`
- `chart.5`: `#f4a259`

Observations:

- Current palette is neutral/shadcn-inspired, with near-black accent.
- Status colors are stable and domain-relevant.
- Chart palette exists in Tailwind config, but current chart implementations use inline SVG/manual chart rendering and may not consistently consume the chart tokens.
- Some existing components still use direct Tailwind colors such as `indigo`, `purple`, `black`, or opacity utilities.

## Border Radius

Configured custom radius:

- `rounded-card`: `14px`
- `rounded-button`: `8px`

Observed usage:

- `.card` uses `rounded-card`.
- `.btn` uses `rounded-button`.
- Skeletons accept `card`, `button`, and `full` radius modes.
- Some components also use Tailwind defaults like `rounded-lg`, `rounded-full`, and `rounded`.

## Shadow

Configured custom shadow:

- `shadow-soft`: subtle layered shadow.

Shared card class:

- `.card` applies surface, border, radius, and `shadow-soft`.

Observations:

- Borders do most of the visual separation.
- Shadow system is minimal and consistent with a restrained SaaS style.
- There is no large elevation scale for popovers, modals, drawers, or menus.

## Animation

Current animation sources:

- Tailwind `animate-spin` in `PageLoader`.
- Tailwind `animate-pulse` in `SkeletonPulse`.
- Tailwind `transition-colors` in buttons/navigation.

Observations:

- No external animation library is installed.
- No global motion tokens or reduced-motion handling were found.
- No route transition system was found.

## Icons

Current icon strategy:

- Navigation icons are string/emoji-like values defined in `src/presentation/navigation.ts`.
- Some buttons use inline SVG directly inside components.
- `SharedAcrossSectionsNotice` uses a string icon.
- No icon library is installed.

Risks:

- Icon style is not unified.
- Emoji-like strings can render differently by platform.
- Inline SVG icons are repeated locally instead of coming from a shared icon system.

## Dark Mode

Configured:

- `darkMode: "class"` in `tailwind.config.js`.

Observed:

- No dark-mode CSS variable map was found.
- No theme toggle was found.
- Tokens are hardcoded as light colors in Tailwind config.

Conclusion:

- Dark mode is structurally enabled at Tailwind level but not implemented as a complete product feature.

## Tailwind Configuration

File: `tailwind.config.js`

Key characteristics:

- Tailwind v3 config.
- Content includes `index.html` and `src/**/*.{ts,tsx}`.
- Custom font stacks.
- Custom color tokens for surface, text, accent, status, sidebar, and charts.
- Custom radius tokens.
- Custom soft shadow.
- No Tailwind plugins are configured.

Important compatibility note:

- Tasko or shadcn templates using Tailwind v4 syntax should not be copied directly into this project. Current project is Tailwind v3.

## CSS Variables

Observed:

- No global CSS variable token system is currently defined in `src/index.css`.
- Tokens are mostly defined in Tailwind config as static values.
- `.card`, `.btn`, `.btn-primary`, and `.btn-secondary` are component utility classes in `@layer components`.

Implication:

- Runtime theming and dark mode would require either CSS variables or duplicated Tailwind dark-class token mappings.
- Current design system is build-time tokenized rather than runtime-tokenized.

