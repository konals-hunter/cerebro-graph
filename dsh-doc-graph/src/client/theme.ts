/**
 * §8.1 host-theme bridge: read the six DSH `--dsw-alias-*` design tokens off
 * `document.body` and expose them as CSS custom properties for the drawer and
 * cards. Graph-only colors are plugin-owned (palette.ts) and never flip.
 */
const TOKEN_BRIDGE: readonly (readonly [string, string])[] = [
  ['label-primary', '--dsw-alias-label-primary'],
  ['bg-layer-1', '--dsw-alias-bg-layer-1'],
  ['label-caption', '--dsw-alias-label-caption'],
  ['border-l2', '--dsw-alias-border-l2'],
  ['brand-primary', '--dsw-alias-brand-primary-new-colorprimary-new-color'],
  ['label-primary-inverted', '--dsw-alias-label-primary-inverted'],
]

export interface ResolvedTheme {
  themeVars: Record<string, string>
  colorScheme: 'light' | 'dark'
}

export function resolveTheme(): ResolvedTheme {
  const computed = getComputedStyle(document.body)
  const themeVars: Record<string, string> = {}
  for (const [frameName, hostToken] of TOKEN_BRIDGE) {
    themeVars[frameName] = computed.getPropertyValue(hostToken)
  }
  const scheme = computed.colorScheme
  const colorScheme = scheme.includes('dark') && !scheme.includes('light')
    ? 'dark'
    : scheme.includes('light') && !scheme.includes('dark')
      ? 'light'
      : document.body.hasAttribute('data-ds-dark-theme')
        ? 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return { themeVars, colorScheme }
}
