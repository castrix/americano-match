import { APP_PUBLIC_URL } from '../constants'
import { isScoreComplete } from './state'
import type { AppState, LeaderboardEntry } from '../types'

function toOpaqueColor(input: string, fallback: string) {
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

export function createSharePngDataUrl(
  state: AppState,
  leaderboard: LeaderboardEntry[],
  playerLookup: Record<string, string>,
) {
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

export async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], fileName, { type: 'image/png' })
}

export function triggerDownload(dataUrl: string, fileName: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}