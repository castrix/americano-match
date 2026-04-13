import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'americano-match-state-v1'
const SHARE_KEY = 'share'
const SHARE_CIPHER_KEY = 'americano-share-v1'
const DEFAULT_STATE = {
  players: [],
  courtCount: 2,
  rounds: [],
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
    rounds,
  }
}

function toBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4 || 4)) % 4)}`
  const binary = window.atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function xorCipher(bytes, keyBytes) {
  return bytes.map((byte, index) => byte ^ keyBytes[index % keyBytes.length])
}

function encodeShareState(state) {
  if (typeof window === 'undefined') {
    return ''
  }

  const encoder = new TextEncoder()
  const jsonBytes = encoder.encode(JSON.stringify(state))
  const keyBytes = encoder.encode(SHARE_CIPHER_KEY)
  const cipherBytes = xorCipher(jsonBytes, keyBytes)

  return toBase64Url(cipherBytes)
}

function decodeShareState(payload) {
  if (typeof window === 'undefined' || !payload) {
    return null
  }

  try {
    const decoder = new TextDecoder()
    const keyBytes = new TextEncoder().encode(SHARE_CIPHER_KEY)
    const cipherBytes = fromBase64Url(payload)
    const plainBytes = xorCipher(cipherBytes, keyBytes)
    const parsedState = JSON.parse(decoder.decode(plainBytes))

    return normalizeState(parsedState)
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
        draws: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        netPoints: 0,
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
              draws: 0,
              losses: 0,
              pointsFor: 0,
              pointsAgainst: 0,
              netPoints: 0,
            }
          }

          stats[playerId].played += 1
          stats[playerId].pointsFor += teamScore
          stats[playerId].pointsAgainst += otherScore
          stats[playerId].netPoints = stats[playerId].pointsFor - stats[playerId].pointsAgainst

          if (teamScore > otherScore) {
            stats[playerId].wins += 1
          } else if (teamScore < otherScore) {
            stats[playerId].losses += 1
          } else {
            stats[playerId].draws += 1
          }
        })
      }

      recordResult(match.teamA, scoreA, scoreB)
      recordResult(match.teamB, scoreB, scoreA)
    })
  })

  return Object.values(stats).sort((playerA, playerB) => {
    if (playerB.pointsFor !== playerA.pointsFor) {
      return playerB.pointsFor - playerA.pointsFor
    }
    if (playerB.netPoints !== playerA.netPoints) {
      return playerB.netPoints - playerA.netPoints
    }
    if (playerB.wins !== playerA.wins) {
      return playerB.wins - playerA.wins
    }
    return playerA.name.localeCompare(playerB.name)
  })
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

function scoreMatchup(teamA, teamB, fairness, ratingMap) {
  const partnerPenalty =
    getRelationCount(fairness, teamA[0], 'partnerCounts', teamA[1]) * 12 +
    getRelationCount(fairness, teamB[0], 'partnerCounts', teamB[1]) * 12

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

  const anchor = remainingIds[0]
  const trioOptions = getCombinations(remainingIds.slice(1), 3)
  let bestChoice = null

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

  return bestChoice
}

function createRound(players, rounds, courtCount, leaderboard) {
  const playableCourts = Math.min(Math.max(1, Number(courtCount) || 1), Math.floor(players.length / 4))

  if (playableCourts === 0) {
    return null
  }

  const fairness = buildFairness(players, rounds)
  const ratingMap = Object.fromEntries(
    leaderboard.map((player) => [player.id, player.pointsFor + player.netPoints + player.wins * 2]),
  )

  const orderedPlayers = [...players].sort((playerA, playerB) => {
    const playerAFairness = fairness[playerA.id] ?? { assigned: 0, rests: 0, lastRound: -1 }
    const playerBFairness = fairness[playerB.id] ?? { assigned: 0, rests: 0, lastRound: -1 }

    if (playerAFairness.assigned !== playerBFairness.assigned) {
      return playerAFairness.assigned - playerBFairness.assigned
    }
    if (playerAFairness.lastRound !== playerBFairness.lastRound) {
      return playerAFairness.lastRound - playerBFairness.lastRound
    }
    if (playerAFairness.rests !== playerBFairness.rests) {
      return playerBFairness.rests - playerAFairness.rests
    }
    return playerA.name.localeCompare(playerB.name)
  })

  const selectedIds = orderedPlayers.slice(0, playableCourts * 4).map((player) => player.id)
  const restingIds = orderedPlayers.slice(playableCourts * 4).map((player) => player.id)

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
  const [sharePopupUrl, setSharePopupUrl] = useState('')
  const [isSharePopupOpen, setIsSharePopupOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState(() =>
    isSharedReadOnly
      ? 'Read-only shared session loaded from URL.'
      : 'Add players, set the courts, and generate the next fair round.',
  )

  const { players, courtCount, rounds } = appState

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

  const totalMatches = rounds.reduce((sum, round) => sum + round.matches.length, 0)
  const completedMatches = rounds.reduce(
    (sum, round) => sum + round.matches.filter((match) => isScoreComplete(match)).length,
    0,
  )
  const activeCourts = Math.min(courtCount, Math.floor(players.length / 4))
  const benchCount = Math.max(players.length - activeCourts * 4, 0)

  function showReadOnlyMessage() {
    setStatusMessage('Shared view is read-only. Open app without share URL to edit.')
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

  async function handleShareReadOnly() {
    const shareUrl = createShareUrl(appState)

    if (!shareUrl) {
      setStatusMessage('Unable to create share URL right now.')
      return
    }

    setSharePopupUrl(shareUrl)
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
        <div className="eyebrow">⚡ Padel Americano Matchmaker</div>
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
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-tag">Setup</p>
              <h2>Players & courts</h2>
            </div>
            <span className="hint-pill">Auto-saves locally</span>
          </div>

          <form className="player-form" onSubmit={handleAddPlayer}>
            <div className="input-stack input-stack-wide">
              <label htmlFor="playerName">Player name</label>
              <input
                id="playerName"
                className="field"
                type="text"
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="e.g. Ihsan"
                disabled={isSharedReadOnly}
              />
            </div>

            <div className="input-stack">
              <label htmlFor="courtCount">Courts</label>
              <input
                id="courtCount"
                className="field"
                type="number"
                min="1"
                max="12"
                value={courtCount}
                onChange={(event) => handleCourtCountChange(event.target.value)}
                disabled={isSharedReadOnly}
              />
            </div>

            <button className="primary-button" type="submit" disabled={isSharedReadOnly}>
              Add player
            </button>
          </form>

          <div className="action-row">
            <button className="primary-button" type="button" onClick={handleGenerateRound} disabled={isSharedReadOnly}>
              Generate match
            </button>
            <button className="ghost-button" type="button" onClick={handleResetTournament} disabled={isSharedReadOnly}>
              Reset all
            </button>
            <button className="ghost-button" type="button" onClick={handleShareReadOnly}>
              Share read-only
            </button>
          </div>

          <p className="helper-text">
            The round builder prioritizes players with the fewest turns and the longest wait, then avoids
            repeating partners and opponents when possible.
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
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="section-tag">Roster</p>
              <h2>Ready to play</h2>
            </div>
          </div>

          {players.length === 0 ? (
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
          )}
        </section>

        <section className="panel panel-wide">
          <div className="section-heading">
            <div>
              <p className="section-tag">Matches</p>
              <h2>Current & previous rounds</h2>
            </div>
          </div>

          {rounds.length === 0 ? (
            <div className="empty-state">
              <p>Your generated rounds will appear here with score inputs for each court.</p>
            </div>
          ) : (
            <div className="round-list">
              {[...rounds].reverse().map((round) => {
                const roundComplete = round.matches.every((match) => isScoreComplete(match))

                return (
                  <article className="round-card" key={round.id}>
                    <div className="round-head">
                      <div>
                        <h3>{round.label}</h3>
                        <p>{formatStamp(round.createdAt)}</p>
                      </div>
                      <span className={`badge ${roundComplete ? 'badge-complete' : 'badge-pending'}`}>
                        {roundComplete ? 'Complete' : 'Pending scores'}
                      </span>
                    </div>

                    {round.resting?.length ? (
                      <p className="bench-note">
                        Resting this round:{' '}
                        {round.resting.map((playerId) => playerLookup[playerId] ?? 'Guest player').join(', ')}
                      </p>
                    ) : null}

                    <div className="match-grid">
                      {round.matches.map((match) => (
                        <div className="match-card" key={match.id}>
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
                            </label>

                            <label className="score-field">
                              <span>Team B</span>
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
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="panel panel-wide">
          <div className="section-heading">
            <div>
              <p className="section-tag">Leaderboard</p>
              <h2>Live standings</h2>
            </div>
          </div>

          {leaderboard.length === 0 || leaderboard.every((player) => player.played === 0) ? (
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
                    <th>Draws</th>
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
                      <td>{player.draws}</td>
                      <td>{player.pointsFor}</td>
                      <td>{player.pointsAgainst}</td>
                      <td>{player.netPoints > 0 ? `+${player.netPoints}` : player.netPoints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isSharedReadOnly ? (
          <div className="readonly-sticky-action readonly-sticky-action-grid">
            <button className="primary-button" type="button" onClick={handleCreateNewMatchFromShare}>
              Create new match
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
            aria-label="Share read-only URL"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Share read-only URL</h3>
            <p>URL stays here until close popup. Copy again anytime.</p>
            <input className="field share-url-field" type="text" value={sharePopupUrl} readOnly />
            <div className="share-modal-actions">
              <button className="primary-button" type="button" onClick={handleCopyShareUrlAgain}>
                Copy again
              </button>
              <button className="ghost-button" type="button" onClick={handleCloseSharePopup}>
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
