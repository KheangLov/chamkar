/**
 * The farm in 3D, in plain three.js: a sunny yard seen from above at an angle, with soft shadows,
 * the pen and its grass, the buildings, and every animal, good and monkey following the engine.
 * Labels (the barn's count, prices, timers, the monkeys' health) are crisp HTML laid over the canvas
 * at the right spots. The view never changes the game: it reads the engine's state each frame and
 * reacts to its events with effects. Taps are turned back into board points for the engine.
 *
 * Quality 'high': shadows, antialiasing, up to 2x pixel ratio. 'low': no shadows, 1x pixels.
 */
import {
  ACESFilmicToneMapping, ClampToEdgeWrapping, Color, DirectionalLight, Fog, Group, HemisphereLight, IcosahedronGeometry, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, PCFSoftShadowMap, PerspectiveCamera, Plane, PlaneGeometry, Quaternion, Raycaster,
  RingGeometry, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, type Object3D,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  ANIMALS, ITEM_ORDER, PEN, SPOTS, WORKSHOPS, WORLDS, tileX, tileY,
  type Engine, type GameEvent, type ItemId, type LevelDef,
} from '#shared/game'
import { iconUrl } from './icons'
import { bake, geo, mat, paint, part, rng, speckle } from './kit'
import { makeModel, type ModelName } from './models'

export type Quality = 'high' | 'low'

/** Board units to world units (one world unit is 100 board units; the board's centre is 0). */
export const wx = (bx: number) => (bx - 640) / 100
export const wz = (by: number) => (by - 360) / 100
const bx = (x: number) => x * 100 + 640
const by = (z: number) => z * 100 + 360

/** Where each building's footprint is centred, in board units (the 2D spots are its bottom edge). */
const BUILDINGS = {
  well: { x: SPOTS.well.x, y: SPOTS.well.y - 60 },
  barn: { x: SPOTS.barn.x, y: SPOTS.barn.y - 70 },
  truck: { x: SPOTS.truck.x - 10, y: SPOTS.truck.y - 46 },
}
const slotPos = (slot: number) => ({ x: SPOTS.slots[slot]!.x, y: SPOTS.slots[slot]!.y - 72 })

interface Particle { on: boolean, p: Vector3, v: Vector3, life: number, max: number, size: number, g: number }
interface Popup { el: HTMLElement, p: Vector3, t: number }
interface Flyer { obj: Object3D, from: Vector3, t: number }
interface Pick { obj: Object3D, x: number, y: number }

export interface Hover { r: number, c: number }

export class FarmView {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(30, 1, 0.5, 120)
  private sun: DirectionalLight
  private root = new Group()
  private grass: Mesh[] = []
  private animals = new Map<number, { obj: Group, pose: Object3D, head: Object3D | null, yaw: number, px: number, pz: number }>()
  private goods = new Map<number, Group>()
  private monkeys = new Map<number, { obj: Group, pose: Object3D, carry: ItemId | null, carryObj: Object3D | null, yaw: number }>()
  private workshops: { slot: number, built: boolean, obj: Group, plot: Group, x: number, z: number }[] = []
  private well!: Group
  private barn!: Group
  private truck!: Group
  private truckLoad = ''
  private truckGoods = new Group()
  private hoverMesh: Mesh
  private picks: Pick[] = []
  private parts: Particle[] = []
  private partMesh: InstancedMesh
  private rings: { mesh: Mesh, t: number }[] = []
  private popups: Popup[] = []
  private flyers: Flyer[] = []
  private nudge = new Map<string, number>()
  private overlay: HTMLElement
  private labels = new Map<string, { el: HTMLElement, html: string, seen: boolean }>()
  private time = 0
  private lastStats = -1
  private shake = 0
  private width = 1
  private height = 1
  private ray = new Raycaster()
  private v = new Vector3()
  private m4 = new Matrix4()
  private q = new Quaternion()
  reducedMotion = false

  /** A turning view for menus (no labels, a lower camera), or the game's own fixed view. */
  readonly scenic: boolean
  private yaw = 0

  constructor(private canvas: HTMLCanvasElement, overlay: HTMLElement, private level: LevelDef, private fmt: (n: number) => string, readonly quality: Quality, opts: { scenic?: boolean } = {}) {
    this.scenic = !!opts.scenic
    this.overlay = overlay
    this.renderer = new WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.shadowMap.enabled = quality === 'high'
    this.renderer.shadowMap.type = PCFSoftShadowMap

    const world = WORLDS[level.world]!
    const p = world.palette
    this.scene.background = new Color(p.edge)
    this.scene.fog = new Fog(p.edge, 22, 46)
    this.scene.add(new HemisphereLight('#e8f4ff', '#6a7a4a', 1.25))
    this.sun = new DirectionalLight(world.dry ? '#ffe2b0' : '#fff1d6', 2.4)
    this.sun.position.set(-5, 11, 6)
    this.sun.castShadow = quality === 'high'
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -9
    this.sun.shadow.camera.right = 9
    this.sun.shadow.camera.top = 7
    this.sun.shadow.camera.bottom = -7
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 30
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.02
    this.scene.add(this.sun)
    this.scene.add(this.root)

    this.buildGround()
    this.buildPen()
    this.buildDecor()
    this.buildBuildings()

    this.hoverMesh = new Mesh(new RingGeometry(0.33, 0.38, 4, 1), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }))
    this.hoverMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 4)
    this.hoverMesh.position.y = 0.04
    this.hoverMesh.visible = false
    this.root.add(this.hoverMesh)

    const n = quality === 'high' ? 420 : 200
    this.partMesh = new InstancedMesh(new IcosahedronGeometry(1, 0), mat('#ffffff', { rough: 0.5 }), n)
    this.partMesh.frustumCulled = false
    for (let i = 0; i < n; i++) {
      this.parts.push({ on: false, p: new Vector3(), v: new Vector3(), life: 0, max: 1, size: 0, g: 0 })
      this.m4.makeScale(0, 0, 0)
      this.partMesh.setMatrixAt(i, this.m4)
      this.partMesh.setColorAt(i, new Color('#ffffff'))
    }
    this.root.add(this.partMesh)
    for (let i = 0; i < 6; i++) {
      const mesh = new Mesh(new RingGeometry(0.85, 1, 40), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }))
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0.05
      mesh.visible = false
      this.root.add(mesh)
      this.rings.push({ mesh, t: 0 })
    }
  }

  /* ------------------------------ The world ------------------------------ */

  private buildGround() {
    const world = WORLDS[this.level.world]!
    const p = world.palette
    const grassTex = paint(`ground-${world.id}`, 256, (g, s) => {
      g.fillStyle = p.edge
      g.fillRect(0, 0, s, s)
      const R = rng(7)
      // Soft patches of lighter and darker grass, then fine blades.
      for (let i = 0; i < 40; i++) {
        const x = R() * s
        const y = R() * s
        const r = 20 + R() * 50
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, R() < 0.5 ? 'rgba(255,255,210,.12)' : 'rgba(0,50,0,.12)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
      g.lineWidth = 1.2
      for (let i = 0; i < 1400; i++) {
        const x = R() * s
        const y = R() * s
        g.strokeStyle = R() < 0.5 ? 'rgba(20,70,10,.22)' : 'rgba(230,255,190,.16)'
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + (R() - 0.5) * 3, y - 3 - R() * 4)
        g.stroke()
      }
    }, 14, 14)
    const ground = part(this.root, new PlaneGeometry(70, 70), mat('#ffffff', { rough: 1, map: grassTex }), [0, -0.01, 0], [-Math.PI / 2, 0, 0])
    ground.receiveShadow = true

    // The yard: packed earth with a soft edge into the grass, and the track along the bottom.
    const yardTex = paint(`yard-${world.id}`, 1024, (g, s) => {
      g.clearRect(0, 0, s, s)
      const h = s * (8.4 / 14.4)
      const y0 = (s - h) / 2
      g.save()
      g.shadowColor = p.yard
      g.shadowBlur = 40
      g.fillStyle = p.yard
      g.beginPath()
      g.roundRect(40, y0 + 30, s - 80, h - 60, 80)
      g.fill()
      g.restore()
      speckle(g, s, 11, [p.yardDark, 'rgba(255,255,255,.1)', 'rgba(90,60,30,.12)'], 1600, [1, 4])
      // The track from the barn to the tuk-tuk and off to market.
      const tx = (x: number) => (wx(x) + 7.2) / 14.4 * s
      const ty = (y: number) => y0 + (wz(y) + 4.2) / 8.4 * h
      g.fillStyle = p.yardDark
      g.beginPath()
      g.roundRect(tx(200), ty(628), s - tx(200), ty(712) - ty(628), 40)
      g.fill()
      g.strokeStyle = 'rgba(80,50,20,.25)'
      g.lineWidth = 6
      g.setLineDash([30, 22])
      for (const y of [650, 690]) {
        g.beginPath()
        g.moveTo(tx(240), ty(y))
        g.lineTo(s, ty(y))
        g.stroke()
      }
    })
    yardTex.wrapS = yardTex.wrapT = ClampToEdgeWrapping
    const yard = part(this.root, new PlaneGeometry(14.4, 14.4), mat('#ffffff', { rough: 1, map: yardTex, opacity: 0.999 }), [0, 0.002, 0], [-Math.PI / 2, 0, 0])
    yard.receiveShadow = true
    if (world.decor === 'river') {
      const water = part(this.root, new PlaneGeometry(3.2, 9), mat('#3fa8d8', { rough: 0.08, metal: 0.3 }), [7.6, 0.005, -0.5], [-Math.PI / 2, 0, 0.12])
      water.receiveShadow = true
    }
  }

  private buildPen() {
    const world = WORLDS[this.level.world]!
    const p = world.palette
    const w = PEN.cols * PEN.cell / 100
    const h = PEN.rows * PEN.cell / 100
    const cx = wx(PEN.x + PEN.cols * PEN.cell / 2)
    const cz = wz(PEN.y + PEN.rows * PEN.cell / 2)
    const soilTex = paint(`soil-${world.id}`, 512, (g, s) => {
      const c = s / PEN.cols
      const R = rng(21)
      for (let r = 0; r < PEN.rows * 2; r++) {
        for (let k = 0; k < PEN.cols; k++) {
          g.fillStyle = (r + k) % 2 ? p.soil : p.soilDark
          g.globalAlpha = 0.85 + R() * 0.15
          g.fillRect(k * c, r * c, c, c)
        }
      }
      g.globalAlpha = 1
      speckle(g, s, 5, ['rgba(60,30,10,.25)', 'rgba(255,230,190,.15)'], 1400, [1, 3])
      // Furrows.
      g.strokeStyle = 'rgba(60,30,10,.18)'
      g.lineWidth = 3
      for (let y = 6; y < s; y += 12) {
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(s, y)
        g.stroke()
      }
    })
    const soilMat = mat('#ffffff', { rough: 1, map: soilTex })
    soilTex.repeat.set(1, 0.5)
    const soil = part(this.root, geo.rbox(w + 0.08, 0.06, h + 0.08, 0.03), soilMat, [cx, 0.01, cz])
    soil.receiveShadow = true

    // Fence: posts and two rails all round.
    const woodMat = mat(p.fence, { rough: 0.85 })
    const postGeo = geo.rbox(0.07, 0.36, 0.07, 0.015)
    const x0 = cx - w / 2 - 0.08
    const x1 = cx + w / 2 + 0.08
    const z0 = cz - h / 2 - 0.08
    const z1 = cz + h / 2 + 0.08
    const fence = new Group()
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 20) {
      part(fence, postGeo, woodMat, [x, 0.18, z0])
      part(fence, postGeo, woodMat, [x, 0.18, z1])
    }
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 10) {
      part(fence, postGeo, woodMat, [x0, 0.18, z])
      part(fence, postGeo, woodMat, [x1, 0.18, z])
    }
    for (const y of [0.13, 0.28]) {
      part(fence, geo.box(x1 - x0, 0.04, 0.03), woodMat, [cx, y, z0])
      part(fence, geo.box(x1 - x0, 0.04, 0.03), woodMat, [cx, y, z1])
      part(fence, geo.box(0.03, 0.04, z1 - z0), woodMat, [x0, y, cz])
      part(fence, geo.box(0.03, 0.04, z1 - z0), woodMat, [x1, y, cz])
    }
    this.root.add(bake(fence, this.quality === 'high'))

    // A tuft of grass for every tile, grown or cut by the engine.
    const blades = []
    const R = rng(this.level.n * 3 + 1)
    for (let i = 0; i < 26; i++) {
      const b = geo.cone(0.022, 0.16 + R() * 0.1, 4).clone()
      b.rotateZ((R() - 0.5) * 0.7)
      b.rotateX((R() - 0.5) * 0.7)
      b.translate((R() - 0.5) * 0.66, 0.08, (R() - 0.5) * 0.66)
      blades.push(b)
    }
    const tuftGeo = mergeGeometries(blades)!
    const padGeo = geo.rbox(0.76, 0.02, 0.76, 0.08)
    for (let i = 0; i < PEN.rows * PEN.cols; i++) {
      const r = Math.floor(i / PEN.cols)
      const c = i % PEN.cols
      const tuft = new Mesh(tuftGeo, mat((r + c) % 2 ? p.grassA : p.grassB, { rough: 0.8 }))
      tuft.position.set(wx(tileX(c)), 0.04, wz(tileY(r)))
      tuft.rotation.y = (i % 4) * (Math.PI / 2)
      tuft.castShadow = this.quality === 'high'
      const pad = part(tuft, padGeo, mat(shadeHex(p.grassB, -0.1), { rough: 1 }), [0, -0.005, 0])
      pad.receiveShadow = true
      tuft.visible = false
      this.root.add(tuft)
      this.grass.push(tuft)
    }
  }

  private buildDecor() {
    const world = WORLDS[this.level.world]!
    const R = rng(this.level.n * 17 + 3)
    const decor = new Group()
    const put = (name: ModelName, x: number, z: number, s = 1, yaw = R() * Math.PI * 2) => {
      const m = makeModel(name)
      m.position.set(x, 0, z)
      m.scale.setScalar(s)
      m.rotation.y = yaw
      decor.add(m)
      return m
    }
    // Trees and bushes round the edge, for depth.
    for (let x = -9.5; x <= 9.5; x += 1.3 + R() * 0.6) put(R() < 0.75 ? 'tree' : 'bush', x, -4.6 - R() * 1.4, 1 + R() * 0.5)
    for (let z = -3.6; z <= 4.5; z += 1.2 + R()) {
      if (world.decor !== 'river') put(R() < 0.6 ? 'tree' : 'bush', 8.2 + R() * 1.4, z, 0.9 + R() * 0.4)
      put(R() < 0.6 ? 'tree' : 'bush', -8.2 - R() * 1.4, z, 0.9 + R() * 0.4)
    }
    for (let x = -7; x <= 7; x += 1.6 + R()) put('bush', x, 4.7 + R() * 0.6, 0.9 + R() * 0.4)
    const theme: Record<string, [ModelName, number, number, number][]> = {
      banana: [['banana', -5.9, -1.4, 1], ['banana', -4.0, -2.8, 0.8], ['banana', 5.7, -0.6, 1], ['banana', 5.4, 1.4, 0.85], ['bush', 6.0, 2.2, 1]],
      rice: [['banana', -5.9, -1.4, 1], ['rice', -4.1, -2.9, 1.2]],
      river: [['banana', -5.9, -1.4, 1], ['rice', -4.1, -2.9, 1.2], ['rice', 5.6, 0.4, 1.2], ['rice', 5.5, -1.5, 1]],
      temple: [['stupa', 5.9, -1.3, 1.1], ['stupa', 6.1, 1.0, 0.8], ['banana', -5.9, -1.4, 1], ['stupa', -4.0, -2.9, 0.8]],
      palms: [['palm', -5.9, -1.2, 1], ['palm', 5.6, -1.0, 1.05], ['palm', 6.0, 1.0, 0.9], ['palm', -4.0, -2.9, 0.75], ['palm', 5.4, 2.3, 0.8]],
      flags: [['palm', -5.9, -1.2, 1], ['palm', 5.8, 0.2, 1], ['banana', 5.4, 2.0, 0.85], ['rice', -4.1, -2.9, 1.2]],
    }
    for (const [name, x, z, s] of theme[world.decor]!) put(name, x, z, s)
    if (world.decor === 'rice' || world.decor === 'river') {
      for (let i = 0; i < 26; i++) put('rice', 5.2 + R() * 1.6, -3.4 + R() * 6, 0.9 + R() * 0.5)
    }
    if (world.decor === 'flags') {
      // Strings of festival pennants across the back of the yard.
      const colors = ['#ff6a90', '#ffd23f', '#4fc3f7', '#7ad06a', '#ff9a4a']
      for (let i = 0; i < 26; i++) {
        const t = i / 25
        const x = -6.6 + t * 13.2
        const f = put('flag', x, -3.9, 1, 0)
        f.position.y = 1.9 - Math.sin(t * Math.PI * 2) ** 2 * 0.35
        ;(f.children[0] as Mesh).material = mat(colors[i % colors.length]!, { rough: 0.6, side: 'double' })
      }
      for (const x of [-6.7, 6.7]) part(decor, geo.cyl(0.04, 0.05, 2, 8), mat('#8a5a34'), [x, 1, -3.9])
    }
    this.root.add(bake(decor, this.quality === 'high'))
  }

  private buildBuildings() {
    const place = (name: ModelName, pos: { x: number, y: number }, yaw = 0) => {
      const m = makeModel(name)
      m.position.set(wx(pos.x), 0, wz(pos.y))
      m.rotation.y = yaw
      this.root.add(m)
      return m
    }
    this.well = place('well', BUILDINGS.well)
    this.picks.push({ obj: this.well, x: SPOTS.well.x, y: SPOTS.well.y - 60 })
    this.barn = place('barn', BUILDINGS.barn, 0.15)
    this.barn.scale.setScalar(0.95)
    this.picks.push({ obj: this.barn, x: SPOTS.barn.x, y: SPOTS.barn.y - 60 })
    this.truck = place('truck', BUILDINGS.truck)
    this.truck.add(this.truckGoods)
    this.picks.push({ obj: this.truck, x: SPOTS.truck.x, y: SPOTS.truck.y - 60 })
    for (const s of this.level.workshops) {
      const pos = slotPos(s.slot)
      const obj = place(s.type, pos)
      const plot = place('plot', pos)
      obj.visible = s.built
      plot.visible = !s.built
      const target = { x: SPOTS.slots[s.slot]!.x, y: SPOTS.slots[s.slot]!.y - 60 }
      this.picks.push({ obj, ...target }, { obj: plot, ...target })
      this.workshops.push({ slot: s.slot, built: s.built, obj, plot, x: obj.position.x, z: obj.position.z })
    }
  }

  /* ------------------------------ Camera ------------------------------ */

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    this.width = cssWidth
    this.height = cssHeight
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(dpr, 2) : 1)
    this.renderer.setSize(cssWidth, cssHeight, false)
    this.camera.aspect = cssWidth / cssHeight
    this.fit()
  }

  /**
   * Places the camera so the whole board (and the buildings behind it) just fits. On a screen
   * taller than wide, it looks along the board instead, so the farm's long side runs up the screen.
   */
  private fit() {
    const pitch = this.scenic ? 0.5 : 0.7
    const tall = this.camera.aspect < 0.95
    const yaw = (tall ? Math.PI / 2 : 0) + this.yaw
    const target = new Vector3(tall ? 0.3 : 0, 0, tall ? 0 : 0.35)
    const dir = new Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw))
    const pts: Vector3[] = []
    for (const [x, z] of [[-6.5, -3.7], [6.5, -3.7], [-6.5, 3.75], [6.5, 3.75]] as const) {
      pts.push(new Vector3(x, 0, z), new Vector3(x * 0.85, 1.9, z * 0.85))
    }
    let lo = 4
    let hi = 80
    for (let i = 0; i < 28; i++) {
      const d = (lo + hi) / 2
      this.camera.position.copy(target).addScaledVector(dir, d)
      this.camera.lookAt(target)
      this.camera.updateMatrixWorld()
      this.camera.updateProjectionMatrix()
      const edge = this.scenic ? 0.8 : 0.97
      const ok = pts.every((p) => {
        const s = p.clone().project(this.camera)
        return Math.abs(s.x) <= edge && Math.abs(s.y) <= edge
      })
      if (ok) hi = d
      else lo = d
    }
    this.camera.position.copy(target).addScaledVector(dir, hi)
    this.camera.lookAt(target)
    this.camera.far = hi + 60
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
    const fog = this.scene.fog as Fog
    fog.near = hi + 4
    fog.far = hi + 26
  }

  /** Turns a scenic view round the farm (radians). */
  orbit(yaw: number) {
    this.yaw = yaw
    this.fit()
  }

  /* ------------------------------ Input ------------------------------ */

  private screenOf(p: Vector3) {
    const s = this.v.copy(p).project(this.camera)
    return { x: (s.x + 1) / 2 * this.width, y: (1 - s.y) / 2 * this.height }
  }

  private groundAt(px: number, py: number) {
    this.ray.setFromCamera(new Vector2(px / this.width * 2 - 1, -(py / this.height) * 2 + 1), this.camera)
    const hit = new Vector3()
    if (!this.ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), hit)) return null
    return { x: bx(hit.x), y: by(hit.z) }
  }

  /** Turns a tap (CSS pixels inside the canvas) into the board point the engine expects. */
  pick(engine: Engine, px: number, py: number, touch: boolean): { x: number, y: number } | null {
    const reach = (touch ? 46 : 34) * Math.max(0.7, Math.min(1.4, this.width / 1100))
    // Monkeys, then goods: the nearest on screen within reach.
    let best: { x: number, y: number } | null = null
    let bestD = reach * 1.25
    for (const m of engine.monkeys) {
      if (m.mode === 'flee') continue
      const s = this.screenOf(new Vector3(wx(m.x), 0.4, wz(m.y)))
      const d = Math.hypot(s.x - px, s.y - py)
      if (d < bestD) {
        bestD = d
        best = { x: m.x, y: m.y - 34 }
      }
    }
    if (best) return best
    bestD = reach
    for (const g of engine.goods) {
      const s = this.screenOf(new Vector3(wx(g.x), 0.14, wz(g.y)))
      const d = Math.hypot(s.x - px, s.y - py)
      if (d < bestD) {
        bestD = d
        best = { x: g.x, y: g.y - 14 }
      }
    }
    if (best) return best
    // Buildings.
    this.ray.setFromCamera(new Vector2(px / this.width * 2 - 1, -(py / this.height) * 2 + 1), this.camera)
    const objs = this.picks.filter(p => p.obj.visible).map(p => p.obj)
    const hits = this.ray.intersectObjects(objs, true)
    if (hits.length) {
      let o: Object3D | null = hits[0]!.object
      while (o && !objs.includes(o)) o = o.parent
      const hit = this.picks.find(p => p.obj === o)
      if (hit) return { x: hit.x, y: hit.y }
    }
    return this.groundAt(px, py)
  }

  /** The pen tile under the mouse, for the highlight. */
  hoverAt(px: number, py: number): Hover | null {
    const p = this.groundAt(px, py)
    if (!p) return null
    const c = Math.floor((p.x - PEN.x) / PEN.cell)
    const r = Math.floor((p.y - PEN.y) / PEN.cell)
    if (c < 0 || c >= PEN.cols || r < 0 || r >= PEN.rows) return null
    return { r, c }
  }

  /* ------------------------------ Effects ------------------------------ */

  private emit(at: Vector3, n: number, colors: string[], o: { speed?: [number, number], up?: number, life?: [number, number], size?: [number, number], g?: number } = {}) {
    if (this.reducedMotion) n = Math.ceil(n / 3)
    const [s0, s1] = o.speed ?? [0.6, 2]
    const [l0, l1] = o.life ?? [0.4, 0.8]
    const [z0, z1] = o.size ?? [0.03, 0.06]
    const color = new Color()
    for (let k = 0; k < n; k++) {
      const i = this.parts.findIndex(p => !p.on)
      if (i < 0) return
      const p = this.parts[i]!
      const a = Math.random() * Math.PI * 2
      const s = s0 + Math.random() * (s1 - s0)
      p.on = true
      p.p.copy(at)
      p.v.set(Math.cos(a) * s * 0.6, (o.up ?? 1) * (0.5 + Math.random()) * s, Math.sin(a) * s * 0.6)
      p.max = p.life = l0 + Math.random() * (l1 - l0)
      p.size = z0 + Math.random() * (z1 - z0)
      p.g = o.g ?? 6
      this.partMesh.setColorAt(i, color.set(colors[Math.floor(Math.random() * colors.length)]!))
    }
    if (this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true
  }

  private ring(at: Vector3, radius: number, color: string) {
    const r = this.rings.find(x => x.t <= 0) ?? this.rings[0]!
    r.t = 0.5
    r.mesh.position.set(at.x, 0.05, at.z)
    r.mesh.scale.setScalar(radius)
    ;(r.mesh.material as MeshBasicMaterial).color.set(color)
    r.mesh.visible = true
  }

  private popup(at: Vector3, html: string) {
    const el = document.createElement('div')
    el.className = 'fv-popup'
    el.innerHTML = html
    this.overlay.appendChild(el)
    this.popups.push({ el, p: at.clone(), t: 0 })
  }

  private sparkle(at: Vector3, n = 10) {
    this.emit(at, n, ['#fff7c2', '#ffffff', '#ffe14d'], { speed: [0.4, 1.4], g: -1, size: [0.02, 0.04] })
  }

  private dust(at: Vector3, n = 10) {
    this.emit(at, n, ['#e8d6b0', '#d0b88a', '#f4ead2'], { speed: [0.5, 1.4], up: 0.6, g: 3, size: [0.04, 0.08], life: [0.4, 0.7] })
  }

  /** Effects for what just happened in the game. */
  handle(events: GameEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'grass': {
          const at = new Vector3(wx(tileX(e.c)), 0.1, wz(tileY(e.r)))
          this.emit(at, 18, ['#4fc3f7', '#bfeaff', '#ffffff'], { speed: [1, 2.4], g: 9, size: [0.025, 0.045] })
          this.emit(at, 10, ['#6fcf52', '#9be15d', '#3f9a3a'], { speed: [0.5, 1.3], size: [0.03, 0.05] })
          this.ring(at, 0.75, '#bfeaff')
          break
        }
        case 'noWater':
          this.nudge.set('well', 0.45)
          break
        case 'refill':
          this.emit(this.well.position.clone().setY(0.6), 12, ['#4fc3f7', '#bfeaff'], { speed: [0.8, 1.8], g: 8 })
          break
        case 'refilled':
          this.emit(this.well.position.clone().setY(0.6), 22, ['#4fc3f7', '#bfeaff', '#ffffff'], { speed: [1, 2.6], g: 8 })
          this.nudge.set('well', 0.3)
          break
        case 'drop': {
          const at = new Vector3(wx(e.x), 0.2, wz(e.y))
          if (e.made) this.sparkle(at, 14)
          else this.dust(at, 4)
          break
        }
        case 'collect': {
          const obj = makeModel(e.item)
          obj.position.set(wx(e.x), 0, wz(e.y))
          this.root.add(obj)
          this.flyers.push({ obj, from: obj.position.clone(), t: 0 })
          this.sparkle(obj.position.clone().setY(0.2), 6)
          break
        }
        case 'full':
          this.nudge.set('barn', 0.5)
          break
        case 'spoil':
          this.emit(new Vector3(wx(e.x), 0.15, wz(e.y)), 10, ['#b0a890', '#8a8270', '#d0c8b0'], { speed: [0.2, 0.6], g: -0.8, size: [0.04, 0.08], life: [0.6, 1] })
          break
        case 'buy': {
          const at = new Vector3(wx(e.x), 0.05, wz(e.y))
          this.dust(at, 16)
          if (e.gift) this.sparkle(at.setY(0.5), 18)
          break
        }
        case 'build': {
          const w = this.workshops.find(x => Math.abs(bx(x.x) - e.x) < 2)
          if (w) {
            const at = new Vector3(w.x, 0.1, w.z)
            this.dust(at, 30)
            this.sparkle(at.setY(1), 24)
            this.nudge.set(`w${w.slot}`, 0.5)
          }
          this.shake = Math.max(this.shake, 0.06)
          break
        }
        case 'start': {
          const w = this.workshops.find(x => Math.abs(bx(x.x) - e.x) < 2)
          if (w) this.nudge.set(`w${w.slot}`, 0.35)
          break
        }
        case 'eat':
          this.emit(new Vector3(wx(e.x), 0.08, wz(e.y)), 6, ['#6fcf52', '#9be15d'], { speed: [0.3, 0.8], size: [0.02, 0.035] })
          break
        case 'truckGo':
          this.dust(this.truck.position.clone().setY(0.1), 18)
          break
        case 'truckBack': {
          const at = this.truck.position.clone().setY(1.5)
          this.popup(at, `${this.icon('coin')}<b>+${this.fmt(e.coins)}</b>`)
          this.emit(at, 22, ['#ffcc33', '#ffe14d', '#fff3b0'], { speed: [1.2, 2.8], g: 8, size: [0.04, 0.07] })
          break
        }
        case 'monkeyHit':
          this.emit(new Vector3(wx(e.x), 0.6, wz(e.y)), 8, ['#ffe14d', '#ffffff', '#ffb040'], { speed: [1, 2], g: 0, size: [0.03, 0.05], life: [0.2, 0.4] })
          break
        case 'monkeyShoo': {
          const at = new Vector3(wx(e.x), 0.1, wz(e.y))
          this.dust(at, 16)
          this.emit(at.setY(0.6), 14, ['#ffe14d', '#ffffff'], { speed: [1.4, 2.8], g: 0, life: [0.3, 0.6] })
          break
        }
        case 'steal':
          this.dust(new Vector3(wx(e.x), 0.1, wz(e.y)), 8)
          break
        case 'won':
          for (let i = 0; i < 8; i++) {
            this.emit(new Vector3(-4 + Math.random() * 8, 1.5 + Math.random(), -2 + Math.random() * 3), 24, ['#ffe14d', '#8fd36a', '#ff9cc9', '#4fc3f7', '#ffffff'], { speed: [1.4, 3.6], g: 4, life: [1, 2], size: [0.04, 0.08] })
          }
          break
        default:
          break
      }
    }
  }

  /** Moves effects on (only while the game runs). */
  update(dt: number) {
    this.time += dt
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.3)
    for (const [key, t] of this.nudge) {
      if (t - dt <= 0) this.nudge.delete(key)
      else this.nudge.set(key, t - dt)
    }
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i]!
      if (!p.on) continue
      p.life -= dt
      if (p.life <= 0) {
        p.on = false
        this.m4.makeScale(0, 0, 0)
        this.partMesh.setMatrixAt(i, this.m4)
        continue
      }
      p.v.y -= p.g * dt
      p.p.addScaledVector(p.v, dt)
      if (p.p.y < 0.02) {
        p.p.y = 0.02
        p.v.multiplyScalar(0.5)
        p.v.y = Math.abs(p.v.y) * 0.3
      }
      const s = p.size * Math.min(1, (p.life / p.max) * 2)
      this.m4.compose(p.p, this.q, this.v.set(s, s, s))
      this.partMesh.setMatrixAt(i, this.m4)
    }
    this.partMesh.instanceMatrix.needsUpdate = true
    for (const r of this.rings) {
      if (r.t <= 0) continue
      r.t -= dt
      const a = Math.max(0, r.t / 0.5)
      r.mesh.scale.multiplyScalar(1 + dt * 1.5)
      ;(r.mesh.material as MeshBasicMaterial).opacity = a * 0.8
      if (r.t <= 0) r.mesh.visible = false
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]!
      p.t += dt
      if (p.t > 1.3) {
        p.el.remove()
        this.popups.splice(i, 1)
      }
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]!
      f.t += dt / 0.55
      if (f.t >= 1) {
        this.root.remove(f.obj)
        this.flyers.splice(i, 1)
        this.nudge.set('barnIn', 0.22)
      }
    }
  }

  /* ------------------------------ Every frame ------------------------------ */

  render(engine: Engine, hover: Hover | null) {
    for (const l of this.labels.values()) l.seen = false

    this.syncGrass(engine)
    this.syncAnimals(engine)
    this.syncGoods(engine)
    this.syncMonkeys(engine)
    this.syncBuildings(engine)
    this.syncTruck(engine)

    if (hover) {
      this.hoverMesh.visible = true
      this.hoverMesh.position.set(wx(tileX(hover.c)), 0.05, wz(tileY(hover.r)))
      ;(this.hoverMesh.material as MeshBasicMaterial).color.set(engine.water > 0 ? '#ffffff' : '#ff8aa0')
    }
    else this.hoverMesh.visible = false

    for (const f of this.flyers) {
      const t = 1 - (1 - f.t) ** 2
      const to = new Vector3(this.barn.position.x + 0.2, 1.1, this.barn.position.z + 0.5)
      f.obj.position.lerpVectors(f.from, to, t)
      f.obj.position.y += Math.sin(t * Math.PI) * 1.4
      f.obj.scale.setScalar(1 - t * 0.5)
      f.obj.rotation.y += 0.2
    }

    const sh = this.reducedMotion ? 0 : this.shake
    this.root.position.set(sh ? (Math.random() - 0.5) * sh : 0, 0, sh ? (Math.random() - 0.5) * sh : 0)
    this.renderer.render(this.scene, this.camera)
    // How heavy the frame was, for the browser checks (scripts/check-layout.mjs reads it).
    if (this.time - this.lastStats > 1) {
      this.lastStats = this.time
      this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls)
    }

    for (const p of this.popups) {
      const s = this.screenOf(p.p)
      p.el.style.transform = `translate(${s.x}px, ${s.y - p.t * 50}px) translate(-50%, -50%)`
      p.el.style.opacity = String(Math.max(0, 1 - Math.max(0, p.t - 0.7) / 0.6))
    }
    for (const [key, l] of this.labels) {
      if (!l.seen) {
        l.el.remove()
        this.labels.delete(key)
      }
    }
  }

  private icon(name: ModelName, cls = 'fv-icon') {
    const url = iconUrl(name)
    return url ? `<img class="${cls}" src="${url}" alt="">` : ''
  }

  /** An HTML label over a point of the world (kept between frames while it's asked for). */
  private label(key: string, at: Vector3, html: string, cls: string) {
    if (this.scenic) return
    let l = this.labels.get(key)
    if (!l) {
      const el = document.createElement('div')
      this.overlay.appendChild(el)
      l = { el, html: '', seen: true }
      this.labels.set(key, l)
    }
    l.seen = true
    if (l.html !== html) {
      l.el.innerHTML = html
      l.html = html
    }
    if (l.el.className !== cls) l.el.className = cls
    const s = this.screenOf(at)
    l.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`
  }

  private syncGrass(engine: Engine) {
    const sway = this.reducedMotion ? 0 : 1
    for (let i = 0; i < this.grass.length; i++) {
      const g = engine.grass[i]!
      const t = this.grass[i]!
      t.visible = g > 0
      if (!g) continue
      const target = 0.45 + g * 0.22
      t.scale.y += (target - t.scale.y) * 0.2
      t.scale.x = t.scale.z = 0.85 + g * 0.05
      t.rotation.z = Math.sin(this.time * 1.8 + i) * 0.04 * sway
    }
  }

  private syncAnimals(engine: Engine) {
    const seen = new Set<number>()
    for (const a of engine.animals) {
      seen.add(a.id)
      let v = this.animals.get(a.id)
      if (!v) {
        const obj = makeModel(a.type)
        obj.scale.setScalar(a.type === 'cow' ? 0.95 : 1.25)
        this.root.add(obj)
        v = { obj, pose: obj.getObjectByName('pose')!, head: obj.getObjectByName('head') ?? null, yaw: a.face > 0 ? 0 : Math.PI, px: a.x, pz: a.y }
        this.animals.set(a.id, v)
      }
      const dx = a.x - v.px
      const dz = a.y - v.pz
      if (Math.hypot(dx, dz) > 0.3) {
        const want = Math.atan2(-dz, dx)
        let diff = want - v.yaw
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        v.yaw += diff * 0.2
      }
      v.px = a.x
      v.pz = a.y
      v.obj.rotation.y = v.yaw
      let y = 0
      if (a.age < 0.55) y = (1 - (1 - (1 - a.age / 0.55) ** 2)) * 2.5
      const walking = a.mode === 'walk' && !this.reducedMotion
      const speed = ANIMALS[a.type].speed
      v.obj.position.set(wx(a.x), y, wz(a.y))
      v.pose.position.y = walking ? Math.abs(Math.sin(this.time * speed * 0.16 + a.id)) * 0.04 : 0
      v.pose.rotation.x = walking ? Math.sin(this.time * speed * 0.16 + a.id) * 0.08 : 0
      const eating = a.mode === 'eat'
      v.pose.rotation.z += ((eating ? -0.35 : 0) - v.pose.rotation.z) * 0.2
      if (v.head) v.head.rotation.z = eating && !this.reducedMotion ? -0.6 + Math.sin(this.time * 16 + a.id) * 0.35 : 0
      if (a.food === 0) {
        const h = a.type === 'cow' ? 1.25 : 0.85
        this.label(`hungry${a.id}`, new Vector3(wx(a.x), y + h, wz(a.y)), '<span class="fv-grass"></span>', 'fv-bubble fv-hungry')
      }
    }
    for (const [id, v] of this.animals) {
      if (!seen.has(id)) {
        this.root.remove(v.obj)
        this.animals.delete(id)
      }
    }
  }

  private syncGoods(engine: Engine) {
    const seen = new Set<number>()
    for (const g of engine.goods) {
      seen.add(g.id)
      let obj = this.goods.get(g.id)
      if (!obj) {
        obj = makeModel(g.item)
        obj.rotation.y = (g.id % 7) * 0.9
        this.root.add(obj)
        this.goods.set(g.id, obj)
      }
      let s = 1.6
      let y = 0
      if (g.age < 0.35) {
        const t = g.age / 0.35
        s *= 0.4 + (1 - (1 - t) ** 2) * 0.6
        y = Math.sin(t * Math.PI) * 0.3
      }
      const left = g.life - g.age
      if (left < 4 && !this.reducedMotion) s *= 1 + Math.abs(Math.sin(this.time * (left < 2 ? 12 : 7))) * 0.12
      obj.position.set(wx(g.x), y, wz(g.y))
      obj.scale.setScalar(s)
      if (left < 4) this.label(`spoil${g.id}`, new Vector3(wx(g.x), 0.02, wz(g.y)), '', `fv-spoil${left < 2 ? ' urgent' : ''}`)
      if (left < 4) this.labels.get(`spoil${g.id}`)!.el.style.setProperty('--p', String(Math.max(0, left / 4)))
    }
    for (const [id, obj] of this.goods) {
      if (!seen.has(id)) {
        this.root.remove(obj)
        this.goods.delete(id)
      }
    }
  }

  private syncMonkeys(engine: Engine) {
    const seen = new Set<number>()
    for (const m of engine.monkeys) {
      seen.add(m.id)
      let v = this.monkeys.get(m.id)
      if (!v) {
        const obj = makeModel('monkey')
        obj.scale.setScalar(1.15)
        this.root.add(obj)
        v = { obj, pose: obj.getObjectByName('pose')!, carry: null, carryObj: null, yaw: Math.PI }
        this.monkeys.set(m.id, v)
      }
      if (v.carry !== m.carry) {
        if (v.carryObj) v.pose.remove(v.carryObj)
        v.carryObj = null
        if (m.carry) {
          v.carryObj = makeModel(m.carry)
          v.carryObj.position.set(0.05, 0.82, 0)
          v.pose.add(v.carryObj)
        }
        v.carry = m.carry
      }
      const want = m.face > 0 ? 0 : Math.PI
      v.yaw += (want - v.yaw) * 0.25
      v.obj.rotation.y = v.yaw
      const hop = this.reducedMotion ? 0 : Math.abs(Math.sin(this.time * (m.mode === 'flee' ? 18 : 9) + m.id)) * (m.mode === 'eat' ? 0.02 : 0.12)
      v.obj.position.set(wx(m.x), hop, wz(m.y))
      const flinch = m.hit < 0.15 ? 1 - m.hit / 0.15 : 0
      v.pose.scale.set(1 + flinch * 0.2, 1 - flinch * 0.25, 1 + flinch * 0.2)
      if (m.mode !== 'flee' && m.x < 1180) {
        const pips = Array.from({ length: m.max }, (_, i) => `<i class="${i < m.hp ? 'on' : ''}"></i>`).join('')
        this.label(`hp${m.id}`, new Vector3(wx(m.x), 1.25 + hop, wz(m.y)), pips, 'fv-hp')
      }
    }
    for (const [id, v] of this.monkeys) {
      if (!seen.has(id)) {
        this.root.remove(v.obj)
        this.monkeys.delete(id)
      }
    }
  }

  private wobble(key: string) {
    const t = this.nudge.get(key)
    if (!t || this.reducedMotion) return 0
    return Math.sin(t * 45) * t * 0.25
  }

  private syncBuildings(engine: Engine) {
    // The well, and the water left in it.
    const ww = this.wobble('well')
    this.well.scale.set(1 + Math.abs(ww) * 0.4, 1 - Math.abs(ww) * 0.4, 1 + Math.abs(ww) * 0.4)
    const max = this.level.water
    let drops = ''
    for (let i = 0; i < max; i++) drops += `<i class="${i < engine.water ? 'on' : ''}"></i>`
    const wellTop = this.well.position.clone().setY(2.0)
    this.label('water', wellTop, drops, `fv-drops${engine.water === 0 ? ' empty' : ''}`)
    if (engine.refilling > 0) {
      const t = 1 - engine.refilling / this.level.refill
      this.label('refill', this.well.position.clone().setY(0.05).setZ(this.well.position.z + 0.75), `<span style="width:${(t * 100).toFixed(0)}%"></span>`, 'fv-bar water')
    }
    else if (engine.water === 0) {
      this.label('refill', this.well.position.clone().setY(0.05).setZ(this.well.position.z + 0.75), `${this.icon('water')}`, 'fv-tapme')
    }

    // The barn and what's in it.
    const bw = this.wobble('barn')
    const gulp = (this.nudge.get('barnIn') ?? 0) * 0.5
    this.barn.scale.set(0.95 * (1 + gulp * 0.3 + Math.abs(bw) * 0.3), 0.95 * (1 - gulp * 0.2), 0.95 * (1 + gulp * 0.3))
    const used = engine.barnUsed
    const cap = this.level.barnCap
    this.label('barn', this.barn.position.clone().setY(2.45), `${this.fmt(used)}/${this.fmt(cap)}`, `fv-badge${used >= cap ? ' full' : ''}`)

    // Workshops.
    for (const w of this.workshops) {
      const state = engine.workshops.find(x => x.slot === w.slot)!
      if (state.built !== w.built) {
        w.built = state.built
        w.obj.visible = w.built
        w.plot.visible = !w.built
      }
      const def = WORKSHOPS[state.type]
      const top = new Vector3(w.x, 1.75, w.z)
      if (!w.built) {
        const affordable = engine.coins >= def.build
        this.label(`w${w.slot}`, new Vector3(w.x, 0.62, w.z + 0.2), `${this.icon(state.type, 'fv-icon big')}<span>${this.icon('coin')}${this.fmt(def.build)}</span>`, `fv-price${affordable ? ' ok' : ''}`)
        continue
      }
      const wob = this.wobble(`w${w.slot}`)
      const working = state.busy > 0
      const bounce = working && !this.reducedMotion ? Math.sin(this.time * 10) * 0.025 : 0
      w.obj.scale.set(1 + Math.abs(wob) + bounce, 1 - Math.abs(wob) - bounce, 1 + Math.abs(wob) + bounce)
      if (working) {
        const t = 1 - state.busy / def.time
        this.label(`wbar${w.slot}`, new Vector3(w.x, 0.05, w.z + 0.75), `<span style="width:${(t * 100).toFixed(0)}%"></span>${state.queue ? `<b>+${this.fmt(state.queue)}</b>` : ''}`, 'fv-bar')
        if (Math.random() < 0.08 && !this.reducedMotion) {
          this.emit(new Vector3(w.x + 0.35, 1.5, w.z - 0.2), 1, ['#ffffff', '#ececec'], { speed: [0.1, 0.3], g: -0.6, life: [0.8, 1.4], size: [0.06, 0.11] })
        }
        continue
      }
      const ready = engine.canStart(state)
      this.label(`w${w.slot}`, top, def.inputs.map(id => this.icon(id)).join(''), `fv-bubble fv-needs${ready ? ' ready' : ''}`)
    }
  }

  private syncTruck(engine: Engine) {
    const tr = engine.truck
    const home = new Vector3(wx(BUILDINGS.truck.x), 0, wz(BUILDINGS.truck.y))
    let x = home.x
    let moving = false
    if (tr.state === 'away') {
      const T = this.level.truckTime
      const p = 1 - tr.t / T
      const leg = Math.min(1.6, T * 0.2) / T
      if (p < leg) x = home.x + (p / leg) ** 2 * 6
      else if (p > 1 - leg) x = home.x + ((1 - p) / leg) ** 2 * 6
      else x = home.x + 30
      moving = true
      this.label('truck', home.clone().setY(0.3).setZ(home.z + 0.1), `${this.icon('coin')}<b>${this.fmt(Math.ceil(tr.t))}</b>`, 'fv-badge timer')
    }
    this.truck.position.set(x, moving && !this.reducedMotion ? Math.abs(Math.sin(this.time * 30)) * 0.02 : 0, home.z)
    this.truck.visible = x < 11
    if (moving) this.truck.traverse((o) => {
      if (o.name === 'wheel') o.rotation.y -= 0.35
    })
    // What's loaded rides on the back seat.
    const sig = ITEM_ORDER.map(id => tr.load[id]).join(',')
    if (sig !== this.truckLoad) {
      this.truckLoad = sig
      this.truckGoods.clear()
      let k = 0
      for (const id of ITEM_ORDER) {
        for (let i = 0; i < tr.load[id] && k < 8; i++, k++) {
          const g = makeModel(id)
          g.position.set(-0.7 + (k % 4) * 0.22, 0.47, k < 4 ? 0.14 : -0.14)
          g.scale.setScalar(0.8)
          this.truckGoods.add(g)
        }
      }
    }
  }

  dispose() {
    for (const l of this.labels.values()) l.el.remove()
    for (const p of this.popups) p.el.remove()
    this.labels.clear()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}

function shadeHex(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)))
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

/** Every model the interface shows as a picture. */
export const ICON_MODELS: ModelName[] = [
  'chicken', 'duck', 'cow', 'monkey', 'egg', 'duckegg', 'milk', 'cake', 'saltegg', 'yogurt', 'dessert', 'coin', 'water',
  'truck', 'barn', 'well', 'bakery', 'saltjar', 'dairy', 'stall', 'palm', 'srey', 'ta',
]
