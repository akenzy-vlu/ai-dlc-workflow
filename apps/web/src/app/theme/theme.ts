import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

/**
 * kiln — Graphite & amber.
 *
 * The whole system is **three neutrals and one accent**. Amber is the only saturated
 * colour, and it carries one meaning: *this is where a human has to look*. Everything
 * else is expressed as depth of graphite. Before reaching for a second hue, check whether
 * a darker or lighter graphite would say it.
 *
 * The values mirror `assets/theme.css`, which is the source of truth and is loaded as CSS
 * custom properties. They are duplicated here because Ant Design's theme algorithm needs
 * literal colours at build time, not `var()` references — where the two could drift,
 * `theme.css` wins and this file follows it.
 */

/** Warm neutral. Deliberately not a cool grey: `#000` or Tailwind's slate kills the warmth. */
export const graphite = {
  25: '#F7F5F0',
  50: '#EDEAE3',
  100: '#DEDBD4',
  200: '#C9C5BD',
  300: '#A5A099',
  400: '#7C776E',
  500: '#5C5852',
  600: '#4A4642',
  700: '#3A3733',
  800: '#2A2724',
  900: '#1C1A18',
  950: '#131211',
} as const;

export const amber = {
  100: '#FFF0D1',
  200: '#FFDE9E',
  300: '#FFD27A',
  400: '#FFC24D',
  500: '#FFB020',
  600: '#E09512',
  700: '#B0730B',
  800: '#7A4E08',
  900: '#3D2A02',
} as const;

/**
 * State colours, and only state.
 *
 * `warning` is an earth orange kept deliberately apart from brand amber: in this system
 * amber means "a person has to approve this", and if it also meant "something is wrong"
 * the signal would be gone. `success` is a muted sage used in very small doses — a status
 * dot, a check glyph — never as a filled area.
 */
export const semantic = {
  danger: '#E5533D',
  warning: '#D9822B',
  success: '#8AA35A',
} as const;

/**
 * `ink` is the neutral ramp every component reads.
 *
 * Kept under its old name so the ramp has one import site across the app; the values are
 * now graphite. Positions match: `ink[400]` is still "muted text", `ink[100]` still
 * "hairline border".
 */
export const ink = graphite;

/** Amber for text or a link is only legible at 800 on light — 500 is a fill, at 1.5:1. */
export const accent = {
  fill: amber[500],
  hover: amber[400],
  press: amber[600],
  /** Text and links on a light background. */
  text: amber[800],
  /** Text sitting on an amber fill. Never white. */
  onFill: amber[900],
  soft: amber[100],
} as const;

/**
 * Gate colour is graphite depth, not a rainbow.
 *
 * A six-step hue ramp across G0…G5 would put five saturated colours on screen and drown
 * the one that means something. A passed gate is history and recedes; the gate that is
 * *waiting for approval* is the amber one, and it is the only gate the eye should catch.
 */
export const GATE_COLORS: Record<string, string> = {
  none: 'var(--gate-none)',
  G0: 'var(--gate-g0)',
  G1: 'var(--gate-g1)',
  G2: 'var(--gate-g2)',
  G3: 'var(--gate-g3)',
  G4: 'var(--gate-g4)',
  G5: 'var(--gate-g5)',
};

/**
 * The gate a feature is *waiting on*, when its preconditions already pass.
 *
 * This is the one gate that needs a person, so it is the one that gets amber. Everything
 * else about gates is depth.
 */
export const GATE_AWAITING_APPROVAL = amber[500];

/**
 * Ticket status, mapped by what each state needs from a person.
 *
 * `review` is the only one that is amber, because it is the only one where the work has
 * stopped and is waiting for someone's eyes. An agent that is mid-run is *active but not
 * yet interesting*; finished work recedes further still.
 */
export const STATUS_COLORS: Record<string, string> = {
  todo: graphite[300],
  in_progress: graphite[400],
  review: amber[500],
  done: graphite[300],
  blocked: semantic.danger,
};

/** Column tints. Only the review lane is tinted — it is the only one worth walking to. */
export const STATUS_TINTS: Record<string, string> = {
  todo: 'var(--bg-raised)',
  in_progress: 'var(--bg-raised)',
  review: 'var(--bg-accent-soft)',
  done: 'var(--bg-raised)',
  blocked: 'var(--bg-raised)',
};

/**
 * Inbox severity.
 *
 * `blocker` here means "a person has to decide" — a blocking assumption, a gate ready to
 * approve, a ticket handed off. That is exactly what amber is for. Things that are simply
 * *wrong* — a dependency cycle, an uncovered criterion — are `warning`, and things that
 * are broken are `danger`. Amber never means "an error occurred".
 */
export const SEVERITY_COLORS: Record<string, string> = {
  blocker: amber[500],
  attention: semantic.warning,
  hygiene: graphite[400],
};

/**
 * Role tokens, as CSS custom properties from `assets/theme.css`.
 *
 * Components read these rather than a ramp position, because a ramp position cannot flip:
 * `graphite-100` is a hairline border on light and invisible on dark. Naming the *role*
 * means one stylesheet decides what each role resolves to in each theme, and every
 * component follows without knowing which theme is showing.
 */
export const token = {
  bgBase: 'var(--bg-base)',
  bgSurface: 'var(--bg-surface)',
  bgRaised: 'var(--bg-raised)',
  bgAccentSoft: 'var(--bg-accent-soft)',
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textAccent: 'var(--text-accent)',
  accentFill: 'var(--accent-fill)',
  accentSoft: 'var(--bg-accent-soft)',
  onAccent: 'var(--on-accent)',
} as const;

/** Always-dark surfaces: agent transcripts and install logs read as terminals in both themes. */
export const TERMINAL = {
  bg: graphite[950],
  text: graphite[50],
  dim: graphite[400],
  stderr: '#F2A08E',
  notice: amber[300],
} as const;

export const MONO_FONT = "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace";
const UI_FONT = "'Inter Tight Variable', 'Inter Variable', system-ui, -apple-system, sans-serif";

/**
 * Ant Design tokens.
 *
 * Two weights only — 400 and 500. With a warm neutral, 600 and 700 read heavy and dated,
 * and the brand rules out both. Radii follow the kit: 4 for tags and small inputs, 8 for
 * buttons and fields, 12 for cards, 16 for modals.
 */
function tokensFor(mode: 'light' | 'dark'): ThemeConfig {
  const dark = mode === 'dark';

  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: amber[500],
      colorPrimaryHover: amber[400],
      colorPrimaryActive: amber[600],
      // Anything primary-coloured that carries *text* has to be legible, and amber-500 is
      // 1.5:1 on light. On light the text form of the accent is amber-800.
      colorLink: dark ? amber[500] : amber[800],
      colorLinkHover: dark ? amber[400] : amber[700],
      colorSuccess: semantic.success,
      colorWarning: semantic.warning,
      colorError: semantic.danger,
      colorInfo: graphite[500],

      colorTextBase: dark ? graphite[50] : graphite[900],
      colorBgBase: dark ? graphite[950] : graphite[25],
      colorBgContainer: dark ? graphite[900] : '#FFFFFF',
      colorBgElevated: dark ? graphite[800] : '#FFFFFF',
      colorBgLayout: dark ? graphite[950] : graphite[25],
      colorBorder: dark ? graphite[700] : graphite[200],
      colorBorderSecondary: dark ? graphite[800] : graphite[100],
      colorTextSecondary: dark ? graphite[300] : graphite[500],
      colorTextTertiary: graphite[400],
      colorTextQuaternary: dark ? graphite[600] : graphite[300],

      borderRadius: 8,
      borderRadiusLG: 12,
      borderRadiusSM: 4,
      borderRadiusXS: 4,

      fontSize: 13,
      fontSizeSM: 12,
      fontSizeLG: 15,
      fontSizeHeading4: 22,
      fontSizeHeading5: 18,
      fontFamily: UI_FONT,
      fontFamilyCode: MONO_FONT,
      fontWeightStrong: 500,

      controlHeight: 32,
      lineHeight: 1.55,
      lineHeightHeading4: 1.25,

      motionEaseInOut: 'cubic-bezier(0.2, 0, 0, 1)',
      motionDurationFast: '120ms',
      motionDurationMid: '180ms',
      motionDurationSlow: '240ms',

      boxShadowTertiary: dark
        ? '0 1px 2px rgba(0, 0, 0, 0.40)'
        : '0 1px 2px rgba(28, 26, 24, 0.05)',
      boxShadowSecondary: dark
        ? '0 8px 24px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.40)'
        : '0 8px 24px rgba(28, 26, 24, 0.10), 0 2px 6px rgba(28, 26, 24, 0.06)',
    },
    components: {
      Layout: {
        siderBg: graphite[950],
        headerBg: dark ? graphite[900] : '#FFFFFF',
        bodyBg: dark ? graphite[950] : graphite[25],
        headerHeight: 52,
      },
      Menu: {
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'transparent',
        // The selected item is the one place the sidebar earns amber: it answers "where
        // am I", which is a question about attention.
        darkItemSelectedBg: 'rgba(255, 176, 32, 0.14)',
        darkItemSelectedColor: amber[400],
        darkItemColor: graphite[300],
        darkItemHoverBg: 'rgba(237, 234, 227, 0.06)',
        itemMarginInline: 8,
        itemHeight: 32,
        itemBorderRadius: 8,
        iconSize: 15,
      },
      Table: {
        cellPaddingBlockSM: 8,
        cellPaddingInlineSM: 12,
        headerBg: dark ? graphite[900] : graphite[25],
        headerColor: dark ? graphite[300] : graphite[500],
        headerSplitColor: 'transparent',
        rowHoverBg: dark ? graphite[800] : graphite[25],
        borderColor: dark ? graphite[800] : graphite[100],
      },
      Card: { paddingLG: 16, borderRadiusLG: 12 },
      Tabs: { horizontalItemPadding: '8px 0', horizontalItemGutter: 22 },
      Tag: {
        defaultBg: dark ? graphite[800] : graphite[50],
        defaultColor: dark ? graphite[300] : graphite[500],
        borderRadiusSM: 4,
      },
      Segmented: {
        itemSelectedBg: dark ? graphite[700] : '#FFFFFF',
        trackBg: dark ? graphite[800] : graphite[100],
        borderRadius: 8,
      },
      Button: { paddingInline: 12, fontWeight: 500, primaryColor: amber[900] },
      Modal: { borderRadiusLG: 16 },
      Drawer: { paddingLG: 20 },
      Input: { paddingBlock: 5 },
      Collapse: { headerPadding: '10px 14px', contentPadding: '12px 14px' },
      Progress: { defaultColor: graphite[500] },
    },
  };
}

export const lightTheme = tokensFor('light');
export const darkTheme = tokensFor('dark');
