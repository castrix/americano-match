import type { FairnessMap, Player } from '../types'

interface RosterPanelProps {
  players: Player[]
  fairness: FairnessMap
  roundsCount: number
  isSharedReadOnly: boolean
  isOpen: boolean
  onToggle: () => void
  onRemovePlayer: (playerId: string) => void
}

export function RosterPanel({
  players,
  fairness,
  roundsCount,
  isSharedReadOnly,
  isOpen,
  onToggle,
  onRemovePlayer,
}: RosterPanelProps) {
  return (
    <section className="panel panel-roster">
      <div className="section-heading">
        <div>
          <p className="section-tag">Roster</p>
          <h2>
            Ready to play <span className="roster-count-pill">{players.length}</span>
          </h2>
        </div>
        <button className="panel-toggle" type="button" onClick={onToggle}>
          {isOpen ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isOpen ? (
        players.length === 0 ? (
          <div className="empty-state compact">
            <p>Add at least 4 players to begin scheduling.</p>
          </div>
        ) : (
          <div className="roster-list">
            {players.map((player, index) => (
              <div className="player-chip" key={player.id}>
                <div className="player-chip-identity">
                  <span className="player-row-number">{index + 1}</span>
                  <div>
                    <strong>{player.name}</strong>
                    <span className="player-chip-meta">
                      {fairness[player.id]?.assigned ?? 0} turns · {fairness[player.id]?.rests ?? 0} rests
                    </span>
                  </div>
                </div>

                {roundsCount === 0 ? (
                  <button
                    type="button"
                    onClick={() => onRemovePlayer(player.id)}
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
  )
}
