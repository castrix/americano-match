import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import {
  DEFAULT_STATE,
  ROUND_MINUTES_BY_SKILL_LEVEL,
  ROUND_TRANSITION_MINUTES,
  SHARE_KEY,
  SHARE_STATE_VERSION,
  STORAGE_KEY,
} from '../constants'
import type { AppState, Match, Player, Round, ShareableState, SharedMatchTuple } from '../types'

export function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function clampSkillLevel(value: unknown) {
  const nextValue = Math.round(Number(value) || DEFAULT_STATE.skillLevel)
  return Math.min(5, Math.max(1, nextValue))
}

export function isScoreComplete(match: Pick<Match, 'scoreA' | 'scoreB'>) {
  const scoreA = Number(match.scoreA)
  const scoreB = Number(match.scoreB)

  return match.scoreA !== '' && match.scoreB !== '' && Number.isFinite(scoreA) && Number.isFinite(scoreB)
}

export function toMatchScore(value: string | number | null | undefined) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : 0
}

export function normalizeState(candidate: unknown): AppState {
  const source = candidate as Partial<AppState> | null | undefined
  const players: Player[] = Array.isArray(source?.players)
    ? source.players
        .filter((player): player is Player => Boolean(player) && typeof player.name === 'string')
        .map((player) => ({
          id: typeof player.id === 'string' && player.id ? player.id : createId(),
          name: player.name.trim(),
        }))
        .filter((player) => player.name)
    : DEFAULT_STATE.players

  const rounds: Round[] = Array.isArray(source?.rounds)
    ? source.rounds
        .filter((round): round is Round => Boolean(round) && Array.isArray(round.matches))
        .map((round, index) => {
          const matches = round.matches
            .filter((match): match is Match => Boolean(match) && Array.isArray(match.teamA) && Array.isArray(match.teamB))
            .map((match, matchIndex) => {
              const nextMatch = {
                id: typeof match.id === 'string' && match.id ? match.id : createId(),
                court: Math.max(1, Number(match.court) || matchIndex + 1),
                teamA: match.teamA.filter((playerId): playerId is string => typeof playerId === 'string'),
                teamB: match.teamB.filter((playerId): playerId is string => typeof playerId === 'string'),
                scoreA: typeof match.scoreA === 'number' ? String(match.scoreA) : (match.scoreA ?? ''),
                scoreB: typeof match.scoreB === 'number' ? String(match.scoreB) : (match.scoreB ?? ''),
              }

              return {
                ...nextMatch,
                completed: isScoreComplete(nextMatch),
              }
            })

          return {
            id: typeof round.id === 'string' && round.id ? round.id : createId(),
            label: typeof round.label === 'string' && round.label ? round.label : `Round ${index + 1}`,
            createdAt:
              typeof round.createdAt === 'string' && round.createdAt ? round.createdAt : new Date().toISOString(),
            resting: Array.isArray(round.resting)
              ? round.resting.filter((playerId): playerId is string => typeof playerId === 'string')
              : [],
            matches,
          }
        })
    : DEFAULT_STATE.rounds

  return {
    players,
    courtCount: Math.max(1, Number(source?.courtCount) || DEFAULT_STATE.courtCount),
    skillLevel: clampSkillLevel(source?.skillLevel),
    rounds,
  }
}

export function serializeStateForShare(state: AppState): ShareableState {
  const playerIdToIndex = Object.fromEntries(state.players.map((player, index) => [player.id, index]))

  const compactRounds: SharedMatchTuple[][] = state.rounds.map((round) =>
    round.matches.map((match) => {
      const teamA = match.teamA.map((playerId) => playerIdToIndex[playerId]).filter(Number.isInteger)
      const teamB = match.teamB.map((playerId) => playerIdToIndex[playerId]).filter(Number.isInteger)

      return [
        Math.max(1, Number(match.court) || 1),
        teamA[0] ?? -1,
        teamA[1] ?? -1,
        teamB[0] ?? -1,
        teamB[1] ?? -1,
        match.scoreA === '' ? null : Math.max(0, Number(match.scoreA) || 0),
        match.scoreB === '' ? null : Math.max(0, Number(match.scoreB) || 0),
      ]
    }),
  )

  return {
    v: SHARE_STATE_VERSION,
    p: state.players.map((player) => player.name),
    c: Math.max(1, Number(state.courtCount) || 1),
    s: clampSkillLevel(state.skillLevel),
    r: compactRounds,
  }
}

export function deserializeSharedState(candidate: unknown): AppState | null {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const source = candidate as Partial<ShareableState>

  if (Number(source.v) !== SHARE_STATE_VERSION || !Array.isArray(source.p) || !Array.isArray(source.r)) {
    return null
  }

  const players = source.p
    .filter((name): name is string => typeof name === 'string')
    .map((name) => ({ id: createId(), name: name.trim() }))
    .filter((player) => player.name)

  const playerIds = players.map((player) => player.id)

  const rounds: Round[] = source.r
    .filter((roundMatches): roundMatches is ShareableState['r'][number] => Array.isArray(roundMatches))
    .map((roundMatches, roundIndex) => {
      const matches = roundMatches
        .filter((entry): entry is ShareableState['r'][number][number] => Array.isArray(entry) && entry.length >= 7)
        .map((entry, matchIndex) => {
          const [courtRaw, a0, a1, b0, b1, scoreARaw, scoreBRaw] = entry
          const teamA = [a0, a1]
            .filter((indexValue) => Number.isInteger(indexValue) && indexValue >= 0 && indexValue < playerIds.length)
            .map((indexValue) => playerIds[indexValue])
          const teamB = [b0, b1]
            .filter((indexValue) => Number.isInteger(indexValue) && indexValue >= 0 && indexValue < playerIds.length)
            .map((indexValue) => playerIds[indexValue])

          const nextMatch = {
            id: createId(),
            court: Math.max(1, Number(courtRaw) || matchIndex + 1),
            teamA,
            teamB,
            scoreA: Number.isFinite(scoreARaw) ? String(Math.max(0, Number(scoreARaw))) : '',
            scoreB: Number.isFinite(scoreBRaw) ? String(Math.max(0, Number(scoreBRaw))) : '',
          }

          return {
            ...nextMatch,
            completed: isScoreComplete(nextMatch),
          }
        })

      const playingIds = new Set(matches.flatMap((match) => [...match.teamA, ...match.teamB]))
      const resting = playerIds.filter((playerId) => !playingIds.has(playerId))

      return {
        id: createId(),
        label: `Round ${roundIndex + 1}`,
        createdAt: new Date().toISOString(),
        resting,
        matches,
      }
    })

  return {
    players,
    courtCount: Math.max(1, Number(source.c) || 1),
    skillLevel: clampSkillLevel(source.s),
    rounds,
  }
}

export function encodeShareState(state: AppState) {
  if (typeof window === 'undefined') {
    return ''
  }

  return compressToEncodedURIComponent(JSON.stringify(serializeStateForShare(state))) || ''
}

export function decodeShareState(payload: string | null) {
  if (typeof window === 'undefined' || !payload) {
    return null
  }

  try {
    const decompressed = decompressFromEncodedURIComponent(payload)

    if (!decompressed) {
      return null
    }

    const compact = deserializeSharedState(JSON.parse(decompressed))

    if (!compact) {
      return null
    }

    return normalizeState(compact)
  } catch {
    return null
  }
}

export function getSharePayloadFromUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const queryParams = new URLSearchParams(window.location.search)

  return hashParams.get(SHARE_KEY) || queryParams.get(SHARE_KEY)
}

export function loadSharedState() {
  const payload = getSharePayloadFromUrl()

  if (!payload) {
    return null
  }

  return decodeShareState(payload)
}

export function createShareUrl(state: AppState) {
  if (typeof window === 'undefined') {
    return ''
  }

  const payload = encodeShareState(state)

  if (!payload) {
    return ''
  }

  return `${window.location.origin}${window.location.pathname}#${SHARE_KEY}=${payload}`
}

export function loadState() {
  if (typeof window === 'undefined') {
    return DEFAULT_STATE
  }

  try {
    const savedState = window.localStorage.getItem(STORAGE_KEY)

    if (!savedState) {
      return DEFAULT_STATE
    }

    const parsedState = JSON.parse(savedState)

    return normalizeState(parsedState)
  } catch {
    return DEFAULT_STATE
  }
}

export function saveState(nextState: AppState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
}

export function getServeWindowByTurn(turnNumber: number) {
  if (turnNumber <= 20) {
    const blockStart = Math.floor((turnNumber - 1) / 5) * 5 + 1
    const blockEnd = blockStart + 4
    return `Serve block ${blockStart}-${blockEnd}`
  }

  return 'Turn 21 decider'
}

export function getServePositionByTurn(turnNumber: number) {
  const positionInBlock = ((turnNumber - 1) % 5) + 1
  return positionInBlock % 2 === 1 ? 'Right' : 'Left'
}

export function getMatchTurnsPassed(match: Pick<Match, 'scoreA' | 'scoreB'>) {
  return toMatchScore(match.scoreA) + toMatchScore(match.scoreB)
}

export function formatStamp(timestamp: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function getEstimatedRoundMinutes(skillLevel: number) {
  return ROUND_MINUTES_BY_SKILL_LEVEL[clampSkillLevel(skillLevel)] ?? ROUND_MINUTES_BY_SKILL_LEVEL[3]
}

export function getEstimatedTournamentRounds(playerCount: number, courtCount: number) {
  const safePlayerCount = Math.max(0, Number(playerCount) || 0)
  const playableCourts = Math.min(Math.max(1, Number(courtCount) || 1), Math.floor(safePlayerCount / 4))

  if (safePlayerCount < 4 || playableCourts === 0) {
    return 0
  }

  return Math.ceil((safePlayerCount * Math.max(safePlayerCount - 1, 0)) / (playableCourts * 4))
}

export function getEstimatedTournamentDurationMinutes(playerCount: number, courtCount: number, skillLevel: number) {
  const estimatedRounds = getEstimatedTournamentRounds(playerCount, courtCount)

  if (estimatedRounds === 0) {
    return 0
  }

  return estimatedRounds * (getEstimatedRoundMinutes(skillLevel) + ROUND_TRANSITION_MINUTES)
}

export function formatDuration(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60

  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}
