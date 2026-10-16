import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { NETZ, SPIELER, ballAt, sample, timeline, toJson } from './play.js'
import { figurenFabrik } from './spieler.js'

const FARBE = { annahme: '#1f57b8', aufschlag: '#c0392b', pass: '#2e9b3a', libero: '#8e44ad', gegner: '#8a8a8a' }
const BANK = [10, 5] // wer ausgewechselt ist, steht rechts neben dem Feld
const DURCHLAUF = [1, 6, 5, 4, 3, 2].flatMap((l) => [[String(l), 'annahme'], [String(l), 'aufschlag']])
const SITUATION = { annahme: 'Annahme', aufschlag: 'Aufschlag' }
const KONTAKT = { bagger: 'Annahme', pritschen: 'Zuspiel', schlag: 'Angriff' }
const $ = (s) => document.querySelector(s)

// Teamsicht (x 0–9 von links, y Meter vom Netz) → Welt (Netz bei z = 0, unser Feld z > 0)
const welt = (p, h = 0) => new THREE.Vector3(p[0] - 4.5, h, p[1])
const team = (v) => [v.x + 4.5, v.z]

// ---------- Szene ----------
const box = $('#view3d')
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
box.append(renderer.domElement)
const labels = new CSS2DRenderer()
labels.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none'
box.append(labels.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#3f73a3')
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
const controls = new OrbitControls(camera, renderer.domElement)
controls.maxPolarAngle = Math.PI / 2 - 0.05
// Kamera-Voreinstellung je nach Bildformat (Hochformat = Handy: weiter weg, damit das Feld reinpasst)
function ansichtFuer(name) {
  const a = camera.aspect
  if (name === 'oben') {
    const v = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const h = Math.max(11 / v, 5.5 / (v * a)) * (a < 1 ? 1.45 : 1.1) // Hochformat: Platz für die Leisten
    const z = a < 1 ? 1 : 0.3
    return { pos: new THREE.Vector3(0, h, z + 0.01), ziel: new THREE.Vector3(0, 0, z) }
  }
  return a < 1
    ? { pos: new THREE.Vector3(0, 17, 17), ziel: new THREE.Vector3(0, 0, 0.5) }
    : { pos: new THREE.Vector3(0, 8, 17), ziel: new THREE.Vector3(0, 0.5, 2) }
}

scene.add(new THREE.HemisphereLight('#ffffff', '#806040', 1.6))
const sun = new THREE.DirectionalLight('#ffffff', 2)
sun.position.set(-6, 14, 8)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13 })
scene.add(sun)

function flat(w, d, color, x, z, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color }))
  m.position.set(x, y, z)
  m.receiveShadow = true
  scene.add(m)
}
flat(40, 40, '#3f73a3', 0, 0, -0.01)
flat(9, 18, '#e9a66c', 0, 0)
const LINIE = 0.05
for (const z of [-9, -3, 0, 3, 9]) flat(9 + LINIE, LINIE, '#ffffff', 0, z, 0.003)
for (const x of [-4.5, 4.5]) flat(LINIE, 18, '#ffffff', x, 0, 0.003)

// Netz: halbtransparente Fläche, weisses Band oben, Pfosten, Antennen
const netz = new THREE.Mesh(
  new THREE.PlaneGeometry(9.8, 1),
  new THREE.MeshStandardMaterial({ color: '#222', transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
)
netz.position.set(0, NETZ - 0.5, 0)
scene.add(netz)
const band = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.07, 0.02), new THREE.MeshStandardMaterial({ color: '#fff' }))
band.position.set(0, NETZ - 0.035, 0)
scene.add(band)
for (const x of [-5.2, 5.2]) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, NETZ + 0.15), new THREE.MeshStandardMaterial({ color: '#ddd' }))
  p.position.set(x, (NETZ + 0.15) / 2, 0)
  p.castShadow = true
  scene.add(p)
}
for (const x of [-4.5, 4.5]) {
  const a = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.8), new THREE.MeshStandardMaterial({ color: '#d33' }))
  a.position.set(x, NETZ, 0)
  scene.add(a)
}

// Ball: gelb-blau gestreift
const ballTex = (() => {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 64 })
  const g = c.getContext('2d')
  ;['#ffd400', '#1d4fa0', '#ffffff'].forEach((col, i) => {
    g.fillStyle = col
    for (let k = i; k < 6; k += 3) g.fillRect((k * 256) / 6, 0, 256 / 6 + 1, 64)
  })
  return new THREE.CanvasTexture(c)
})()
ballTex.colorSpace = THREE.SRGBColorSpace
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex }))
ball.castShadow = true
scene.add(ball)

// ---------- Figuren ----------
const gltf = await new GLTFLoader().loadAsync('models/Xbot.glb')
const figur = figurenFabrik(gltf)
const neueFigur = (opts) => {
  const f = figur(opts)
  scene.add(f.g)
  return f
}

let data = await (await fetch('laeufer.json', { cache: 'no-store' })).json()
const spieler = Object.fromEntries(SPIELER.map((id) => [id, neueFigur({ text: `${id} ${data.rollen[id]}`, nummer: id })]))
const libero = neueFigur({ text: 'L Libero', nummer: 'L' })
libero.setColor(FARBE.libero)
const figuren = { ...spieler, L: libero } // Schlüssel '1'–'6' und 'L'

// Libero: spielt für den hinteren Mitte – ausser dieser schlägt gerade selbst auf (Position 1).
// Positionen: der Pass steht im Läufer L auf Position L, die anderen folgen in Aufschlagreihenfolge.
let mitLibero = true
let liberoFuer = null // ID des Mitte, für den der Libero gerade spielt
const position = (id, l) => ((+id - 1 + +l - 1) % 6) + 1
const schluessel = (id) => (id === liberoFuer ? 'L' : id)
const figurVon = (id) => figuren[schluessel(id)]
function besetzung() {
  const m = SPIELER.find((id) => data.rollen[id] === 'Mitte' && [1, 5, 6].includes(position(id, cur.l)))
  const schlaegtAuf = cur.sit === 'aufschlag' && position(m, cur.l) === 1
  liberoFuer = mitLibero && m && !schlaegtAuf ? m : null
  libero.g.visible = mitLibero
  if (!mitLibero && fokus === 'L') fokus = ''
}
// Wer gerade draussen steht: der ersetzte Mitte, oder der Libero, wenn der Mitte aufschlägt.
const draussen = () => (liberoFuer ? spieler[liberoFuer] : mitLibero ? libero : null)

const gegner = []
function gegnerFigur(i) {
  if (!gegner[i]) {
    gegner[i] = neueFigur()
    gegner[i].setColor(FARBE.gegner)
    gegner[i].yaw = 0 // schaut zum Netz (+z)
  }
  return gegner[i]
}

// ---------- Wege (wie auf den Blättern) ----------
const wege = new THREE.Group()
scene.add(wege)
const punktGeo = new THREE.CircleGeometry(0.05, 8).rotateX(-Math.PI / 2)
const wegMat = new THREE.MeshBasicMaterial({ color: '#b3261e' })
const ballPunktGeo = new THREE.SphereGeometry(0.035, 6, 4)
const ballMat = new THREE.MeshBasicMaterial({ color: '#ffd400' })
const kreuzGeo = new THREE.BoxGeometry(0.55, 0.01, 0.07)

function punkte(pts, geo, mat, abstand) {
  for (let i = 1; i < pts.length; i++) {
    const n = Math.max(1, Math.ceil(pts[i - 1].distanceTo(pts[i]) / abstand))
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, mat)
      m.position.lerpVectors(pts[i - 1], pts[i], k / n)
      wege.add(m)
    }
  }
}

function zeichneWege() {
  wege.clear()
  for (const id of SPIELER) {
    if (fokus && schluessel(id) !== fokus) continue
    const pts = steps.map((s) => welt(s[id], 0.015)).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 0.05)
    if (pts.length < 2) continue
    punkte(pts, punktGeo, wegMat, 0.25)
    for (const r of [1, -1]) {
      const x = new THREE.Mesh(kreuzGeo, wegMat)
      x.position.copy(pts.at(-1))
      x.rotation.y = (r * Math.PI) / 4
      wege.add(x)
    }
  }
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1].ball
    const b = steps[i].ball
    const pts = Array.from({ length: 31 }, (_, k) => {
      const p = ballAt(a, b, k / 30)
      return welt(p, p[2])
    })
    punkte(pts, ballPunktGeo, ballMat, 0.35)
  }
}

// ---------- Zustand ----------
let cur = { l: '1', sit: 'annahme' }
let steps
let times
let kontakte = []
let t = 0
let playing = false
let speed = 1
let tour = null
let edit = false
let editStep = 0
let dirty = false
let fokus = '' // Figur im Fokus ('1'–'6', 'L') oder ''
let entsperrt = false // Bearbeiten erst nach 5× Leertaste sichtbar
const total = () => times.at(-1)

// Wer spielt in Schritt i den Ball, und wie? (Höhe entscheidet: Bagger / Pritschen / Schlag)
function findeKontakte() {
  let n = 0
  kontakte = steps.map((s, i) => {
    const art = i === 0 || s.ball[2] >= 2.9 ? 'schlag' : s.ball[2] < 1.5 ? 'bagger' : 'pritschen'
    const k = { t: times[i], art, sprung: i > 0 && art === 'schlag' }
    if (s.ball[1] < 0) {
      const f = gegnerFigur(n++)
      f.g.position.copy(welt([s.ball[0], s.ball[1] - 0.3]))
      f.g.visible = true
      return { ...k, f, gegner: true }
    }
    let best = null
    for (const id of SPIELER) {
      const d = Math.hypot(s[id][0] - s.ball[0], s[id][1] - s.ball[1])
      if (d < 1 && (!best || d < best.d)) best = { d, f: figurVon(id) }
    }
    return best && { ...k, f: best.f }
  })
  gegner.slice(n).forEach((f) => (f.g.visible = false))
}

const schrittName = (i) =>
  i === 0 ? 'Start' : kontakte[i]?.gegner ? 'Ball drüben' : (KONTAKT[kontakte[i]?.art] ?? `Schritt ${i}`)

function aufbauen() {
  times = timeline(steps)
  zeichneWege()
  findeKontakte()
  schrittKnoepfe()
}

function laden(l, sit) {
  cur = { l, sit }
  steps = data.laeufer[l][sit]
  t = 0
  playing = false
  editStep = 0
  for (const id of SPIELER) spieler[id].setColor(data.rollen[id] === 'Pass' ? FARBE.pass : FARBE[sit])
  besetzung()
  setFokus(fokus, false)
  aufbauen()
  ui()
}

function titel(text) {
  $('#title').textContent = text
  $('#title').classList.add('show')
  clearTimeout(titel.timer)
  titel.timer = setTimeout(() => $('#title').classList.remove('show'), 1600)
}

// ---------- Animation ----------
// Arm-Pose rund um einen Ballkontakt: einblenden, halten, ausblenden; beim Angriff abspringen.
function kontaktFuer(f) {
  let best = null
  for (const k of kontakte) {
    if (k?.f !== f) continue
    const d = t - k.t
    const w = d < -0.45 ? 0 : d < 0 ? 1 + d / 0.45 : d < 0.35 ? 1 : d < 0.7 ? 2 - d / 0.35 : 0
    const sprung = k.sprung && d > -0.45 && d < 0.3 ? Math.sin((Math.PI * (d + 0.45)) / 0.75) : 0
    if (w > (best?.w ?? 0)) best = { art: k.art, w, sprung }
  }
  return best
}

function pose(dt) {
  const s = sample(steps, times, t)
  const s2 = sample(steps, times, t + 0.05)
  ball.position.copy(welt(s.ball, s.ball[2]))
  if (playing) ball.rotation.x += dt * speed * 8
  const mixDt = playing ? dt * speed : dt
  for (const id of SPIELER) {
    const f = figurVon(id)
    const p = welt(s[id])
    const v = welt(s2[id]).sub(p)
    const tempo = playing ? v.length() / 0.05 : 0
    f.g.position.copy(p)
    // laufen: in Laufrichtung, stehen: zum Ball, falls er vorne ist, sonst zum Netz
    const yaw =
      tempo > 0.3 ? Math.atan2(v.x, v.z)
      : s.ball[1] < s[id][1] - 0.3 ? Math.atan2(ball.position.x - p.x, ball.position.z - p.z)
      : Math.PI
    f.update(dt, mixDt, { tempo, yaw, kontakt: kontaktFuer(f) })
  }
  for (const f of gegner) if (f.g.visible) f.update(dt, mixDt, { tempo: 0, yaw: 0, kontakt: kontaktFuer(f) })
  const bank = draussen()
  if (bank) {
    const p = welt(BANK)
    bank.g.position.copy(p)
    bank.update(dt, mixDt, { tempo: 0, yaw: Math.atan2(ball.position.x - p.x, ball.position.z - p.z), kontakt: null })
  }
}

function durchlauf(dt) {
  if (tour.pause) return
  if (tour.wait > 0) return void (tour.wait -= dt)
  if (t < total()) return void (playing = true)
  if (!tour.fertig) return void Object.assign(tour, { fertig: true, wait: 1.2 })
  if (++tour.i >= DURCHLAUF.length) return stopTour()
  startTourSzene()
}
function startTourSzene() {
  const [l, sit] = DURCHLAUF[tour.i]
  laden(l, sit)
  Object.assign(tour, { wait: 1.5, fertig: false })
  titel(`Läufer ${l} · ${SITUATION[sit]}`)
}
function stopTour() {
  tour = null
  playing = false
  ui()
}

// Fokus: andere Spieler blass, nur seine Laufwege, in 3D folgt die Kamera.
function setFokus(id, kamera = true) {
  fokus = id
  for (const [k, f] of Object.entries(figuren)) f.setFokus(!id ? 'normal' : k === id ? 'fokus' : 'blass')
  zeichneWege()
  if (!kamera) return
  if (!id) setAnsicht(ansicht)
  else if (ansicht === '3d') {
    const p = figuren[id].g.position
    const abstand = camera.aspect < 1 ? new THREE.Vector3(0, 5, 9) : new THREE.Vector3(0, 3.2, 6)
    tween({ pos: p.clone().add(abstand), ziel: p.clone().setY(0.9) })
  }
  ui()
}
function folgen(dt) {
  const off = camera.position.clone().sub(controls.target)
  controls.target.lerp(figuren[fokus].g.position.clone().setY(0.9), 1 - Math.exp(-5 * dt))
  camera.position.copy(controls.target).add(off)
}

let camTween = null
let ansicht = '3d'
const tween = (nach) => (camTween = { k: 0, von: { pos: camera.position.clone(), ziel: controls.target.clone() }, nach })
function setAnsicht(name) {
  ansicht = name
  tween(ansichtFuer(name))
  ui()
}

const timer = new THREE.Timer()
renderer.setAnimationLoop(() => {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.1)
  if (tour) durchlauf(dt)
  if (playing) {
    t += dt * speed
    if (t >= total()) {
      t = total()
      playing = false
    }
  }
  if (camTween) {
    camTween.k = Math.min(1, camTween.k + dt / 0.7)
    const e = 1 - (1 - camTween.k) ** 3
    camera.position.lerpVectors(camTween.von.pos, camTween.nach.pos, e)
    controls.target.lerpVectors(camTween.von.ziel, camTween.nach.ziel, e)
    if (camTween.k === 1) camTween = null
  }
  pose(dt)
  if (fokus && ansicht === '3d' && !camTween && !edit) folgen(dt)
  controls.update()
  zeitUi()
  renderer.render(scene, camera)
  labels.render(scene, camera)
})

let hochformat = null
function resize() {
  const { clientWidth: w, clientHeight: h } = box
  renderer.setSize(w, h)
  labels.setSize(w, h)
  camera.aspect = w / h
  camera.fov = camera.aspect < 1 ? 65 : 45
  camera.updateProjectionMatrix()
  if (hochformat !== null && hochformat !== camera.aspect < 1) setAnsicht(ansicht) // Handy gedreht
  hochformat = camera.aspect < 1
}
addEventListener('resize', resize)
resize()
camera.position.copy(ansichtFuer('3d').pos)
controls.target.copy(ansichtFuer('3d').ziel)
camTween = null

// ---------- Bedienung ----------
for (const l of SPIELER) {
  const b = Object.assign(document.createElement('button'), { textContent: l, title: `Läufer ${l}` })
  b.dataset.l = l
  $('#laeufer').append(b)
}
const alle = (sel, fn) => document.querySelectorAll(sel).forEach(fn)

function ui() {
  $('#ueberschrift').textContent =
    `Läufer ${cur.l} · ${SITUATION[cur.sit]}` + (tour ? `  (${tour.i + 1}/${DURCHLAUF.length})` : '')
  alle('[data-l]', (b) => b.classList.toggle('on', b.dataset.l === cur.l))
  alle('[data-sit]', (b) => b.classList.toggle('on', b.dataset.sit === cur.sit))
  alle('[data-ansicht]', (b) => b.classList.toggle('on', b.dataset.ansicht === ansicht))
  alle('[data-tempo]', (b) => b.classList.toggle('on', +b.dataset.tempo === speed))
  $('#tour').textContent = tour ? '■ Stopp' : '▶▶ Durchlauf'
  $('#tour').classList.toggle('on', !!tour)
  $('#fokus').value = fokus
  $('#fokus').querySelector('[value=L]').disabled = !mitLibero
  $('#libero').checked = mitLibero
  $('#edit').hidden = !entsperrt
  $('#edit').classList.toggle('on', edit)
  $('#player').hidden = edit
  $('#editor').hidden = !edit
  document.body.classList.toggle('edit', edit)
  $('#download').textContent = dirty ? '⬇ JSON herunterladen •' : '⬇ JSON herunterladen'
}

// Zeitleiste mit Phasen (Start · Annahme · Zuspiel · Angriff)
function zeitUi() {
  $('#time').value = total() ? (t / total()) * 1000 : 0
  $('#play').textContent = playing || (tour && !tour.pause) ? '❚❚' : '▶'
  const aktiv = times.findLastIndex((x) => x <= t + 1e-6)
  alle('.marke', (b, i) => b.classList.toggle('on', i === aktiv))
}
function marken() {
  const el = $('#marken')
  el.replaceChildren()
  steps.forEach((_, i) => {
    const b = Object.assign(document.createElement('button'), { className: 'marke', textContent: schrittName(i) })
    b.style.left = `${total() ? (times[i] / total()) * 100 : 0}%`
    b.onclick = () => geheZuSchritt(i)
    el.append(b)
  })
}

$('#laeufer').onclick = (e) => e.target.dataset.l && (stopTour(), laden(e.target.dataset.l, cur.sit))
alle('[data-sit]', (b) => (b.onclick = () => (stopTour(), laden(cur.l, b.dataset.sit))))
alle('[data-ansicht]', (b) => (b.onclick = () => setAnsicht(b.dataset.ansicht)))
alle('[data-tempo]', (b) => (b.onclick = () => ((speed = +b.dataset.tempo), ui())))
function togglePlay() {
  if (tour) {
    tour.pause = !tour.pause // Durchlauf anhalten / weiter
    playing = false
    return
  }
  if (t >= total()) t = 0
  playing = !playing
}
$('#play').onclick = togglePlay
$('#time').oninput = (e) => {
  playing = false
  if (tour) tour.pause = true
  t = (e.target.value / 1000) * total()
}
$('#tour').onclick = () => {
  if (tour) return stopTour()
  tour = { i: 0 }
  startTourSzene()
}
$('#paths').onchange = (e) => (wege.visible = e.target.checked)

// Fokus: Auswahl, Klick aufs Namensschild oder auf die Figur
for (const [id, f] of Object.entries(figuren)) {
  $('#fokus').append(new Option(id === 'L' ? 'L Libero' : `${id} ${data.rollen[id]}`, id))
  f.el.onclick = () => setFokus(fokus === id ? '' : id)
}
$('#fokus').onchange = (e) => setFokus(e.target.value)
$('#libero').onchange = (e) => {
  mitLibero = e.target.checked
  besetzung()
  setFokus(fokus, false)
  aufbauen()
  ui()
}
let tippStart = null
renderer.domElement.addEventListener('pointerdown', (e) => (tippStart = [e.clientX, e.clientY]))
renderer.domElement.addEventListener('pointerup', (e) => {
  if (edit || !tippStart || Math.hypot(e.clientX - tippStart[0], e.clientY - tippStart[1]) > 6) return
  const r = renderer.domElement.getBoundingClientRect()
  let best = null
  for (const [id, f] of Object.entries(figuren)) {
    if (!f.g.visible) continue
    const p = f.g.position.clone().setY(1.1).project(camera)
    const d = Math.hypot(((p.x + 1) / 2) * r.width - (e.clientX - r.left), ((1 - p.y) / 2) * r.height - (e.clientY - r.top))
    if (d < 45 && (!best || d < best.d)) best = { id, d }
  }
  if (best) setFokus(fokus === best.id ? '' : best.id)
})

// Geheim: 5× Leertaste (Handy: 5× auf die Überschrift tippen) blendet „Bearbeiten“ ein/aus.
let tipps = []
function geheimTipp() {
  const jetzt = performance.now()
  tipps = [...tipps.filter((x) => jetzt - x < 2500), jetzt]
  if (tipps.length < 5) return
  tipps = []
  entsperrt = !entsperrt
  playing = false
  if (tour) tour.pause = true
  if (!entsperrt) bearbeiten(false)
  titel(entsperrt ? 'Bearbeiten freigeschaltet' : 'Bearbeiten ausgeblendet')
  ui()
}
$('#ueberschrift').onclick = geheimTipp
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target.type !== 'number' && e.target.tagName !== 'SELECT') {
    e.preventDefault()
    togglePlay()
    geheimTipp()
  }
})

// ---------- Editor ----------
function geheZuSchritt(i) {
  editStep = i
  playing = false
  if (tour) tour.pause = true
  t = times[i]
  schrittKnoepfe()
}
function schrittKnoepfe() {
  marken()
  const el = $('#steps')
  el.replaceChildren()
  steps.forEach((_, i) => {
    const b = Object.assign(document.createElement('button'), { textContent: schrittName(i) })
    b.classList.toggle('on', i === editStep)
    b.onclick = () => geheZuSchritt(i)
    el.append(b)
  })
  $('#bh').value = steps[editStep].ball[2]
}
function geaendert() {
  dirty = true
  aufbauen()
  t = times[editStep]
  ui()
}

function bearbeiten(an) {
  stopTour()
  edit = an
  if (edit) {
    setAnsicht('oben')
    geheZuSchritt(0)
  }
  ui()
}
$('#edit').onclick = () => bearbeiten(!edit)
$('#fertig').onclick = () => bearbeiten(false)
$('#add').onclick = () => {
  steps.splice(editStep + 1, 0, structuredClone(steps[editStep]))
  editStep++
  geaendert()
}
$('#del').onclick = () => {
  if (steps.length < 2) return
  steps.splice(editStep, 1)
  editStep = Math.min(editStep, steps.length - 1)
  geaendert()
}
$('#bh').onchange = (e) => {
  steps[editStep].ball[2] = Math.max(0, +e.target.value)
  geaendert()
}
// Änderungen bleiben im Browser; Download ersetzt public/laeufer.json im Projekt.
$('#download').onclick = () => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([toJson(data)], { type: 'application/json' }))
  a.download = 'laeufer.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  dirty = false
  $('#status').textContent = 'Heruntergeladen ✓'
  ui()
}
addEventListener('beforeunload', (e) => dirty && e.preventDefault())

// Ziehen: Strahl auf den Boden, nächster Spieler oder Ball im aktuellen Schritt
const ray = new THREE.Raycaster()
const boden = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
function bodenPunkt(e) {
  const r = renderer.domElement.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
  return ray.ray.intersectPlane(boden, new THREE.Vector3())
}
let drag = null
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!edit) return
  const p = bodenPunkt(e)
  if (!p) return
  const [x, y] = team(p)
  const s = steps[editStep]
  let best = null
  for (const k of [...SPIELER, 'ball']) {
    const d = Math.hypot(s[k][0] - x, s[k][1] - y)
    if (d < 0.8 && (!best || d < best.d)) best = { k, d }
  }
  if (!best) return
  // Folgeschritte, in denen er noch am selben Ort steht, ziehen mit
  const mit = [s[best.k]]
  for (let j = editStep + 1; j < steps.length; j++) {
    const q = steps[j][best.k]
    if (Math.hypot(q[0] - s[best.k][0], q[1] - s[best.k][1]) > 0.01) break
    mit.push(q)
  }
  drag = mit
  controls.enabled = false
  renderer.domElement.setPointerCapture(e.pointerId)
}, { capture: true }) // vor OrbitControls, damit die Kamera beim Ziehen stillhält
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!drag) return
  const p = bodenPunkt(e)
  if (!p) return
  const [x, y] = team(p)
  for (const q of drag) {
    q[0] = x
    q[1] = y
  }
  geaendert()
})
renderer.domElement.addEventListener('pointerup', () => {
  drag = null
  controls.enabled = true
})

laden('1', 'annahme')
