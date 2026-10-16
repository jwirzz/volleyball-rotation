// node src/play.check.js
import assert from 'node:assert/strict'
import { NETZ, ballAt, sample, timeline, toJson } from './play.js'

const pos = (x, y) => Object.fromEntries(['1', '2', '3', '4', '5', '6'].map((id) => [id, [x, y]]))
const steps = [
  { ball: [4.5, -9.5, 2.6], ...pos(2, 5) }, // Gegner-Aufschlag
  { ball: [4.5, 6, 0.8], ...pos(2, 5) }, // Annahme
  { ball: [6, 0.5, 2.8], ...pos(7, 1) }, // Zuspiel, alle laufen 5.8 m
]
const times = timeline(steps)

assert.equal(times.length, 3)
assert.ok(Math.abs(times[1] - 15.5 / 12) < 1e-9, 'Aufschlag-Dauer = Ballweg / 12 m/s')
assert.ok(Math.abs(times[2] - times[1] - Math.hypot(5, 4) / 5) < 1e-9, 'Lauf bestimmt die Dauer')

assert.deepEqual(sample(steps, times, -1).ball, steps[0].ball)
assert.deepEqual(sample(steps, times, 99)['3'], steps[2]['3'])
assert.equal(sample(steps, times, times[1]).step, 1)
const mitte = sample(steps, times, (times[1] + times[2]) / 2)['1']
assert.ok(Math.abs(mitte[0] - 4.5) < 1e-9 && Math.abs(mitte[1] - 3) < 1e-9, 'halber Weg nach halber Zeit')

// Ball muss übers Netz: Höhe dort, wo y = 0 gekreuzt wird.
const a = [4.5, -9.5, 2.6]
const b = [4.5, 6, 0.8]
const f = 9.5 / 15.5
assert.ok(ballAt(a, b, f)[2] > NETZ + 0.29, 'Ball über dem Netz')
assert.equal(ballAt(a, a, 0.5)[2], 2.6, 'ruhender Ball springt nicht')

// Speichern: gerundet, Koordinaten einzeilig, sonst verlustfrei
const json = toJson({ a: { ball: [1.234, -9.8, 2.6] }, n: 'x' })
assert.ok(json.includes('"ball": [1.23, -9.8, 2.6]'))
assert.deepEqual(JSON.parse(json), { a: { ball: [1.23, -9.8, 2.6] }, n: 'x' })

console.log('play.js ok')
