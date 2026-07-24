// Colour helpers so the light theme is a real palette, not just an inverted background.
// Dark theme colours are tuned to glow on near-black; on white they wash out, so we
// darken/saturate them and drop the glow effects.

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))) }
function toHex(v) { return clamp(v).toString(16).padStart(2, '0') }

function parseHex(hex) {
  const h = String(hex || '').trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Darken a hex colour toward black. amount 0..1 */
export function darken(hex, amount = 0.25) {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const f = 1 - amount
  return `#${rgb.map((v) => toHex(v * f)).join('')}`
}

/** Pull a colour toward its most saturated form (helps thin strokes read on white). */
export function saturate(hex, amount = 0.25) {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const max = Math.max(...rgb)
  const min = Math.min(...rgb)
  if (max === min) return hex
  return `#${rgb.map((v) => {
    // push channels away from the mid-grey of this colour
    const mid = (max + min) / 2
    return toHex(v + (v - mid) * amount)
  }).join('')}`
}

/**
 * Line / node colour for the current theme.
 * Dark: as authored (they glow on near-black).
 * Light: darker + more saturated so strokes and rings hold contrast on white.
 */
export function themed(hex, light) {
  if (!light) return hex
  return darken(saturate(hex, 0.35), 0.28)
}
