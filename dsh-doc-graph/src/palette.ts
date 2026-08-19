/**
 * §8.2 graph-only palette. Graph colors are plugin-owned and do not flip with
 * the host dark/light theme.
 */
import type { Role } from './types.js'

/** 2D node border / main color by role. */
export const COLORS: Record<Role, string> = {
  current: '#163b5c',
  direct: '#4b7b97',
  transitive: '#9cb3c1',
  section: '#c18a3d',
  other: '#c9c7c2',
}

/** 2D node fill by role. */
export const FILLS: Record<Role, string> = {
  current: '#163b5c',
  direct: '#edf4f7',
  transitive: '#f3f6f7',
  section: '#c18a3d',
  other: '#f4f3f0',
}

/** 2D node label color by role. */
export const NODE_TEXT_2D: Record<Role, string> = {
  current: '#ffffff',
  section: '#7b5120',
  direct: '#18384b',
  transitive: '#526b79',
  other: '#817d76',
}

/** 2D edge styles. */
export const EDGE_2D = {
  contains: { color: 'rgba(193,138,61,.70)', width: 1.2, type: 'dashed', opacity: 1 },
  references: { color: 'rgba(82,112,126,.34)', width: 1.25, type: 'solid', opacity: 0.78 },
  referencesSelected: { color: 'rgba(20,78,109,.96)', width: 3, type: 'solid', opacity: 1 },
} as const

/** 2D edge arrow: only references edges get an arrow. */
export const EDGE_ARROW_2D = { none: ['none', 'arrow'] as const, size: 9 }

/** 3D node style by role: radius / color / glow color / glow opacity. */
export const ROLE_STYLE_3D: Record<Role, { radius: number; color: string; glow: string; glowOpacity: number }> = {
  current: { radius: 9, color: '#173e59', glow: '#6d9bb0', glowOpacity: 0.25 },
  direct: { radius: 7, color: '#5f8294', glow: '#91b3bf', glowOpacity: 0.16 },
  transitive: { radius: 5.8, color: '#a9bbc2', glow: '#c2d1d5', glowOpacity: 0.1 },
  section: { radius: 5, color: '#bc8750', glow: '#d8aa76', glowOpacity: 0.12 },
  other: { radius: 4.8, color: '#9ca6a6', glow: '#c0c8c5', glowOpacity: 0.08 },
}

/** 3D edge styles. */
export const EDGE_3D = {
  contains: { color: '#b6aa9d', width: 0.42, opacity: 0.28 },
  references: { color: '#84979d', width: 0.58, opacity: 0.42 },
  referencesSelected: { color: '#587d8b', width: 1.2, opacity: 0.82 },
  arrow: { length: 1.7, relPos: 0.62, color: '#7b8d92' },
  particleWidth: 0.8,
} as const

/** 2D selected node style. */
export const SELECTED_2D = {
  borderColor: '#0d2638',
  borderWidth: 3,
  shadowBlur: 18,
  shadowOffsetY: 4,
  shadowColor: 'rgba(22,59,92,.28)',
} as const

/** 2D current-but-not-selected node style. */
export const CURRENT_2D = {
  borderWidth: 2.4,
  shadowBlur: 12,
  shadowOffsetY: 2,
  shadowColor: 'rgba(22,59,92,.16)',
} as const

/** 3D selected node adjustments. */
export const SELECTED_3D = {
  emissiveIntensity: 0.42,
  emissiveIntensityRest: 0.24,
  glowOpacity: 0.3,
} as const

/** §8.2 canvas background (.stage-body). */
export const STAGE_BACKGROUND =
  'radial-gradient(900px 460px at 50% -10%, #ffffff 0%, #fbfaf8 56%, #f1efe9 100%)'

/** §8.2 concentric rings (2D ECharts graphic). */
export const RING_INNER = { stroke: 'rgba(75,123,151,.18)', dash: [4, 5] } as const
export const RING_OUTER = { stroke: 'rgba(156,179,193,.20)', dash: [4, 6] } as const
export const RING_LABEL_INNER = { text: '直接影响', color: 'rgba(75,123,151,.55)' } as const
export const RING_LABEL_OUTER = { text: '传递影响', color: 'rgba(112,135,147,.46)' } as const

/** 2D label font sizes. */
export const FONT_2D = {
  current: 11.5,
  other: 10.2,
  section: 10,
  ring: 10,
} as const

/** Mini graph label font sizes (§8.3). */
export const FONT_MINI = { current: 9.7, other: 9 } as const
