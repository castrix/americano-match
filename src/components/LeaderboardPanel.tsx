import type { LeaderboardEntry } from '../types'

interface LeaderboardPanelProps {
  leaderboard: LeaderboardEntry[]
  isOpen: boolean
  onToggle: () => void
}

export function LeaderboardPanel({ leaderboard, isOpen, onToggle }: LeaderboardPanelProps) {
  return (
    <section className="panel panel-wide">
      <div className="section-heading">
        <div>
          <p className="section-tag">Leaderboard</p>
          <h2>Live standings</h2>
        </div>
        <button className="panel-toggle" type="button" onClick={onToggle}>
          {isOpen ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isOpen ? (
        leaderboard.length === 0 || leaderboard.every((player) => player.played === 0) ? (
          <div className="empty-state compact">
            <p>Enter scores to populate leaderboard.</p>
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
  )
}
