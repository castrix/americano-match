import { useEffect, useMemo, useState } from 'react'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import './App.css'

const STORAGE_KEY = 'americano-match-state-v1'
const SHARE_KEY = 'share'
const SHARE_STATE_VERSION = 3
const APP_PUBLIC_URL = 'https://castrix.github.io/americano-match/'
const GITHUB_PROFILE_URL = 'https://github.com/castrix'
const SKILL_LEVEL_OPTIONS = [1, 2, 3, 4, 5]
const ROUND_MINUTES_BY_SKILL_LEVEL = {
  1: 5,
  2: 7,
  3: 9,
  4: 11,
  5: 13,
}
const ROUND_TRANSITION_MINUTES = 3
const DEFAULT_STATE = {
  players: [],
  courtCount: 1,
  skillLevel: 1,
  rounds: [],
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clampSkillLevel(value) {
  const nextValue = Math.round(Number(value) || DEFAULT_STATE.skillLevel)
  return Math.min(5, Math.max(1, nextValue))
}

function normalizeState(candidate) {
  const players = Array.isArray(candidate?.players)
    ? candidate.players
        .filter((player) => player && typeof player.name === 'string')
        .map((player) => ({
          id: typeof player.id === 'string' && player.id ? player.id : createId(),
          name: player.name.trim(),
        }))
        .filter((player) => player.name)
    : DEFAULT_STATE.players

  const rounds = Array.isArray(candidate?.rounds)
    ? candidate.rounds
        .filter((round) => round && Array.isArray(round.matches))
        .map((round, index) => {
          const matches = round.matches
            .filter((match) => match && Array.isArray(match.teamA) && Array.isArray(match.teamB))
            .map((match, matchIndex) => {
              const nextMatch = {
                id: typeof match.id === 'string' && match.id ? match.id : createId(),
                court: Math.max(1, Number(match.court) || matchIndex + 1),
                teamA: match.teamA.filter((playerId) => typeof playerId === 'string'),
                teamB: match.teamB.filter((playerId) => typeof playerId === 'string'),
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
              ? round.resting.filter((playerId) => typeof playerId === 'string')
              : [],
            matches,
          }
        })
    : DEFAULT_STATE.rounds

  return {
    players,
    courtCount: Math.max(1, Number(candidate?.courtCount) || DEFAULT_STATE.courtCount),
    skillLevel: clampSkillLevel(candidate?.skillLevel),
    rounds,
  }
}

function serializeStateForShare(state) {
  const playerIdToIndex = Object.fromEntries(state.players.map((player, index) => [player.id, index]))

  const compactRounds = state.rounds.map((round) =>
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

function deserializeSharedState(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  if (Number(candidate.v) !== SHARE_STATE_VERSION || !Array.isArray(candidate.p) || !Array.isArray(candidate.r)) {
    return null
  }

  const players = candidate.p
    .filter((name) => typeof name === 'string')
    .map((name) => ({ id: createId(), name: name.trim() }))
    .filter((player) => player.name)

  const playerIds = players.map((player) => player.id)

  const rounds = candidate.r
    .filter((roundMatches) => Array.isArray(roundMatches))
    .map((roundMatches, roundIndex) => {
      const matches = roundMatches
        .filter((entry) => Array.isArray(entry) && entry.length >= 7)
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
    courtCount: Math.max(1, Number(candidate.c) || 1),
    skillLevel: clampSkillLevel(candidate.s),
    rounds,
  }
}

function encodeShareState(state) {
  if (typeof window === 'undefined') {
    return ''
  }

  return compressToEncodedURIComponent(JSON.stringify(serializeStateForShare(state))) || ''
}

function decodeShareState(payload) {
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

function getSharePayloadFromUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const queryParams = new URLSearchParams(window.location.search)

  return hashParams.get(SHARE_KEY) || queryParams.get(SHARE_KEY)
}

function loadSharedState() {
  const payload = getSharePayloadFromUrl()

  if (!payload) {
    return null
  }

  return decodeShareState(payload)
}

function createShareUrl(state) {
  if (typeof window === 'undefined') {
    return ''
  }

  const payload = encodeShareState(state)

  if (!payload) {
    return ''
  }

  return `${window.location.origin}${window.location.pathname}#${SHARE_KEY}=${payload}`
}

function loadState() {
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

function saveState(nextState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
}

function isScoreComplete(match) {
  const scoreA = Number(match.scoreA)
  const scoreB = Number(match.scoreB)

  return match.scoreA !== '' && match.scoreB !== '' && Number.isFinite(scoreA) && Number.isFinite(scoreB)
}

function toMatchScore(value) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : 0
}

function getServeWindowByTurn(turnNumber) {
  if (turnNumber <= 20) {
    const blockStart = Math.floor((turnNumber - 1) / 5) * 5 + 1
    const blockEnd = blockStart + 4
    return `Serve block ${blockStart}-${blockEnd}`
  }

  return 'Turn 21 decider'
}

function getServePositionByTurn(turnNumber) {
  const positionInBlock = ((turnNumber - 1) % 5) + 1
  return positionInBlock % 2 === 1 ? 'Right' : 'Left'
}

function getMatchTurnsPassed(match) {
  return toMatchScore(match.scoreA) + toMatchScore(match.scoreB)
}

function bumpCount(bucket, key) {
  bucket[key] = (bucket[key] ?? 0) + 1
}

function buildFairness(players, rounds) {
  const fairness = Object.fromEntries(
    players.map((player) => [
      player.id,
      { assigned: 0, rests: 0, lastRound: -1, partnerCounts: {}, opponentCounts: {} },
    ]),
  )

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
          fairness[playerId] = {
            assigned: 0,
            rests: 0,
            lastRound: -1,
            partnerCounts: {},
            opponentCounts: {},
          }
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

function buildLeaderboard(players, rounds) {
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
  )

  rounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (!isScoreComplete(match)) {
        return
      }

      const scoreA = Number(match.scoreA)
      const scoreB = Number(match.scoreB)

      const recordResult = (team, teamScore, otherScore) => {
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

function getAmericanoStrengthRating(player) {
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

function getCombinations(items, size) {
  if (size > items.length) {
    return []
  }

  const combinations = []
  const stack = []

  function walk(startIndex) {
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

function getRelationCount(fairness, sourceId, relationKey, targetId) {
  return fairness[sourceId]?.[relationKey]?.[targetId] ?? 0
}

function scoreParticipantSelection(playerIds, fairness, roundIndex) {
  const assignedCounts = playerIds.map((playerId) => fairness[playerId]?.assigned ?? 0)
  const minAssigned = Math.min(...assignedCounts)
  const maxAssigned = Math.max(...assignedCounts)
  const assignmentSpreadPenalty = (maxAssigned - minAssigned) * 60

  const assignmentLoadPenalty = playerIds.reduce((sum, playerId) => {
    const assigned = fairness[playerId]?.assigned ?? 0
    return sum + Math.max(0, assigned - minAssigned) * 24
  }, 0)

  const recentRoundPenalty = playerIds.reduce((sum, playerId) => {
    const lastRound = fairness[playerId]?.lastRound ?? -1
    return sum + (lastRound === roundIndex - 1 ? 14 : 0)
  }, 0)

  let repeatedInteractionPenalty = 0

  for (let left = 0; left < playerIds.length; left += 1) {
    for (let right = left + 1; right < playerIds.length; right += 1) {
      const playerAId = playerIds[left]
      const playerBId = playerIds[right]
      const priorInteractions =
        getRelationCount(fairness, playerAId, 'partnerCounts', playerBId) +
        getRelationCount(fairness, playerAId, 'opponentCounts', playerBId)

      repeatedInteractionPenalty += priorInteractions * 18
    }
  }

  return assignmentSpreadPenalty + assignmentLoadPenalty + recentRoundPenalty + repeatedInteractionPenalty
}

function chooseRoundParticipants(players, fairness, slotCount, roundIndex) {
  if (slotCount >= players.length) {
    return players.map((player) => player.id)
  }

  const restSlots = players.length - slotCount

  const playersToRest = [...players]
    .sort((playerA, playerB) => {
      const playerAFairness = fairness[playerA.id] ?? { assigned: 0, rests: 0, lastRound: -1 }
      const playerBFairness = fairness[playerB.id] ?? { assigned: 0, rests: 0, lastRound: -1 }

      // More-assigned players should be benched first.
      if (playerAFairness.assigned !== playerBFairness.assigned) {
        return playerBFairness.assigned - playerAFairness.assigned
      }
      // If assignment load ties, bench those who played most recently.
      if (playerAFairness.lastRound !== playerBFairness.lastRound) {
        return playerBFairness.lastRound - playerAFairness.lastRound
      }
      // Preserve rotation by benching players with fewer past rests first.
      if (playerAFairness.rests !== playerBFairness.rests) {
        return playerAFairness.rests - playerBFairness.rests
      }

      return playerA.name.localeCompare(playerB.name)
    })
    .slice(0, restSlots)

  const restingIdSet = new Set(playersToRest.map((player) => player.id))

  return players.filter((player) => !restingIdSet.has(player.id)).map((player) => player.id)
}

function scoreMatchup(teamA, teamB, fairness, ratingMap) {
  const teamARepeatCount = getRelationCount(fairness, teamA[0], 'partnerCounts', teamA[1])
  const teamBRepeatCount = getRelationCount(fairness, teamB[0], 'partnerCounts', teamB[1])
  const partnerPenalty =
    (teamARepeatCount > 0 ? 90 + teamARepeatCount * 55 : 0) +
    (teamBRepeatCount > 0 ? 90 + teamBRepeatCount * 55 : 0)

  const opponentPenalty = teamA.reduce(
    (sum, playerId) =>
      sum +
      teamB.reduce(
        (innerSum, opponentId) =>
          innerSum + getRelationCount(fairness, playerId, 'opponentCounts', opponentId) * 4,
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

function chooseBestMatch(remainingIds, fairness, ratingMap) {
  if (remainingIds.length < 4) {
    return null
  }

  const anchorOptions = remainingIds.slice(0, Math.min(remainingIds.length - 3, 4))
  let bestChoice = null

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

function createRound(players, rounds, courtCount, leaderboard) {
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

    matches.push({
      id: createId(),
      court,
      teamA: bestMatch.teamA,
      teamB: bestMatch.teamB,
      scoreA: '',
      scoreB: '',
      completed: false,
    })

    remainingIds = remainingIds.filter((playerId) => !bestMatch.group.includes(playerId))
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

function formatStamp(timestamp) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function getEstimatedRoundMinutes(skillLevel) {
  return ROUND_MINUTES_BY_SKILL_LEVEL[clampSkillLevel(skillLevel)] ?? ROUND_MINUTES_BY_SKILL_LEVEL[3]
}

function getEstimatedTournamentRounds(playerCount, courtCount) {
  const safePlayerCount = Math.max(0, Number(playerCount) || 0)
  const playableCourts = Math.min(Math.max(1, Number(courtCount) || 1), Math.floor(safePlayerCount / 4))

  if (safePlayerCount < 4 || playableCourts === 0) {
    return 0
  }

  return Math.ceil((safePlayerCount * Math.max(safePlayerCount - 1, 0)) / (playableCourts * 4))
}

function getEstimatedTournamentDurationMinutes(playerCount, courtCount, skillLevel) {
  const estimatedRounds = getEstimatedTournamentRounds(playerCount, courtCount)

  if (estimatedRounds === 0) {
    return 0
  }

  return estimatedRounds * (getEstimatedRoundMinutes(skillLevel) + ROUND_TRANSITION_MINUTES)
}

function formatDuration(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60

  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

function toOpaqueColor(input, fallback) {
  if (!input) {
    return fallback
  }

  if (input.startsWith('rgba')) {
    const [r = '0', g = '0', b = '0'] = input
      .replace('rgba(', '')
      .replace(')', '')
      .split(',')
      .map((value) => value.trim())

    return `rgb(${r}, ${g}, ${b})`
  }

  return input
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(' ')
  const lines = []
  let currentLine = ''

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word

    if (context.measureText(nextLine).width <= maxWidth || !currentLine) {
      currentLine = nextLine
      return
    }

    lines.push(currentLine)
    currentLine = word
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  const renderedLines = lines.slice(0, maxLines)
  renderedLines.forEach((line, lineIndex) => {
    context.fillText(line, x, y + lineIndex * lineHeight)
  })

  return y + renderedLines.length * lineHeight
}

function createSharePngDataUrl(state, leaderboard, playerLookup) {
  if (typeof window === 'undefined') {
    return ''
  }

  const canvas = window.document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1920
  const context = canvas.getContext('2d')

  if (!context) {
    return ''
  }

  const rootStyles = window.getComputedStyle(window.document.documentElement)
  const bgColor = toOpaqueColor(rootStyles.getPropertyValue('--panel-strong').trim(), 'rgb(13, 26, 40)')
  const panelColor = toOpaqueColor(rootStyles.getPropertyValue('--panel').trim(), 'rgb(9, 19, 31)')
  const primaryColor = rootStyles.getPropertyValue('--primary').trim() || '#2ee6a6'
  const softColor = rootStyles.getPropertyValue('--soft').trim() || '#dbeafe'
  const textColor = rootStyles.getPropertyValue('--text').trim() || '#eff6ff'
  const mutedColor = rootStyles.getPropertyValue('--muted').trim() || '#9db0c4'

  context.fillStyle = bgColor
  context.fillRect(0, 0, canvas.width, canvas.height)

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, 'rgba(46, 230, 166, 0.16)')
  gradient.addColorStop(0.6, 'rgba(255, 184, 77, 0.1)')
  gradient.addColorStop(1, 'rgba(125, 211, 252, 0.1)')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.fillStyle = primaryColor
  context.beginPath()
  context.arc(920, 180, 180, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = 'rgba(255, 184, 77, 0.2)'
  context.beginPath()
  context.arc(120, 1640, 220, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = panelColor
  context.fillRect(44, 44, canvas.width - 88, canvas.height - 88)

  context.fillStyle = primaryColor
  context.fillRect(44, 44, canvas.width - 88, 10)

  context.fillStyle = softColor
  context.font = '700 34px Inter, Segoe UI, sans-serif'
  context.fillText('PADEL AMERICANO', 88, 118)

  context.fillStyle = textColor
  context.font = '800 66px Inter, Segoe UI, sans-serif'
  context.fillText('LEADERBOARD', 88, 192)
  context.font = '700 38px Inter, Segoe UI, sans-serif'
  context.fillText('Snapshot', 88, 242)

  const totalMatches = state.rounds.reduce((sum, round) => sum + round.matches.length, 0)
  const completedMatches = state.rounds.reduce(
    (sum, round) => sum + round.matches.filter((match) => isScoreComplete(match)).length,
    0,
  )
  const summaryStats = [
    { label: 'Players', value: String(state.players.length) },
    { label: 'Courts', value: String(state.courtCount) },
    { label: 'Rounds', value: String(state.rounds.length) },
    { label: 'Scores', value: `${completedMatches}/${totalMatches}` },
  ]

  summaryStats.forEach((item, index) => {
    const boxWidth = 228
    const gap = 14
    const x = 88 + index * (boxWidth + gap)
    const y = 292

    context.fillStyle = 'rgba(255, 255, 255, 0.04)'
    context.fillRect(x, y, boxWidth, 136)

    context.fillStyle = mutedColor
    context.font = '600 24px Inter, Segoe UI, sans-serif'
    context.fillText(item.label, x + 20, y + 44)

    context.fillStyle = textColor
    context.font = '800 44px Inter, Segoe UI, sans-serif'
    context.fillText(item.value, x + 20, y + 100)
  })

  context.fillStyle = textColor
  context.font = '700 30px Inter, Segoe UI, sans-serif'
  context.fillText('Top Results', 88, 490)

  const topRows = leaderboard.slice(0, 10)
  let rowCursorY = 526

  topRows.forEach((player, index) => {
    const isTopThree = index < 3
    const rowHeight = isTopThree ? 116 : 84
    const rowBoxHeight = isTopThree ? 96 : 64
    const y = rowCursorY
    const rank = index + 1
    const rankLabel = `#${rank}`
    const diffValue = player.netPoints > 0 ? `+${player.netPoints}` : String(player.netPoints)

    context.fillStyle = rank === 1 ? 'rgba(46, 230, 166, 0.16)' : 'rgba(255, 255, 255, 0.04)'
    context.fillRect(88, y, 904, rowBoxHeight)

    context.fillStyle = rank === 1 ? primaryColor : softColor
    context.font = isTopThree ? '800 32px Inter, Segoe UI, sans-serif' : '800 24px Inter, Segoe UI, sans-serif'
    context.fillText(rankLabel, 116, y + (isTopThree ? 58 : 42))

    context.fillStyle = textColor
    context.font = isTopThree ? '700 34px Inter, Segoe UI, sans-serif' : '700 26px Inter, Segoe UI, sans-serif'
    const displayName = playerLookup[player.id] ?? player.name
    const clippedName = displayName.length > 18 ? `${displayName.slice(0, 18)}…` : displayName
    context.fillText(clippedName, 206, y + (isTopThree ? 48 : 34))

    context.fillStyle = mutedColor
    context.font = isTopThree ? '600 24px Inter, Segoe UI, sans-serif' : '600 18px Inter, Segoe UI, sans-serif'
    context.fillText(`W ${player.wins} · Pts ${player.pointsFor}`, 206, y + (isTopThree ? 78 : 54))

    context.fillStyle = rank === 1 ? primaryColor : textColor
    context.font = isTopThree ? '800 32px Inter, Segoe UI, sans-serif' : '800 24px Inter, Segoe UI, sans-serif'
    context.fillText(diffValue, 910, y + (isTopThree ? 58 : 42))

    rowCursorY += rowHeight
  })

  context.fillStyle = 'rgba(255, 255, 255, 0.04)'
  context.fillRect(88, canvas.height - 152, 904, 92)

  context.fillStyle = mutedColor
  context.font = '600 20px Inter, Segoe UI, sans-serif'
  context.fillText(new Date().toLocaleString(), 110, canvas.height - 108)
  context.fillStyle = softColor
  context.font = '700 28px Inter, Segoe UI, sans-serif'
  context.fillText(APP_PUBLIC_URL, 110, canvas.height - 72)

  return canvas.toDataURL('image/png')
}

async function dataUrlToFile(dataUrl, fileName) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], fileName, { type: 'image/png' })
}

function triggerDownload(dataUrl, fileName) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function App() {
  const [{ initialState, isSharedReadOnly }] = useState(() => {
    const sharedState = loadSharedState()

    if (sharedState) {
      return {
        initialState: sharedState,
        isSharedReadOnly: true,
      }
    }

    return {
      initialState: loadState(),
      isSharedReadOnly: false,
    }
  })
  const [appState, setAppState] = useState(initialState)
  const [playerName, setPlayerName] = useState('')
  const [sharePopupUrl, setSharePopupUrl] = useState(() => (isSharedReadOnly ? createShareUrl(initialState) : ''))
  const [sharePngPreviewUrl, setSharePngPreviewUrl] = useState('')
  const [isSharePopupOpen, setIsSharePopupOpen] = useState(isSharedReadOnly)
  const [isGeneratingPng, setIsGeneratingPng] = useState(false)
  const [isCopySuccess, setIsCopySuccess] = useState(false)
  const [sectionOpen, setSectionOpen] = useState(() => ({
    roster: !isSharedReadOnly,
    matches: !isSharedReadOnly,
    leaderboard: true,
  }))
  const [roundOpenById, setRoundOpenById] = useState({})
  const [statusMessage, setStatusMessage] = useState(() =>
    isSharedReadOnly
      ? 'Read-only shared session loaded from URL.'
      : 'Add players, set the courts, and generate the next fair round.',
  )

  const { players, courtCount, rounds, skillLevel } = appState

  useEffect(() => {
    if (isSharedReadOnly) {
      return
    }

    saveState(appState)
  }, [appState, isSharedReadOnly])

  const playerLookup = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player.name])),
    [players],
  )
  const fairness = useMemo(() => buildFairness(players, rounds), [players, rounds])
  const leaderboard = useMemo(() => buildLeaderboard(players, rounds), [players, rounds])

  useEffect(() => {
    if (!isSharePopupOpen) {
      return
    }

    const dataUrl = createSharePngDataUrl(appState, leaderboard, playerLookup)
    setSharePngPreviewUrl(dataUrl)
  }, [appState, leaderboard, playerLookup, isSharePopupOpen])

  const totalMatches = rounds.reduce((sum, round) => sum + round.matches.length, 0)
  const completedMatches = rounds.reduce(
    (sum, round) => sum + round.matches.filter((match) => isScoreComplete(match)).length,
    0,
  )
  const activeCourts = Math.min(courtCount, Math.floor(players.length / 4))
  const benchCount = Math.max(players.length - activeCourts * 4, 0)
  const estimatedTournamentRounds = getEstimatedTournamentRounds(players.length, courtCount)
  const estimatedDuration = formatDuration(
    rounds.length > 0
      ? rounds.length * (getEstimatedRoundMinutes(skillLevel) + ROUND_TRANSITION_MINUTES)
      : getEstimatedTournamentDurationMinutes(players.length, courtCount, skillLevel),
  )

  function showReadOnlyMessage() {
    setStatusMessage('Shared view is read-only. Open app without share URL to edit.')
  }

  function toggleSection(key) {
    setSectionOpen((currentState) => ({
      ...currentState,
      [key]: !currentState[key],
    }))
  }

  function toggleRound(roundId) {
    setRoundOpenById((currentState) => ({
      ...currentState,
      [roundId]: !(currentState[roundId] ?? !isSharedReadOnly),
    }))
  }

  function handleAddPlayer(event) {
    event.preventDefault()

    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    const trimmedName = playerName.trim()

    if (!trimmedName) {
      setStatusMessage('Type a player name first.')
      return
    }

    const alreadyExists = players.some((player) => player.name.toLowerCase() === trimmedName.toLowerCase())

    if (alreadyExists) {
      setStatusMessage(`${trimmedName} is already in the roster.`)
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      players: [...currentState.players, { id: createId(), name: trimmedName }],
    }))
    setPlayerName('')
    setStatusMessage(`${trimmedName} added to the roster.`)
  }

  function handleRemovePlayer(playerId) {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      players: currentState.players.filter((player) => player.id !== playerId),
    }))
    setStatusMessage('Player removed from the setup roster.')
  }

  function handleGenerateRound() {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    let generatedRound = null

    setAppState((currentState) => {
      generatedRound = createRound(
        currentState.players,
        currentState.rounds,
        currentState.courtCount,
        buildLeaderboard(currentState.players, currentState.rounds),
      )

      if (!generatedRound) {
        return currentState
      }

      return {
        ...currentState,
        rounds: [...currentState.rounds, generatedRound],
      }
    })

    if (generatedRound) {
      setStatusMessage(
        `${generatedRound.matches.length} match${generatedRound.matches.length > 1 ? 'es are' : ' is'} ready. Scores auto-save in your browser.`,
      )
    } else {
      setStatusMessage('Add at least 4 players to generate a match round.')
    }
  }

  function handleGenerateBulkRounds() {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    if (players.length < 4) {
      setStatusMessage('Add at least 4 players to generate rounds.')
      return
    }

    const startFairness = buildFairness(players, rounds)
    const currentMin = Math.min(...players.map((player) => startFairness[player.id]?.assigned ?? 0))
    const targetMin = currentMin + 1

    let simulatedRounds = [...rounds]
    let generatedCount = 0
    const safety = 60

    for (let i = 0; i < safety; i++) {
      const currentFairness = buildFairness(players, simulatedRounds)
      const allReachedTarget = players.every((player) => (currentFairness[player.id]?.assigned ?? 0) >= targetMin)

      if (allReachedTarget) break

      const currentLeaderboard = buildLeaderboard(players, simulatedRounds)
      const round = createRound(players, simulatedRounds, courtCount, currentLeaderboard)

      if (!round) break

      simulatedRounds = [...simulatedRounds, round]
      generatedCount++
    }

    if (generatedCount === 0) {
      setStatusMessage('Could not generate more rounds. Check player and court count.')
      return
    }

    setAppState((currentState) => ({ ...currentState, rounds: simulatedRounds }))
    setStatusMessage(
      `${generatedCount} round${generatedCount > 1 ? 's' : ''} generated — everyone now has at least ${targetMin} turn${targetMin > 1 ? 's' : ''}.`,
    )
  }

  function handleScoreChange(roundId, matchId, field, nextValue) {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    const cleanedValue = nextValue.replace(/\D/g, '').slice(0, 2)

    setAppState((currentState) => ({
      ...currentState,
      rounds: currentState.rounds.map((round) => {
        if (round.id !== roundId) {
          return round
        }

        return {
          ...round,
          matches: round.matches.map((match) => {
            if (match.id !== matchId) {
              return match
            }

            const updatedMatch = {
              ...match,
              [field]: cleanedValue,
            }

            return {
              ...updatedMatch,
              completed: isScoreComplete(updatedMatch),
            }
          }),
        }
      }),
    }))
  }

  function handleScoreIncrement(roundId, matchId, field) {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      rounds: currentState.rounds.map((round) => {
        if (round.id !== roundId) {
          return round
        }

        return {
          ...round,
          matches: round.matches.map((match) => {
            if (match.id !== matchId) {
              return match
            }

            const currentScore = Math.max(0, Math.min(99, toMatchScore(match[field])))
            const nextScore = String(Math.min(currentScore + 1, 99))
            const updatedMatch = {
              ...match,
              [field]: nextScore,
            }

            return {
              ...updatedMatch,
              completed: isScoreComplete(updatedMatch),
            }
          }),
        }
      }),
    }))
  }

  function handleScoreDecrement(roundId, matchId, field) {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      rounds: currentState.rounds.map((round) => {
        if (round.id !== roundId) {
          return round
        }

        return {
          ...round,
          matches: round.matches.map((match) => {
            if (match.id !== matchId) {
              return match
            }

            const currentScore = Math.max(0, Math.min(99, toMatchScore(match[field])))
            const nextScore = String(Math.max(currentScore - 1, 0))
            const updatedMatch = {
              ...match,
              [field]: nextScore,
            }

            return {
              ...updatedMatch,
              completed: isScoreComplete(updatedMatch),
            }
          }),
        }
      }),
    }))
  }

  function handleResetTournament() {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    if (typeof window !== 'undefined' && !window.confirm('Clear players, matches, scores, and leaderboard?')) {
      return
    }

    setAppState(DEFAULT_STATE)
    setPlayerName('')
    setStatusMessage('Tournament reset. Ready for a new Americano session.')
  }

  function handleCourtCountChange(nextValue) {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      courtCount: Math.max(1, Number(nextValue) || 1),
    }))
  }

  function handleCourtCountIncrement() {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      courtCount: Math.min(Math.max(1, Number(currentState.courtCount) || 1) + 1, 12),
    }))
  }

  function handleCourtCountDecrement() {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      courtCount: Math.max(Math.max(1, Number(currentState.courtCount) || 1) - 1, 1),
    }))
  }

  function handleSkillLevelChange(nextValue) {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      skillLevel: clampSkillLevel(nextValue),
    }))
  }

  async function handleShareReadOnly() {
    const shareUrl = createShareUrl(appState)

    if (!shareUrl) {
      setStatusMessage('Unable to create share URL right now.')
      return
    }

    setSharePopupUrl(shareUrl)
    setSharePngPreviewUrl(createSharePngDataUrl(appState, leaderboard, playerLookup))
    setIsSharePopupOpen(true)

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        setStatusMessage('Read-only share URL copied to clipboard.')
      } else {
        setStatusMessage('Read-only share URL ready in popup.')
      }
    } catch {
      setStatusMessage('Read-only share URL ready in popup.')
    }
  }

  async function handleCopyShareUrlAgain() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sharePopupUrl)
        setIsCopySuccess(true)
        window.setTimeout(() => setIsCopySuccess(false), 900)
        setStatusMessage('Read-only share URL copied to clipboard.')
      } else {
        setStatusMessage('Clipboard unavailable. Copy URL from popup field.')
      }
    } catch {
      setStatusMessage('Clipboard blocked. Copy URL from popup field.')
    }
  }

  function handleCloseSharePopup() {
    setIsSharePopupOpen(false)
  }

  async function handleGenerateSharePng(shareNative) {
    if (typeof window === 'undefined' || isGeneratingPng) {
      return
    }

    setIsGeneratingPng(true)

    try {
      const dataUrl = createSharePngDataUrl(appState, leaderboard, playerLookup)
      setSharePngPreviewUrl(dataUrl)

      if (!dataUrl) {
        setStatusMessage('Unable to generate PNG right now.')
        return
      }

      const fileName = `americano-match-${new Date().toISOString().slice(0, 10)}.png`

      if (shareNative && navigator.share) {
        const imageFile = await dataUrlToFile(dataUrl, fileName)

        if (navigator.canShare?.({ files: [imageFile] })) {
          await navigator.share({
            files: [imageFile],
            title: 'Padel Americano Matchmaker',
            text: 'Session snapshot',
          })
          setStatusMessage('PNG shared successfully.')
          return
        }
      }

      triggerDownload(dataUrl, fileName)
      setStatusMessage('PNG downloaded. Share it on social media.')
    } catch {
      setStatusMessage('Could not share PNG. Try download and post manually.')
    } finally {
      setIsGeneratingPng(false)
    }
  }

  function handleCreateNewMatchFromShare() {
    if (typeof window === 'undefined') {
      return
    }

    saveState(appState)
    window.location.assign(`${window.location.origin}${window.location.pathname}`)
  }

  return (
    <div className="app-shell">
      <header className="panel hero-panel">
        <div className="hero-links" aria-label="Project links">
          <div className="eyebrow">⚡ Padel Americano Matchmaker</div>
          <a className="hero-link" href={GITHUB_PROFILE_URL} target="_blank" rel="noreferrer" aria-label="GitHub @castrix">
            <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-1.03-.01-1.87-2.78.62-3.37-1.2-3.37-1.2-.45-1.2-1.11-1.52-1.11-1.52-.91-.64.07-.63.07-.63 1 .08 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.64-1.37-2.22-.26-4.55-1.14-4.55-5.05 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.4 9.4 0 0 1 12 6.84a9.4 9.4 0 0 1 2.5.34c1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.92-2.33 4.78-4.56 5.04.36.32.68.93.68 1.88 0 1.36-.01 2.46-.01 2.8 0 .27.18.59.69.49A10.23 10.23 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z"
              />
            </svg>
            <span>@castrix</span>
          </a>
        </div>
        <div className="hero-content">
          <div>
            <h1>Fair, fast match rotations for every round.</h1>
            <p className="hero-copy">
              Add your players, set the number of courts, generate balanced doubles matchups, and keep
              every score plus the leaderboard saved on-device.
            </p>
          </div>

          <div className="hero-stats">
            <div className="stat-card">
              <span>Players</span>
              <strong>{players.length}</strong>
            </div>
            <div className="stat-card">
              <span>Courts</span>
              <strong>{courtCount}</strong>
            </div>
            <div className="stat-card">
              <span>Rounds</span>
              <strong>{rounds.length}</strong>
            </div>
            <div className="stat-card">
              <span>Scores saved</span>
              <strong>
                {completedMatches}/{totalMatches}
              </strong>
            </div>
          </div>
        </div>
      </header>

      <p className="status-banner">{statusMessage}</p>

      <main className="dashboard-grid">
        {!isSharedReadOnly ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="section-tag">Setup</p>
                <h2>Players & courts</h2>
              </div>
              <span className="hint-pill">Auto-saves locally</span>
            </div>

            <form className="player-form" onSubmit={handleAddPlayer}>
              <div className="input-stack">
                <label htmlFor="playerName">Player name</label>
                <div className="field-inline-action">
                  <input
                    id="playerName"
                    className="field field-with-inline-action"
                    type="text"
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    placeholder="e.g. Ihsan"
                    disabled={isSharedReadOnly}
                  />
                  <button className="field-inline-button" type="submit" disabled={isSharedReadOnly}>
                    Add
                  </button>
                </div>
              </div>

              <div className="input-stack">
                <label htmlFor="courtCount">Courts</label>
                <div className="field-input-wrap">
                  <button
                    className="field-step-button field-minus-button"
                    type="button"
                    onClick={handleCourtCountDecrement}
                    disabled={isSharedReadOnly || courtCount <= 1}
                    aria-label="Decrease court count"
                  >
                    -
                  </button>
                  <input
                    id="courtCount"
                    className="field field-with-steps"
                    type="numeric"
                    min="1"
                    max="12"
                    value={courtCount}
                    onChange={(event) => handleCourtCountChange(event.target.value)}
                    disabled={isSharedReadOnly}
                  />
                  <button
                    className="field-step-button field-plus-button"
                    type="button"
                    onClick={handleCourtCountIncrement}
                    disabled={isSharedReadOnly || courtCount >= 12}
                    aria-label="Increase court count"
                  >
                    +
                  </button>
                </div>
              </div>

            </form>

            <div className="action-row">
              <button className="primary-button" type="button" onClick={handleGenerateRound} disabled={isSharedReadOnly}>
                Generate match
              </button>
              <button className="primary-button" type="button" onClick={handleGenerateBulkRounds} disabled={isSharedReadOnly}>
                Generate auto
              </button>
              <button className="ghost-button" type="button" onClick={handleResetTournament} disabled={isSharedReadOnly}>
                Reset all
              </button>
              <button className="ghost-button share-readonly-button" type="button" onClick={handleShareReadOnly}>
                Share read-only
              </button>
            </div>

            <p className="helper-text">
              The round builder prioritizes players with the fewest turns and the longest wait, then avoids
              repeating partners and opponents when possible. Duration uses common Americano timing: 21-point
              rounds or short fixed blocks, adjusted faster as skill rises.
            </p>

            <div className="meta-strip">
              <div>
                <strong>{activeCourts || 0}</strong>
                <span>usable courts now</span>
              </div>
              <div>
                <strong>{benchCount}</strong>
                <span>resting player slots</span>
              </div>
              <div>
                <strong>{estimatedTournamentRounds}</strong>
                <span>estimated full rounds</span>
              </div>
            </div>

            <div className="skill-level-panel">
              <p className="section-tag skill-level-tag">Skill level</p>
              <div className="skill-level-selector" role="group" aria-label="Select average skill level">
                {SKILL_LEVEL_OPTIONS.map((level) => (
                  <button
                    key={level}
                    id={`skill-level-${level}`}
                    className={`skill-level-button ${skillLevel === level ? 'skill-level-button-active' : ''}`}
                    type="button"
                    onClick={() => handleSkillLevelChange(level)}
                    disabled={isSharedReadOnly}
                    aria-pressed={skillLevel === level}
                  >
                    <span>{level}</span>
                    <small>{level === 1 ? 'Casual' : level === 5 ? 'Strong' : 'Level'}</small>
                  </button>
                ))}
              </div>

              <div className="skill-duration-card">
                <strong>{estimatedDuration}</strong>
                <span>estimated total duration</span>
              </div>
            </div>
          </section>
        ) : null}

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-tag">Roster</p>
              <h2>Ready to play</h2>
            </div>
            <button className="panel-toggle" type="button" onClick={() => toggleSection('roster')}>
              {sectionOpen.roster ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {sectionOpen.roster ? (
            players.length === 0 ? (
              <div className="empty-state compact">
                <p>Add at least 4 players to begin scheduling.</p>
              </div>
            ) : (
              <div className="roster-list">
                {players.map((player) => (
                  <div className="player-chip" key={player.id}>
                    <div>
                      <strong>{player.name}</strong>
                      <span>
                        {fairness[player.id]?.assigned ?? 0} turns · {fairness[player.id]?.rests ?? 0} rests
                      </span>
                    </div>

                    {rounds.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleRemovePlayer(player.id)}
                        aria-label={`Remove ${player.name}`}
                        disabled={isSharedReadOnly}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          ) : null}
        </section>

        <section className="panel panel-wide">
          <div className="section-heading">
            <div>
              <p className="section-tag">Matches</p>
              <h2>Current & previous rounds</h2>
            </div>
            <button className="panel-toggle" type="button" onClick={() => toggleSection('matches')}>
              {sectionOpen.matches ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {sectionOpen.matches ? (
            rounds.length === 0 ? (
              <div className="empty-state">
                <p>Your generated rounds will appear here with score inputs for each court.</p>
              </div>
            ) : (
              <div className="round-list">
                {[...rounds].reverse().map((round) => {
                  const roundComplete = round.matches.every((match) => isScoreComplete(match))
                  const isRoundOpen = roundOpenById[round.id] ?? !isSharedReadOnly

                  return (
                    <article className="round-card" key={round.id}>
                      <button className="round-head round-head-toggle" type="button" onClick={() => toggleRound(round.id)}>
                        <div>
                          <h3>{round.label}</h3>
                          <p>{formatStamp(round.createdAt)}</p>
                        </div>
                        <div className="round-head-side">
                          <span className={`badge ${roundComplete ? 'badge-complete' : 'badge-pending'}`}>
                            {roundComplete ? 'Complete' : 'Pending scores'}
                          </span>
                          <span className="round-head-caret">{isRoundOpen ? '▾' : '▸'}</span>
                        </div>
                      </button>

                      {isRoundOpen ? (
                        <>
                          {round.resting?.length ? (
                            <p className="bench-note">
                              Resting this round:{' '}
                              {round.resting.map((playerId) => playerLookup[playerId] ?? 'Guest player').join(', ')}
                            </p>
                          ) : null}

                          <div className="match-grid">
                            {round.matches.map((match) => (
                              <div className="match-card" key={match.id}>
                                {(() => {
                                  const turnsPassed = getMatchTurnsPassed(match)
                                  const currentTurn = Math.max(1, Math.min(turnsPassed + 1, 21))
                                  const serveWindow = getServeWindowByTurn(currentTurn)
                                  const servePosition = getServePositionByTurn(currentTurn)

                                  return (
                                    <>
                                <div className="match-top">
                                  <span className="court-badge">Court {match.court}</span>
                                  <span className="mini-status">{isScoreComplete(match) ? 'Saved' : 'Live entry'}</span>
                                </div>

                                <div className="team-stack">
                                  <div className="team-line">
                                    <strong>{match.teamA.map((playerId) => playerLookup[playerId] ?? 'Guest player').join(' / ')}</strong>
                                  </div>
                                  <span className="vs-pill">vs</span>
                                  <div className="team-line">
                                    <strong>{match.teamB.map((playerId) => playerLookup[playerId] ?? 'Guest player').join(' / ')}</strong>
                                  </div>
                                </div>

                                <div className="score-row">
                                  <label className="score-field">
                                    <span>Team A</span>
                                    <div className="score-input-wrap">
                                      <button
                                        className="score-step-button score-minus-button"
                                        type="button"
                                        onClick={() => handleScoreDecrement(round.id, match.id, 'scoreA')}
                                        disabled={isSharedReadOnly}
                                        aria-label="Decrease Team A score"
                                      >
                                        -
                                      </button>
                                      <input
                                        className="score-input"
                                        type="text"
                                        inputMode="numeric"
                                        value={match.scoreA ?? ''}
                                        onChange={(event) =>
                                          handleScoreChange(round.id, match.id, 'scoreA', event.target.value)
                                        }
                                        placeholder="0"
                                        disabled={isSharedReadOnly}
                                      />
                                      <button
                                        className="score-step-button score-plus-button"
                                        type="button"
                                        onClick={() => handleScoreIncrement(round.id, match.id, 'scoreA')}
                                        disabled={isSharedReadOnly}
                                        aria-label="Increase Team A score"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </label>

                                  <label className="score-field">
                                    <span>Team B</span>
                                    <div className="score-input-wrap">
                                      <button
                                        className="score-step-button score-minus-button"
                                        type="button"
                                        onClick={() => handleScoreDecrement(round.id, match.id, 'scoreB')}
                                        disabled={isSharedReadOnly}
                                        aria-label="Decrease Team B score"
                                      >
                                        -
                                      </button>
                                      <input
                                        className="score-input"
                                        type="text"
                                        inputMode="numeric"
                                        value={match.scoreB ?? ''}
                                        onChange={(event) =>
                                          handleScoreChange(round.id, match.id, 'scoreB', event.target.value)
                                        }
                                        placeholder="0"
                                        disabled={isSharedReadOnly}
                                      />
                                      <button
                                        className="score-step-button score-plus-button"
                                        type="button"
                                        onClick={() => handleScoreIncrement(round.id, match.id, 'scoreB')}
                                        disabled={isSharedReadOnly}
                                        aria-label="Increase Team B score"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </label>
                                </div>
                                <div className="ingame-reminder">
                                  <span className="ingame-badge">Turn {currentTurn}/21</span>
                                  <span className="ingame-badge">{serveWindow}</span>
                                  <span className="ingame-badge">Current serve position: {servePosition}</span>
                                </div>
                                    </>
                                  )
                                })()}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )
          ) : null}
        </section>

        <section className="panel panel-wide">
          <div className="section-heading">
            <div>
              <p className="section-tag">Leaderboard</p>
              <h2>Live standings</h2>
            </div>
            <button className="panel-toggle" type="button" onClick={() => toggleSection('leaderboard')}>
              {sectionOpen.leaderboard ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {sectionOpen.leaderboard ? (
            leaderboard.length === 0 || leaderboard.every((player) => player.played === 0) ? (
              <div className="empty-state compact">
                <p>Enter scores to populate the leaderboard.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Player</th>
                      <th>Played</th>
                      <th>Wins</th>
                      <th>For</th>
                      <th>Against</th>
                      <th>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((player, index) => (
                      <tr className={index === 0 ? 'leader-row-top' : ''} key={player.id}>
                        <td>
                          <span className={`rank-pill rank-pill-${Math.min(index + 1, 4)}`}>{index + 1}</span>
                        </td>
                        <td>{player.name}</td>
                        <td>{player.played}</td>
                        <td>{player.wins}</td>
                        <td>{player.pointsFor}</td>
                        <td>{player.pointsAgainst}</td>
                        <td>{player.netPoints > 0 ? `+${player.netPoints}` : player.netPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </section>

        {isSharedReadOnly ? (
          <div className="readonly-sticky-action readonly-sticky-action-grid">
            <button className="primary-button" type="button" onClick={handleCreateNewMatchFromShare}>
              Create new match
            </button>
            <button className="ghost-button share-readonly-button" type="button" onClick={handleShareReadOnly}>
              Share read-only
            </button>
          </div>
        ) : null}
      </main>

      {isSharePopupOpen ? (
        <div className="share-modal-overlay" role="presentation" onClick={handleCloseSharePopup}>
          <div
            className="share-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Share URL copied!"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{color:"#89ffd8"}}>{isSharedReadOnly ? 'Read-only session' : 'Share URL copied!'}</h3>
            <p>URL stays here until close popup. Copy again anytime.</p>
            <input className="field share-url-field" type="text" value={sharePopupUrl} readOnly />
            {sharePngPreviewUrl ? (
              <div className="share-preview-wrap">
                <img className="share-preview-image" src={sharePngPreviewUrl} alt="Leaderboard story preview" />
              </div>
            ) : null}
            <div className="share-modal-actions">
              <button
                className={`primary-button ${isCopySuccess ? 'copy-success-feedback' : ''}`}
                type="button"
                onClick={handleCopyShareUrlAgain}
              >
                Copy again
              </button>
              <button
                className="ghost-button ghost-button-purple"
                type="button"
                onClick={() => handleGenerateSharePng(false)}
                disabled={isGeneratingPng}
              >
                Download PNG
              </button>
              <button className="ghost-button share-close-button" type="button" onClick={handleCloseSharePopup}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
