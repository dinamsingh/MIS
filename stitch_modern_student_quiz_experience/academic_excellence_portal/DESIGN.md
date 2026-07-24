---
name: Academic Excellence Portal
colors:
  surface: '#f8f9ff'
  surface-dim: '#ccdbf3'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d5e3fc'
  on-surface: '#0d1c2e'
  on-surface-variant: '#464652'
  inverse-surface: '#233144'
  inverse-on-surface: '#eaf1ff'
  outline: '#777683'
  outline-variant: '#c7c5d4'
  surface-tint: '#4f54b4'
  primary: '#15157d'
  on-primary: '#ffffff'
  primary-container: '#2e3192'
  on-primary-container: '#9da1ff'
  inverse-primary: '#c0c1ff'
  secondary: '#585a8d'
  on-secondary: '#ffffff'
  secondary-container: '#c3c4ff'
  on-secondary-container: '#4d5082'
  tertiary: '#0c0092'
  on-tertiary: '#ffffff'
  tertiary-container: '#2421b6'
  on-tertiary-container: '#9ea1ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#04006d'
  on-primary-fixed-variant: '#373a9b'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c2fc'
  on-secondary-fixed: '#131546'
  on-secondary-fixed-variant: '#404274'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#f8f9ff'
  on-background: '#0d1c2e'
  surface-variant: '#d5e3fc'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

The design system is engineered for high-end academic Management Information Systems (MIS), targeting faculty, researchers, and high-achieving students. The brand personality is authoritative yet technologically progressive—balancing the weight of traditional academia with the efficiency of modern enterprise software.

The visual style is **Corporate / Modern** with a lean towards **Minimalism**. It prioritizes extreme legibility and a sense of "intellectual space" through generous margins and a strict white-base layout. The UI should evoke an emotional response of organized calm, precision, and institutional prestige.

## Colors

The palette is anchored by **Deep Indigo** (`#2E3192`), representing institutional stability. This is often applied as a subtle linear gradient (from Primary to Secondary) in top-level navigation or hero headers to add depth. 

- **Primary & Secondary:** Used for branding, active states, and primary actions.
- **Tertiary:** A brighter "Electric Indigo" used sparingly for glowing focus states and notification accents.
- **Neutrals:** A "Slate Gray" scale is used for text to reduce the harshness of pure black, ensuring long-term reading comfort for academic data.
- **Surfaces:** Pure white (`#FFFFFF`) backgrounds are mandatory for data-heavy views to maintain a "crisp" academic feel.

## Typography

The design system utilizes **Inter** for all roles to leverage its exceptional legibility and systematic feel. 

1.  **Hierarchy:** Use bold weights and negative letter-spacing for large displays to create a premium editorial look. 
2.  **Information Density:** In data tables or dashboard cards, use `body-md` for standard text and `label-sm` for table headers or metadata.
3.  **Optical Sizing:** For sizes above 24px, ensure the "Display" features of the font are utilized (tightening letter spacing).

## Layout & Spacing

This design system employs a **Fixed Grid** philosophy for desktop to maintain a professional, document-like structure, transitioning to a fluid layout for mobile.

- **Desktop:** 12-column grid with a maximum container width of 1280px. Gutters are fixed at 24px.
- **Tablet:** 8-column grid with 24px margins.
- **Mobile:** 4-column fluid grid with 16px margins.
- **Rhythm:** All spacing must be multiples of 4px. Use `lg` (48px) spacing between major sections and `sm` (16px) for internal card padding.

## Elevation & Depth

Hierarchy is established through **Ambient Shadows** and **Tonal Layering**. 

1.  **Resting State:** Cards and containers use a very soft, diffused shadow (`0px 4px 20px rgba(46, 49, 146, 0.05)`) to lift them slightly from the base white surface.
2.  **Interactive State:** Upon hover, elements should elevate further with a slightly more pronounced shadow and a subtle 1px border in a light slate tint.
3.  **The "Glow":** Focus states for inputs and buttons do not use traditional outlines. Instead, they utilize a `0px 0px 0px 4px rgba(99, 102, 241, 0.2)` soft glow to indicate activity without breaking the minimalist silhouette.

## Shapes

The shape language is **Soft** and precise. A 0.25rem (4px) base radius is used for small components like checkboxes and buttons, while larger containers like cards use 0.5rem (8px). This creates a disciplined, architectural feel that avoids the "playfulness" of highly rounded corners, maintaining an academic tone.

## Components

### Buttons
Primary buttons use the Indigo gradient. Secondary buttons are ghost-style with a slate border. All buttons use `label-sm` typography for clarity.

### Cards
Sleek, white surfaces with the "Resting State" shadow. No heavy borders; let the shadow define the edge. Header sections within cards should have a subtle bottom divider in `#F1F5F9`.

### Input Fields
Utilize **Floating Labels**—the label sits inside the field at resting state and moves to the top border upon focus or when value is present. Use a transition of 200ms for the label movement.

### Step Indicators
Refined, thin lines connect small circular nodes. Active steps are filled with the Primary Indigo; completed steps feature a small checkmark icon; upcoming steps are outlined in light slate.

### Data Tables
Clean rows with no vertical lines. Hovering over a row should apply a very light tint (`#F8FAFC`) to assist in horizontal scanning.

### Chips
Used for academic status (e.g., "Enrolled," "Pending"). High-contrast text on very low-opacity background fills of the status color (e.g., Green text on 10% Green background).