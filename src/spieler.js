// Volleyballer auf Basis der Xbot-Figur: Trikot/Hose/Knieschoner per Shader,
// Bereitschaftsstellung, Bagger / Pritschen / Schlag beim Ballkontakt.
import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

const farbe = (c) => ({ value: new THREE.Color(c) })
const KLEIDUNG = {
  uHaut: farbe('#d9a07a'),
  uHose: farbe('#1b1d24'),
  uSchoner: farbe('#222222'),
  uSocke: farbe('#f4f4f4'),
  uSchuh: farbe('#e8e8e8'),
}
const HAARE = ['#3b2a1e', '#1c1612', '#8a5a2b', '#d8b46a', '#5a3a22', '#2a1d14', '#6b4a2e']

// Farbe nach Körperstelle in der Grundpose (Meter, 1.81 m gross, schaut nach +z, Arme seitlich gestreckt).
const KIT_GLSL = /* glsl */ `
varying vec3 vBind;
uniform vec3 uTrikot, uHaare, uHaut, uHose, uSchoner, uSocke, uSchuh;
uniform sampler2D uNummer;
bool nummer(vec2 uv) {
  return all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0))) && texture2D(uNummer, uv).a > 0.5;
}
vec3 kit(vec3 p) {
  float ax = abs(p.x);
  if (p.y > 1.25 && ax > 0.22) return ax < 0.28 ? uTrikot : uHaut;   // Arme, kurze Ärmel
  if (p.y > 1.72 || (p.y > 1.6 && p.z < -0.02)) return uHaare;
  if (p.y > 1.56 || (p.y > 1.49 && ax < 0.085)) return uHaut;       // Kopf, Hals
  if (p.y > 1.08) {                                                  // Trikot mit Nummer
    vec2 uv = p.z < 0.0 ? vec2((0.13 - p.x) / 0.26, (p.y - 1.17) / 0.26) : vec2((p.x + 0.065) / 0.13, (p.y - 1.28) / 0.13);
    return nummer(uv) ? vec3(1.0) : uTrikot;
  }
  if (p.y > 0.8) return uHose;
  if (p.y > 0.45 && p.y < 0.62) return uSchoner;
  if (p.y < 0.11) return uSchuh;
  if (p.y < 0.24) return uSocke;
  return uHaut;
}
`

function kleiden(mat, uniforms) {
  mat.metalness = 0
  mat.roughness = 0.8
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = 'varying vec3 vBind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;')
    sh.fragmentShader = KIT_GLSL + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = kit(vBind);')
  }
}

function nummerTextur(n) {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 })
  const g = c.getContext('2d')
  g.font = 'bold 110px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#fff'
  g.fillText(n, 64, 70)
  return new THREE.CanvasTexture(c)
}

// Zielrichtungen der Arme (Welt), aus Blickrichtung F, Seite S (+1 links/-1 rechts), Links-Vektor L, oben U.
const POSEN = {
  bereit: (F, L, U, s) => [
    [F, 0.45, U, -0.85, L, 0.2 * s],
    [F, 0.9, U, -0.25, L, -0.15 * s],
  ],
  bagger: (F, L, U, s) => [
    [F, 0.75, U, -0.6, L, -0.12 * s],
    [F, 0.8, U, -0.55, L, -0.3 * s],
  ],
  pritschen: (F, L, U, s) => [
    [F, 0.3, U, 0.75, L, 0.55 * s],
    [F, 0.35, U, 0.8, L, -0.45 * s],
  ],
  schlag: (F, L, U, s) =>
    s < 0
      ? [[F, -0.15, U, 0.95, L, -0.25], [F, 0.1, U, 1, L, 0]] // rechter Schlagarm hoch
      : [[F, 0.7, U, 0.6, L, 0.2], [F, 0.8, U, 0.5, L, 0]],
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _d = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _p = new THREE.Quaternion()
const EINS = new THREE.Quaternion()

// Dreht einen Knochen so, dass er (Richtung zum Kind) nach `dir` zeigt – Gewicht w, achsenunabhängig.
function zielen(bone, child, dir, w) {
  bone.getWorldPosition(_a)
  child.getWorldPosition(_b)
  _q.setFromUnitVectors(_b.sub(_a).normalize(), dir)
  _q.slerp(EINS, 1 - w)
  bone.parent.getWorldQuaternion(_p)
  bone.quaternion.premultiply(_p.clone().invert().multiply(_q).multiply(_p))
  bone.updateMatrixWorld(true)
}

export function figurenFabrik(gltf) {
  const clip = (n) => gltf.animations.find((a) => a.name === n)
  const bereitClip = THREE.AnimationUtils.subclip(
    THREE.AnimationUtils.makeClipAdditive(clip('sneak_pose').clone()),
    'bereit',
    2,
    3,
    30,
  )
  let zaehler = 0

  return function figur({ text = '', nummer = '' } = {}) {
    const root = SkeletonUtils.clone(gltf.scene)
    root.scale.setScalar(1.03) // ~1.86 m
    const uniforms = {
      ...KLEIDUNG,
      uTrikot: farbe('#888'),
      uHaare: farbe(HAARE[zaehler++ % HAARE.length]),
      uNummer: { value: nummerTextur(nummer) },
    }
    const mats = []
    root.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.material = o.material.clone()
      o.material.transparent = true // für den Fokus: andere Spieler blass
      kleiden(o.material, uniforms)
      mats.push(o.material)
    })
    const knochen = (n) => root.getObjectByName(`mixamorig${n}`)
    const arme = [1, -1].map((s) => {
      const seite = s > 0 ? 'Left' : 'Right'
      return { s, oben: knochen(`${seite}Arm`), unten: knochen(`${seite}ForeArm`), hand: knochen(`${seite}Hand`) }
    })

    const g = new THREE.Group()
    g.add(root)
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true }),
    )
    disc.position.y = 0.01
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial())
    ring.position.y = 0.011
    g.add(disc, ring)
    const el = Object.assign(document.createElement('div'), { className: 'lbl', textContent: text })
    if (text) {
      const lbl = new CSS2DObject(el)
      lbl.position.y = 2.25
      g.add(lbl)
    }

    const mixer = new THREE.AnimationMixer(root)
    const actions = Object.fromEntries(['idle', 'walk', 'run'].map((n) => [n, mixer.clipAction(clip(n))]))
    actions.idle.play()
    const bereitAction = mixer.clipAction(bereitClip)
    bereitAction.setEffectiveWeight(0).play()

    const f = { g, el, anim: 'idle', yaw: Math.PI, bereit: 1 }
    f.setColor = (c) => {
      uniforms.uTrikot.value.set(c)
      disc.material.color.set(c)
      el.style.background = c
    }
    // 'normal' | 'fokus' (hervorgehoben) | 'blass'
    f.setFokus = (z) => {
      const o = z === 'blass' ? 0.2 : 1
      mats.forEach((m) => (m.opacity = o))
      disc.material.opacity = z === 'blass' ? 0.3 : 1
      el.style.opacity = z === 'blass' ? 0.4 : 1
      ring.material.color.set(z === 'fokus' ? '#f0a24a' : '#ffffff')
      ring.scale.setScalar(z === 'fokus' ? 1.3 : 1)
    }
    function setAnim(name, timeScale) {
      actions[name].timeScale = timeScale
      if (name === f.anim) return
      actions[f.anim].fadeOut(0.2)
      actions[name].reset().fadeIn(0.2).play()
      f.anim = name
    }

    // tempo m/s, yaw = Blickziel, kontakt = { art, w, sprung } oder null
    f.update = (dt, mixDt, { tempo, yaw, kontakt }) => {
      f.yaw += ((((yaw - f.yaw) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * (1 - Math.exp(-10 * dt))
      root.rotation.y = f.yaw
      if (tempo < 0.3) setAnim('idle', 1)
      else if (tempo < 2.5) setAnim('walk', tempo / 1.5)
      else setAnim('run', Math.min(1.6, tempo / 5))
      f.bereit += ((tempo < 0.3 ? 1 : 0) - f.bereit) * (1 - Math.exp(-8 * dt))
      bereitAction.setEffectiveWeight(f.bereit * 0.9)
      mixer.update(mixDt)
      root.position.y = (kontakt?.sprung ?? 0) * 0.55
      root.updateMatrixWorld(true)

      const F = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw))
      const L = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw))
      const U = new THREE.Vector3(0, 1, 0)
      const posen = [['bereit', f.bereit * 0.8]]
      if (kontakt?.w > 0) posen.push([kontakt.art, kontakt.w])
      for (const [art, w] of posen) {
        for (const arm of arme) {
          const [o, u] = POSEN[art](F, L, U, arm.s).map(([a, ka, b, kb, c, kc]) =>
            _d.set(0, 0, 0).addScaledVector(a, ka).addScaledVector(b, kb).addScaledVector(c, kc).normalize().clone(),
          )
          zielen(arm.oben, arm.unten, o, w)
          zielen(arm.unten, arm.hand, u, w)
        }
      }
    }
    return f
  }
}
