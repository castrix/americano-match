import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  DEFAULT_STATE,
  ROUND_TRANSITION_MINUTES,
} from './constants'
import { HeroPanel } from './components/HeroPanel'
import { LeaderboardPanel } from './components/LeaderboardPanel'
import { MatchesPanel } from './components/MatchesPanel'
import { RosterPanel } from './components/RosterPanel'
import { SetupPanel } from './components/SetupPanel'
import { ShareModal } from './components/ShareModal'
import { createSharePngDataUrl, dataUrlToFile, triggerDownload } from './lib/sharePng'
import {
  clampSkillLevel,
  createShareUrl,
  formatDuration,
  getEstimatedRoundMinutes,
  getEstimatedTournamentDurationMinutes,
  getEstimatedTournamentRounds,
  isScoreComplete,
  loadSharedState,
  loadState,
  saveState,
  toMatchScore,
  createId,
} from './lib/state'
import { buildFairness, buildLeaderboard, createRound } from './lib/tournament'
import type { AppState } from './types'

interface InitialAppState {
  initialState: AppState
  isSharedReadOnly: boolean
}

function App() {
  const [{ initialState, isSharedReadOnly }] = useState<InitialAppState>(() => {
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
  const [appState, setAppState] = useState<AppState>(initialState)
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
  const [roundOpenById, setRoundOpenById] = useState<Record<string, boolean>>({})
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

  function toggleSection(key: 'roster' | 'matches' | 'leaderboard') {
    setSectionOpen((currentState) => ({
      ...currentState,
      [key]: !currentState[key],
    }))
  }

  function toggleRound(roundId: string) {
    setRoundOpenById((currentState) => ({
      ...currentState,
      [roundId]: !(currentState[roundId] ?? !isSharedReadOnly),
    }))
  }

  function handleAddPlayer(event: React.FormEvent<HTMLFormElement>) {
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
      setStatusMessage(`${trimmedName} is already in roster.`)
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      players: [...currentState.players, { id: createId(), name: trimmedName }],
    }))
    setPlayerName('')
    setStatusMessage(`${trimmedName} added to roster.`)
  }

  function handleRemovePlayer(playerId: string) {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    setAppState((currentState) => ({
      ...currentState,
      players: currentState.players.filter((player) => player.id !== playerId),
    }))
    setStatusMessage('Player removed from setup roster.')
  }

  function handleGenerateRound() {
    if (isSharedReadOnly) {
      showReadOnlyMessage()
      return
    }

    const generatedRound = createRound(players, rounds, courtCount, leaderboard)

    if (generatedRound) {
      setAppState((currentState) => ({
        ...currentState,
        rounds: [...currentState.rounds, generatedRound],
      }))
    }

    if (generatedRound) {
      setStatusMessage(
        `${generatedRound.matches.length} match${generatedRound.matches.length > 1 ? 'es are' : ' is'} ready. Scores auto-save in browser.`,
      )
    } else {
      setStatusMessage('Add at least 4 players to generate match round.')
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

    for (let index = 0; index < safety; index += 1) {
      const currentFairness = buildFairness(players, simulatedRounds)
      const allReachedTarget = players.every((player) => (currentFairness[player.id]?.assigned ?? 0) >= targetMin)

      if (allReachedTarget) break

      const currentLeaderboard = buildLeaderboard(players, simulatedRounds)
      const round = createRound(players, simulatedRounds, courtCount, currentLeaderboard)

      if (!round) break

      simulatedRounds = [...simulatedRounds, round]
      generatedCount += 1
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

  function handleScoreChange(roundId: string, matchId: string, field: 'scoreA' | 'scoreB', nextValue: string) {
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

  function handleScoreIncrement(roundId: string, matchId: string, field: 'scoreA' | 'scoreB') {
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

  function handleScoreDecrement(roundId: string, matchId: string, field: 'scoreA' | 'scoreB') {
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
    setStatusMessage('Tournament reset. Ready for new Americano session.')
  }

  function handleCourtCountChange(nextValue: string) {
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

  function handleSkillLevelChange(nextValue: number) {
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

  async function handleGenerateSharePng(shareNative: boolean) {
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
      <HeroPanel
        playersCount={players.length}
        courtCount={courtCount}
        roundsCount={rounds.length}
        completedMatches={completedMatches}
        totalMatches={totalMatches}
      />

      <p className="status-banner">{statusMessage}</p>

      <main className="dashboard-grid">
        {!isSharedReadOnly ? (
          <SetupPanel
            isSharedReadOnly={isSharedReadOnly}
            playerName={playerName}
            courtCount={courtCount}
            skillLevel={skillLevel}
            activeCourts={activeCourts}
            benchCount={benchCount}
            estimatedTournamentRounds={estimatedTournamentRounds}
            estimatedDuration={estimatedDuration}
            onPlayerNameChange={setPlayerName}
            onAddPlayer={handleAddPlayer}
            onCourtCountChange={handleCourtCountChange}
            onCourtCountIncrement={handleCourtCountIncrement}
            onCourtCountDecrement={handleCourtCountDecrement}
            onGenerateRound={handleGenerateRound}
            onGenerateBulkRounds={handleGenerateBulkRounds}
            onResetTournament={handleResetTournament}
            onShareReadOnly={handleShareReadOnly}
            onSkillLevelChange={handleSkillLevelChange}
          />
        ) : null}

        <RosterPanel
          players={players}
          fairness={fairness}
          roundsCount={rounds.length}
          isSharedReadOnly={isSharedReadOnly}
          isOpen={sectionOpen.roster}
          onToggle={() => toggleSection('roster')}
          onRemovePlayer={handleRemovePlayer}
        />

        <MatchesPanel
          rounds={rounds}
          playerLookup={playerLookup}
          isSharedReadOnly={isSharedReadOnly}
          isOpen={sectionOpen.matches}
          roundOpenById={roundOpenById}
          onToggle={() => toggleSection('matches')}
          onToggleRound={toggleRound}
          onScoreChange={handleScoreChange}
          onScoreIncrement={handleScoreIncrement}
          onScoreDecrement={handleScoreDecrement}
        />

        <LeaderboardPanel
          leaderboard={leaderboard}
          isOpen={sectionOpen.leaderboard}
          onToggle={() => toggleSection('leaderboard')}
        />

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
        <ShareModal
          isSharedReadOnly={isSharedReadOnly}
          sharePopupUrl={sharePopupUrl}
          sharePngPreviewUrl={sharePngPreviewUrl}
          isCopySuccess={isCopySuccess}
          isGeneratingPng={isGeneratingPng}
          onCopyAgain={handleCopyShareUrlAgain}
          onDownloadPng={() => void handleGenerateSharePng(false)}
          onClose={handleCloseSharePopup}
        />
      ) : null}
    </div>
  )
}

export default App
