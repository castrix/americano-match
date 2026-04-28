import type { FairnessEntry, FairnessMap, LeaderboardEntry, Player, Round } from '../types'
import { createId, isScoreComplete } from './state'

interface MatchChoice {
  teamA: string[]
  teamB: string[]
  group: string[]
  score: number
}

function bumpCount(bucket: Record<string, number>, key: string) {
  bucket[key] = (bucket[key] ?? 0) + 1
}

function createFairnessEntry(): FairnessEntry {
  return { assigned: 0, rests: 0, lastRound: -1, partnerCounts: {}, opponentCounts: {} }
}

export function buildFairness(players: Player[], rounds: Round[]): FairnessMap {
  const fairness = Object.fromEntries(players.map((player) => [player.id, createFairnessEntry()])) as FairnessMap

  rounds.forEach((round, roundIndex) => {
    round.resting?.forEach((playerId) => {
      if (fairness[playerId]) {
        fairness[playerId].rests += 1
      }
    })

    round.matches.forEach((match) => {
      const participants = [...match.teamA, ...match.teamB]

      participants.forEach((playerId) => {
        if (!fairness[playerId]) {
          fairness[playerId] = createFairnessEntry()
        }

        fairness[playerId].assigned += 1
        fairness[playerId].lastRound = roundIndex
      })

      match.teamA.forEach((playerId) => {
        match.teamA
          .filter((partnerId) => partnerId !== playerId)
          .forEach((partnerId) => bumpCount(fairness[playerId].partnerCounts, partnerId))
        match.teamB.forEach((opponentId) => bumpCount(fairness[playerId].opponentCounts, opponentId))
      })

      match.teamB.forEach((playerId) => {
        match.teamB
          .filter((partnerId) => partnerId !== playerId)
          .forEach((partnerId) => bumpCount(fairness[playerId].partnerCounts, partnerId))
        match.teamA.forEach((opponentId) => bumpCount(fairness[playerId].opponentCounts, opponentId))
      })
    })
  })

  return fairness
}

export function buildLeaderboard(players: Player[], rounds: Round[]): LeaderboardEntry[] {
  const stats = Object.fromEntries(
    players.map((player) => [
      player.id,
      {
        id: player.id,
        name: player.name,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        netPoints: 0,
        avgPointsFor: 0,
        avgNetPoints: 0,
      },
    ]),
  ) as Record<string, LeaderboardEntry>

  rounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (!isScoreComplete(match)) {
        return
      }

      const scoreA = Number(match.scoreA)
      const scoreB = Number(match.scoreB)

      const recordResult = (team: string[], teamScore: number, otherScore: number) => {
        team.forEach((playerId) => {
          if (!stats[playerId]) {
            stats[playerId] = {
              id: playerId,
              name: 'Player',
              played: 0,
              wins: 0,
              losses: 0,
              pointsFor: 0,
              pointsAgainst: 0,
              netPoints: 0,
              avgPointsFor: 0,
              avgNetPoints: 0,
            }
          }

          stats[playerId].played += 1
          stats[playerId].pointsFor += teamScore
          stats[playerId].pointsAgainst += otherScore
          stats[playerId].netPoints = stats[playerId].pointsFor - stats[playerId].pointsAgainst

          if (teamScore > otherScore) {
            stats[playerId].wins += 1
          } else {
            stats[playerId].losses += 1
          }
        })
      }

      recordResult(match.teamA, scoreA, scoreB)
      recordResult(match.teamB, scoreB, scoreA)
    })
  })

  Object.values(stats).forEach((player) => {
    if (player.played > 0) {
      player.avgPointsFor = player.pointsFor / player.played
      player.avgNetPoints = player.netPoints / player.played
    }
  })

  return Object.values(stats).sort((playerA, playerB) => {
    if (playerB.pointsFor !== playerA.pointsFor) {
      return playerB.pointsFor - playerA.pointsFor
    }
    if (playerB.netPoints !== playerA.netPoints) {
      return playerB.netPoints - playerA.netPoints
    }
    if (playerB.played !== playerA.played) {
      return playerB.played - playerA.played
    }
    if (playerB.wins !== playerA.wins) {
      return playerB.wins - playerA.wins
    }
    return playerA.name.localeCompare(playerB.name)
  })
}

export function getAmericanoStrengthRating(player: LeaderboardEntry | undefined) {
  if (!player || player.played <= 0) {
    return 0
  }

  const averagePointsFor = player.pointsFor / player.played
  const averagePointsAgainst = player.pointsAgainst / player.played
  const averageNet = averagePointsFor - averagePointsAgainst
  const winRate = player.wins / player.played
  const sampleWeight = Math.min(player.played, 4) / 4

  return (averagePointsFor * 0.6 + averageNet * 1.4 + winRate * 8) * sampleWeight
}

function getCombinations(items: string[], size: number): string[][] {
  if (size > items.length) {
    return []
  }

  const combinations: string[][] = []
  const stack: string[] = []

  function walk(startIndex: number) {
    if (stack.length === size) {
      combinations.push([...stack])
      return
    }

    for (let index = startIndex; index <= items.length - (size - stack.length); index += 1) {
      stack.push(items[index])
      walk(index + 1)
      stack.pop()
    }
  }

  walk(0)
  return combinations
}

function getRelationCount(fairness: FairnessMap, sourceId: string, relationKey: 'partnerCounts' | 'opponentCounts', targetId: string) {
  return fairness[sourceId]?.[relationKey]?.[targetId] ?? 0
}

function chooseRoundParticipants(players: Player[], fairness: FairnessMap, slotCount: number, roundIndex: number) {
  if (slotCount >= players.length) {
    return players.map((player) => player.id)
  }

  const restSlots = players.length - slotCount

  const playersToRest = [...players]
    .sort((playerA, playerB) => {
      const playerAFairness = fairness[playerA.id] ?? { assigned: 0, rests: 0, lastRound: -1 }
      const playerBFairness = fairness[playerB.id] ?? { assigned: 0, rests: 0, lastRound: -1 }

      if (playerAFairness.assigned !== playerBFairness.assigned) {
        return playerBFairness.assigned - playerAFairness.assigned
      }
      if (playerAFairness.lastRound !== playerBFairness.lastRound) {
        return playerBFairness.lastRound - playerAFairness.lastRound
      }
      if (playerAFairness.rests !== playerBFairness.rests) {
        return playerAFairness.rests - playerBFairness.rests
      }

      return playerA.name.localeCompare(playerB.name)
    })
    .slice(0, restSlots)

  const restingIdSet = new Set(playersToRest.map((player) => player.id))

  return players.filter((player) => !restingIdSet.has(player.id)).map((player) => player.id)
}

function scoreMatchup(teamA: string[], teamB: string[], fairness: FairnessMap, ratingMap: Record<string, number>) {
  const teamARepeatCount = getRelationCount(fairness, teamA[0], 'partnerCounts', teamA[1])
  const teamBRepeatCount = getRelationCount(fairness, teamB[0], 'partnerCounts', teamB[1])
  const partnerPenalty =
    (teamARepeatCount > 0 ? 90 + teamARepeatCount * 55 : 0) +
    (teamBRepeatCount > 0 ? 90 + teamBRepeatCount * 55 : 0)

  const opponentPenalty = teamA.reduce(
    (sum, playerId) =>
      sum +
      teamB.reduce(
        (innerSum, opponentId) => innerSum + getRelationCount(fairness, playerId, 'opponentCounts', opponentId) * 4,
        0,
      ),
    0,
  )

  const teamARating = teamA.reduce((sum, playerId) => sum + (ratingMap[playerId] ?? 0), 0)
  const teamBRating = teamB.reduce((sum, playerId) => sum + (ratingMap[playerId] ?? 0), 0)
  const balancePenalty = Math.abs(teamARating - teamBRating) * 0.35

  const assignmentCounts = [...teamA, ...teamB].map((playerId) => fairness[playerId]?.assigned ?? 0)
  const spreadPenalty = Math.max(...assignmentCounts) - Math.min(...assignmentCounts)

  return partnerPenalty + opponentPenalty + balancePenalty + spreadPenalty
}

function chooseBestMatch(
  remainingIds: string[],
  fairness: FairnessMap,
  ratingMap: Record<string, number>,
): MatchChoice | null {
  if (remainingIds.length < 4) {
    return null
  }

  const anchorOptions = remainingIds.slice(0, Math.min(remainingIds.length - 3, 4))
  let bestChoice: MatchChoice | null = null

  anchorOptions.forEach((anchor) => {
    const trioPool = remainingIds.filter((playerId) => playerId !== anchor)
    const trioOptions = getCombinations(trioPool, 3)

    trioOptions.forEach((trio) => {
      const group = [anchor, ...trio]
      const splitOptions = [
        { teamA: [group[0], group[1]], teamB: [group[2], group[3]] },
        { teamA: [group[0], group[2]], teamB: [group[1], group[3]] },
        { teamA: [group[0], group[3]], teamB: [group[1], group[2]] },
      ]

      splitOptions.forEach((split) => {
        const score = scoreMatchup(split.teamA, split.teamB, fairness, ratingMap)

        if (!bestChoice || score < bestChoice.score) {
          bestChoice = {
            ...split,
            group,
            score,
          }
        }
      })
    })
  })

  return bestChoice
}

export function createRound(players: Player[], rounds: Round[], courtCount: number, leaderboard: LeaderboardEntry[]) {
  const playableCourts = Math.min(Math.max(1, Number(courtCount) || 1), Math.floor(players.length / 4))

  if (playableCourts === 0) {
    return null
  }

  const fairness = buildFairness(players, rounds)
  const ratingMap = Object.fromEntries(leaderboard.map((player) => [player.id, getAmericanoStrengthRating(player)]))

  const selectedIds = chooseRoundParticipants(players, fairness, playableCourts * 4, rounds.length)
  const selectedIdSet = new Set(selectedIds)
  const restingIds = players.filter((player) => !selectedIdSet.has(player.id)).map((player) => player.id)

  let remainingIds = [...selectedIds].sort((playerAId, playerBId) => {
    const playerAFairness = fairness[playerAId] ?? { assigned: 0, rests: 0, lastRound: -1 }
    const playerBFairness = fairness[playerBId] ?? { assigned: 0, rests: 0, lastRound: -1 }

    if (playerAFairness.assigned !== playerBFairness.assigned) {
      return playerAFairness.assigned - playerBFairness.assigned
    }
    if (playerAFairness.lastRound !== playerBFairness.lastRound) {
      return playerAFairness.lastRound - playerBFairness.lastRound
    }
    return playerAId.localeCompare(playerBId)
  })

  const matches = []

  for (let court = 1; court <= playableCourts; court += 1) {
    const bestMatch = chooseBestMatch(remainingIds, fairness, ratingMap)

    if (!bestMatch) {
      break
    }

    const { teamA, teamB, group } = bestMatch

    matches.push({
      id: createId(),
      court,
      teamA,
      teamB,
      scoreA: '',
      scoreB: '',
      completed: false,
    })

    remainingIds = remainingIds.filter((playerId) => !group.includes(playerId))
  }

  if (matches.length === 0) {
    return null
  }

  return {
    id: createId(),
    label: `Round ${rounds.length + 1}`,
    createdAt: new Date().toISOString(),
    resting: [...new Set([...restingIds, ...remainingIds])],
    matches,
  }
}
