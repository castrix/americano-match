import type { FormEvent } from 'react'
import { SKILL_LEVEL_OPTIONS } from '../constants'

interface SetupPanelProps {
  isSharedReadOnly: boolean
  playerName: string
  courtCount: number
  skillLevel: number
  activeCourts: number
  benchCount: number
  estimatedTournamentRounds: number
  estimatedDuration: string
  onPlayerNameChange: (value: string) => void
  onAddPlayer: (event: FormEvent<HTMLFormElement>) => void
  onCourtCountChange: (value: string) => void
  onCourtCountIncrement: () => void
  onCourtCountDecrement: () => void
  onGenerateRound: () => void
  onGenerateBulkRounds: () => void
  onResetTournament: () => void
  onShareReadOnly: () => void
  onSkillLevelChange: (value: number) => void
}

export function SetupPanel({
  isSharedReadOnly,
  playerName,
  courtCount,
  skillLevel,
  activeCourts,
  benchCount,
  estimatedTournamentRounds,
  estimatedDuration,
  onPlayerNameChange,
  onAddPlayer,
  onCourtCountChange,
  onCourtCountIncrement,
  onCourtCountDecrement,
  onGenerateRound,
  onGenerateBulkRounds,
  onResetTournament,
  onShareReadOnly,
  onSkillLevelChange,
}: SetupPanelProps) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="section-tag">Setup</p>
          <h2>Players & courts</h2>
        </div>
        <span className="hint-pill">Auto-saves locally</span>
      </div>

      <form className="player-form" onSubmit={onAddPlayer}>
        <div className="input-stack">
          <label htmlFor="playerName">Player name</label>
          <div className="field-inline-action">
            <input
              id="playerName"
              className="field field-with-inline-action"
              type="text"
              value={playerName}
              onChange={(event) => onPlayerNameChange(event.target.value)}
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
              onClick={onCourtCountDecrement}
              disabled={isSharedReadOnly || courtCount <= 1}
              aria-label="Decrease court count"
            >
              -
            </button>
            <input
              id="courtCount"
              className="field field-with-steps"
              type="text"
              inputMode="numeric"
              min="1"
              max="12"
              value={courtCount}
              onChange={(event) => onCourtCountChange(event.target.value)}
              disabled={isSharedReadOnly}
            />
            <button
              className="field-step-button field-plus-button"
              type="button"
              onClick={onCourtCountIncrement}
              disabled={isSharedReadOnly || courtCount >= 12}
              aria-label="Increase court count"
            >
              +
            </button>
          </div>
        </div>
      </form>

      <div className="action-row">
        <button className="primary-button" type="button" onClick={onGenerateRound} disabled={isSharedReadOnly}>
          Generate match
        </button>
        <button className="primary-button" type="button" onClick={onGenerateBulkRounds} disabled={isSharedReadOnly}>
          Generate auto
        </button>
        <button className="ghost-button" type="button" onClick={onResetTournament} disabled={isSharedReadOnly}>
          Reset all
        </button>
        <button className="ghost-button share-readonly-button" type="button" onClick={onShareReadOnly}>
          Share read-only
        </button>
      </div>

      <p className="helper-text">
        Round builder prioritizes players with fewest turns and longest wait, then avoids repeating partners and
        opponents when possible. Duration uses common Americano timing: 21-point rounds or short fixed blocks,
        adjusted faster as skill rises.
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
              onClick={() => onSkillLevelChange(level)}
              disabled={isSharedReadOnly}
              aria-pressed={skillLevel === level}
            >
              <span>{level}</span>
              <small>{level === 1 ? 'Casual' : level === 5 ? 'Pro' : ''}</small>
            </button>
          ))}
        </div>

        <div className="skill-duration-card">
          <strong>{estimatedDuration}</strong>
          <span>estimated total duration</span>
        </div>
      </div>
    </section>
  )
}
