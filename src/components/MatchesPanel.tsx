import {
  formatStamp,
  getMatchTurnsPassed,
  getServePositionByTurn,
  getServeWindowByTurn,
  isScoreComplete,
} from '../lib/state'
import type { Round } from '../types'

interface MatchesPanelProps {
  rounds: Round[]
  playerLookup: Record<string, string>
  isSharedReadOnly: boolean
  isOpen: boolean
  roundOpenById: Record<string, boolean>
  onToggle: () => void
  onToggleRound: (roundId: string) => void
  onScoreChange: (roundId: string, matchId: string, field: 'scoreA' | 'scoreB', value: string) => void
  onScoreIncrement: (roundId: string, matchId: string, field: 'scoreA' | 'scoreB') => void
  onScoreDecrement: (roundId: string, matchId: string, field: 'scoreA' | 'scoreB') => void
}

export function MatchesPanel({
  rounds,
  playerLookup,
  isSharedReadOnly,
  isOpen,
  roundOpenById,
  onToggle,
  onToggleRound,
  onScoreChange,
  onScoreIncrement,
  onScoreDecrement,
}: MatchesPanelProps) {
  return (
    <section className="panel panel-wide">
      <div className="section-heading">
        <div>
          <p className="section-tag">Matches</p>
          <h2>Current & previous rounds</h2>
        </div>
        <button className="panel-toggle" type="button" onClick={onToggle}>
          {isOpen ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isOpen ? (
        rounds.length === 0 ? (
          <div className="empty-state">
            <p>Generated rounds appear here with score inputs for each court.</p>
          </div>
        ) : (
          <div className="round-list">
            {[...rounds].reverse().map((round) => {
              const roundComplete = round.matches.every((match) => isScoreComplete(match))
              const isRoundOpen = roundOpenById[round.id] ?? !isSharedReadOnly

              return (
                <article className="round-card" key={round.id}>
                  <button className="round-head round-head-toggle" type="button" onClick={() => onToggleRound(round.id)}>
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
                      {round.resting.length ? (
                        <p className="bench-note">
                          Resting this round:{' '}
                          {round.resting.map((playerId) => playerLookup[playerId] ?? 'Guest player').join(', ')}
                        </p>
                      ) : null}

                      <div className="match-grid">
                        {round.matches.map((match) => {
                          const turnsPassed = getMatchTurnsPassed(match)
                          const currentTurn = Math.max(1, Math.min(turnsPassed + 1, 21))
                          const serveWindow = getServeWindowByTurn(currentTurn)
                          const servePosition = getServePositionByTurn(currentTurn)

                          return (
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
                                  <div className="score-input-wrap">
                                    <button
                                      className="score-step-button score-minus-button"
                                      type="button"
                                      onClick={() => onScoreDecrement(round.id, match.id, 'scoreA')}
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
                                      onChange={(event) => onScoreChange(round.id, match.id, 'scoreA', event.target.value)}
                                      placeholder="0"
                                      disabled={isSharedReadOnly}
                                    />
                                    <button
                                      className="score-step-button score-plus-button"
                                      type="button"
                                      onClick={() => onScoreIncrement(round.id, match.id, 'scoreA')}
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
                                      onClick={() => onScoreDecrement(round.id, match.id, 'scoreB')}
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
                                      onChange={(event) => onScoreChange(round.id, match.id, 'scoreB', event.target.value)}
                                      placeholder="0"
                                      disabled={isSharedReadOnly}
                                    />
                                    <button
                                      className="score-step-button score-plus-button"
                                      type="button"
                                      onClick={() => onScoreIncrement(round.id, match.id, 'scoreB')}
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
                            </div>
                          )
                        })}
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
  )
}
