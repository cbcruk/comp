import { Theme } from '@astryxdesign/core/theme'
import type { DefinedTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import type { JSX, ReactNode } from 'react'

export interface AdminThemeProps {
  /**
   * Design tokens for the admin. Defaults to Astryx's neutral theme; pass
   * another `@astryxdesign/theme-*`, or one from `defineTheme`, to retheme
   * without touching a component.
   */
  theme?: DefinedTheme
  /** Colour mode; `system` follows the OS preference. */
  mode?: 'light' | 'dark' | 'system'
  children: ReactNode
}

/**
 * The design system, applied.
 *
 * Comp provides the admin's look rather than leaving each app to bring one.
 * The first consumer of the headless version copied the example stylesheet and
 * scoped it by hand, which is what "bring your own styles" means in practice —
 * so this is Django's answer and react-admin's: an admin that already looks
 * like something, themeable from the outside.
 *
 * Apps do not import Astryx to use it. They import this and one stylesheet, so
 * which design system is underneath stays Comp's business and can change
 * without every consumer editing imports.
 */
export function AdminTheme({
  theme = neutralTheme,
  mode,
  children,
}: AdminThemeProps): JSX.Element {
  return (
    <Theme theme={theme} {...(mode ? { mode } : {})}>
      {children}
    </Theme>
  )
}
