export interface Player {
  id: string
  name: string
}

export interface Match {
  id: string
  court: number
  teamA: string[]
  teamB: string[]
  scoreA: string
  scoreB: string
  completed: boolean
}

export interface Round {
  id: string
  label: string
  createdAt: string
  resting: string[]
  matches: Match[]
}

export interface AppState {
  players: Player[]
  courtCount: number
  skillLevel: number
  rounds: Round[]
}

export interface FairnessEntry {
  assigned: number
  rests: number
  lastRound: number
  partnerCounts: Record<string, number>
  opponentCounts: Record<string, number>
}

export type FairnessMap = Record<string, FairnessEntry>

export interface LeaderboardEntry {
  id: string
  name: string
  played: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  netPoints: number
  avgPointsFor: number
  avgNetPoints: number
}

export type SharedMatchTuple = [number, number, number, number, number, number | null, number | null]

export interface ShareableState {
  v: number
  p: string[]
  c: number
  s: number
  r: SharedMatchTuple[][]
}
