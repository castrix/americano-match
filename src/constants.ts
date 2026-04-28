import type { AppState } from './types'

export const STORAGE_KEY = 'americano-match-state-v1'
export const SHARE_KEY = 'share'
export const SHARE_STATE_VERSION = 3
export const APP_PUBLIC_URL = 'https://castrix.github.io/americano-match/'
export const GITHUB_PROFILE_URL = 'https://github.com/castrix'
export const SKILL_LEVEL_OPTIONS = [1, 2, 3, 4, 5] as const
export const ROUND_MINUTES_BY_SKILL_LEVEL: Record<number, number> = {
  1: 5,
  2: 7,
  3: 9,
  4: 11,
  5: 13,
}
export const ROUND_TRANSITION_MINUTES = 3
export const DEFAULT_STATE: AppState = {
  players: [],
  courtCount: 1,
  skillLevel: 1,
  rounds: [],
}
