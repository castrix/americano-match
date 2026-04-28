import { GITHUB_PROFILE_URL } from '../constants'

interface HeroPanelProps {
  playersCount: number
  courtCount: number
  roundsCount: number
  completedMatches: number
  totalMatches: number
}

export function HeroPanel({
  playersCount,
  courtCount,
  roundsCount,
  completedMatches,
  totalMatches,
}: HeroPanelProps) {
  return (
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
            Add players, set number of courts, generate balanced doubles matchups, keep every score plus leaderboard
            saved on-device.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span>Players</span>
            <strong>{playersCount}</strong>
          </div>
          <div className="stat-card">
            <span>Courts</span>
            <strong>{courtCount}</strong>
          </div>
          <div className="stat-card">
            <span>Rounds</span>
            <strong>{roundsCount}</strong>
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
  )
}
