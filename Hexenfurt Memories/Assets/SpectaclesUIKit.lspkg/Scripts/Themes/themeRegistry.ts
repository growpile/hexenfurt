import {HexenfurtTheme} from "./Hexenfurt/HexenfurtTheme"
import {SnapOS2} from "./SnapOS-2.0/SnapOS2"
import {Theme} from "./Theme"

export const THEME_SNAPOS2 = "SnapOS2"
export const THEME_HEXENFURT = "Hexenfurt"

const THEMES: Record<string, Theme> = {
  [THEME_SNAPOS2]: SnapOS2,
  [THEME_HEXENFURT]: HexenfurtTheme
}

/**
 * Resolve a UIKit Theme by Inspector name; unknown names fall back to SnapOS2.
 */
export function getTheme(themeName: string | undefined): Theme {
  if (themeName === undefined || themeName === "" || themeName === THEME_SNAPOS2) {
    return SnapOS2
  }
  const t = THEMES[themeName]
  if (!t) {
    print(`SpectaclesUIKit: unknown theme "${themeName}", using ${THEME_SNAPOS2}`)
    return SnapOS2
  }
  return t
}
