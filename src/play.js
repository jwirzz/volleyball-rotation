// Zeitleiste: Schritte (Keyframes) → Positionen zu einem Zeitpunkt t (Sekunden).
// Koordinaten aus Teamsicht: x 0–9 m von links, y = Meter vom Netz (<0 = Gegnerseite).

export const NETZ = 2.43
export const SPIELER = ['1', '2', '3', '4', '5', '6']
const BALL_SPEED = 12 // m/s
const RUN_SPEED = 5 // m/s

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function stepDuration(a, b) {
  const lauf = Math.max(...SPIELER.map((id) => dist(a[id], b[id])))
  return Math.max(dist(a.ball, b.ball) / BALL_SPEED, lauf / RUN_SPEED, 1)
}

// Startzeiten der Schritte, letzte = Gesamtdauer.
export function timeline(steps) {
  const times = [0]
  for (let i = 1; i < steps.length; i++) times.push(times[i - 1] + stepDuration(steps[i - 1], steps[i]))
  return times
}

// Höhe des Bogens: wächst mit der Distanz, mindestens 30 cm über dem Netz, wenn der Ball es kreuzt.
export function ballBump(a, b) {
  const d = dist(a, b)
  if (d < 0.05) return 0
  let bump = 0.5 + 0.12 * d
  if (a[1] * b[1] < 0) {
    const f = a[1] / (a[1] - b[1])
    const need = NETZ + 0.3 - (a[2] + (b[2] - a[2]) * f)
    bump = Math.max(bump, need / (4 * f * (1 - f)))
  }
  return bump
}

export function ballAt(a, b, f) {
  const lerp = (i) => a[i] + (b[i] - a[i]) * f
  return [lerp(0), lerp(1), lerp(2) + 4 * ballBump(a, b) * f * (1 - f)]
}

// JSON mit Koordinaten-Arrays auf einer Zeile, damit die Datei von Hand lesbar bleibt.
export const toJson = (data) =>
  JSON.stringify(data, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v), 2).replace(
    /\[\s+([-\d.,\s]+?)\s+\]/g,
    (_, inner) => `[${inner.trim().split(/,\s*/).join(', ')}]`,
  ) + '\n'

const smooth = (f) => f * f * (3 - 2 * f)

export function sample(steps, times, t) {
  const last = steps.length - 1
  if (last === 0 || t <= 0) return { ...steps[0], step: 0 }
  if (t >= times[last]) return { ...steps[last], step: last }
  let i = 0
  while (t >= times[i + 1]) i++
  const f = (t - times[i]) / (times[i + 1] - times[i])
  const a = steps[i]
  const b = steps[i + 1]
  const out = { step: i + f, ball: ballAt(a.ball, b.ball, f) }
  const s = smooth(f)
  for (const id of SPIELER) out[id] = [a[id][0] + (b[id][0] - a[id][0]) * s, a[id][1] + (b[id][1] - a[id][1]) * s]
  return out
}
