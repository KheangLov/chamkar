/**
 * Draws the farm on a canvas. Built for speed on phones:
 * - every sprite is drawn once (per screen size) into a bitmap, plus a white "flash" copy, and those
 *   bitmaps are copied each frame;
 * - the yard, fence, pen soil and decorations are one bitmap drawn once per level;
 * - particles live in a fixed ring buffer (no garbage while playing);
 * - the canvas has no alpha channel and at most ~2.4 million pixels.
 * It never changes the game: it reads the engine's state and reacts to its events with effects.
 */
import {
  ANIMALS, BOARD, GRASS_MAX, ITEM_ORDER, PEN, SPOTS, SPRITES, WORKSHOPS, WORLDS, tileX, tileY,
  type Engine, type GameEvent, type ItemId, type LevelDef, type SpriteName, type SpriteOp,
} from '#shared/game'

const TAU = Math.PI * 2
const W = BOARD.width
const H = BOARD.height
const MAX_PIXELS = 2_400_000
const BARN_DOOR = { x: SPOTS.barn.x, y: SPOTS.barn.y - 120 }

interface Bitmap { img: HTMLCanvasElement, flash: HTMLCanvasElement, w: number, h: number, pad: number }
interface Compiled { path: Path2D, fill: string | null, stroke: string | null, lw: number, alpha: number }
interface Particle { on: boolean, x: number, y: number, vx: number, vy: number, life: number, max: number, size: number, color: string, g: number, shape: 0 | 1 | 2, rot: number, vr: number }
interface Popup { x: number, y: number, t: number, text: string, color: string, icon?: SpriteName }
interface Flyer { item: ItemId, x0: number, y0: number, t: number }

export interface BoardUi {
  /** Pen tile under the mouse. */
  hover: { r: number, c: number } | null
}

const compiled = new Map<SpriteName, Compiled[]>()
function compile(name: SpriteName): Compiled[] {
  let ops = compiled.get(name)
  if (ops) return ops
  ops = (SPRITES[name].ops as SpriteOp[]).map((op) => {
    const path = new Path2D()
    let i: number
    switch (op[0]) {
      case 'p':
        path.addPath(new Path2D(op[1]))
        i = 2
        break
      case 'c':
        path.arc(op[1], op[2], op[3], 0, TAU)
        i = 4
        break
      case 'e':
        path.ellipse(op[1], op[2], op[3], op[4], 0, 0, TAU)
        i = 5
        break
      case 'r': {
        const [, x, y, w, h, r] = op
        if (r <= 0) path.rect(x, y, w, h)
        else path.roundRect(x, y, w, h, r)
        i = 6
        break
      }
    }
    const style = op.slice(i) as [string | null, string | null | undefined, number | undefined, number | undefined]
    return { path, fill: style[0], stroke: style[1] ?? null, lw: style[2] ?? 1, alpha: style[3] ?? 1 }
  })
  compiled.set(name, ops)
  return ops
}

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

function tint(src: HTMLCanvasElement, color: string, alpha: number) {
  const c = canvasOf(src.width, src.height)
  const g = c.getContext('2d')!
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'source-atop'
  g.globalAlpha = alpha
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  return c
}

function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function shade(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)))
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const ease = (t: number) => 1 - (1 - t) * (1 - t)

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private K = 1
  private sprites = new Map<SpriteName, Bitmap>()
  private bg: HTMLCanvasElement | null = null
  private parts: Particle[] = Array.from({ length: 600 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '#fff', g: 0, shape: 0, rot: 0, vr: 0 }))
  private pi = 0
  private popups: Popup[] = []
  private flyers: Flyer[] = []
  /** Short wobbles on buildings, by name. */
  private nudge = new Map<string, number>()
  /** Where each tile's grass blades stand (fixed, so they don't jitter). */
  private blades: { x: number, y: number, h: number, lean: number }[][] = []
  private time = 0
  private shake = 0
  reducedMotion = false

  constructor(private canvas: HTMLCanvasElement, private level: LevelDef, private fmt: (n: number) => string = String) {
    this.ctx = canvas.getContext('2d', { alpha: false })!
    const R = seeded(level.n * 31 + 5)
    for (let i = 0; i < PEN.rows * PEN.cols; i++) {
      this.blades.push(Array.from({ length: 9 }, () => ({ x: 8 + R() * (PEN.cell - 16), y: 16 + R() * (PEN.cell - 20), h: 9 + R() * 9, lean: (R() - 0.5) * 8 })))
    }
  }

  /** Fits the canvas to its box (CSS pixels) at the screen's sharpness, within the pixel budget. */
  resize(cssWidth: number, cssHeight: number, dpr: number) {
    const scale = Math.min(cssWidth / W, cssHeight / H)
    let K = scale * Math.min(dpr, 2)
    if (W * H * K * K > MAX_PIXELS) K = Math.sqrt(MAX_PIXELS / (W * H))
    if (Math.abs(K - this.K) < 0.01 && this.bg) return
    this.K = K
    this.canvas.width = Math.round(W * K)
    this.canvas.height = Math.round(H * K)
    this.sprites.clear()
    this.buildBackground()
  }

  private sprite(name: SpriteName): Bitmap {
    let s = this.sprites.get(name)
    if (s) return s
    const def = SPRITES[name]
    const pad = 4
    const K = this.K
    const img = canvasOf((def.w + pad * 2) * K, (def.h + pad * 2) * K)
    const g = img.getContext('2d')!
    g.scale(K, K)
    g.translate(pad, pad)
    g.scale(def.w / def.vw, def.h / def.vh)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (const o of compile(name)) {
      g.globalAlpha = o.alpha
      if (o.fill) {
        g.fillStyle = o.fill
        g.fill(o.path)
      }
      if (o.stroke) {
        g.strokeStyle = o.stroke
        g.lineWidth = o.lw
        g.stroke(o.path)
      }
    }
    s = { img, flash: tint(img, '#ffffff', 0.75), w: def.w + pad * 2, h: def.h + pad * 2, pad }
    this.sprites.set(name, s)
    return s
  }

  /** Draws a sprite standing on (x, y). */
  private draw(name: SpriteName, x: number, y: number, sx = 1, sy = 1, rot = 0, flash = false, alpha = 1, g: CanvasRenderingContext2D = this.ctx) {
    const s = this.sprite(name)
    if (alpha <= 0) return
    const img = flash ? s.flash : s.img
    if (!rot && sx === 1 && sy === 1) {
      g.globalAlpha = alpha
      g.drawImage(img, x - s.w / 2, y - s.h + s.pad, s.w, s.h)
      g.globalAlpha = 1
      return
    }
    g.save()
    g.globalAlpha = alpha
    g.translate(x, y)
    if (rot) g.rotate(rot)
    g.scale(sx, sy)
    g.drawImage(img, -s.w / 2, -s.h + s.pad, s.w, s.h)
    g.restore()
  }

  private buildBackground() {
    const K = this.K
    const L = this.level
    const world = WORLDS[L.world]!
    const p = world.palette
    const bg = canvasOf(W * K, H * K)
    const g = bg.getContext('2d')!
    g.scale(K, K)
    const R = seeded(L.n * 101 + 7)

    // The yard: packed earth with grass round the edges.
    g.fillStyle = p.yard
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 220; i++) {
      g.fillStyle = R() < 0.5 ? p.yardDark : shade(p.yard, 0.12)
      g.beginPath()
      g.ellipse(R() * W, R() * H, 3 + R() * 10, 2 + R() * 4, 0, 0, TAU)
      g.fill()
    }
    g.fillStyle = p.edge
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(W, 0)
    for (let x = W; x >= 0; x -= 40) g.quadraticCurveTo(x - 20, 40 + R() * 10, x - 40, 26 + R() * 8)
    g.closePath()
    g.fill()

    // The track along the bottom, from the barn to the tuk-tuk and off to market.
    g.fillStyle = p.yardDark
    g.beginPath()
    g.roundRect(200, 628, W - 180, 80, 40)
    g.fill()
    g.strokeStyle = shade(p.yardDark, -0.12)
    g.lineWidth = 3
    g.setLineDash([18, 14])
    g.beginPath()
    g.moveTo(240, 652)
    g.lineTo(W, 652)
    g.moveTo(240, 684)
    g.lineTo(W, 684)
    g.stroke()
    g.setLineDash([])

    // Decorations around the farm.
    const decor: [SpriteName, number, number, number][] = []
    switch (world.decor) {
      case 'banana':
        decor.push(['banana', 50, 250, 1], ['banana', 250, 214, 0.8], ['banana', 1230, 330, 1], ['banana', 1170, 470, 0.85], ['rice', 1260, 560, 1])
        break
      case 'rice':
        for (let i = 0; i < 18; i++) decor.push(['rice', 1130 + R() * 140, 120 + R() * 440, 0.8 + R() * 0.4])
        decor.push(['banana', 50, 250, 1], ['rice', 230, 220, 1], ['rice', 260, 200, 0.8])
        break
      case 'river':
        decor.push(['banana', 50, 250, 1], ['rice', 230, 220, 1])
        break
      case 'temple':
        decor.push(['stupa', 1200, 340, 1], ['stupa', 1250, 520, 0.7], ['banana', 50, 250, 1], ['stupa', 250, 230, 0.6])
        break
      case 'palms':
        decor.push(['palm', 46, 260, 1], ['palm', 1180, 330, 1], ['palm', 1250, 450, 0.85], ['palm', 250, 220, 0.7], ['palm', 1140, 560, 0.75])
        break
      case 'flags':
        decor.push(['palm', 46, 260, 1], ['palm', 1220, 380, 1], ['banana', 1160, 560, 0.85], ['rice', 250, 220, 1])
        break
    }
    if (world.decor === 'river') {
      g.fillStyle = '#4fb6dc'
      g.beginPath()
      g.moveTo(1140, 0)
      g.bezierCurveTo(1100, 200, 1180, 360, 1130, 600)
      g.lineTo(W, 600)
      g.lineTo(W, 0)
      g.closePath()
      g.fill()
      g.strokeStyle = '#bfeaff'
      g.lineWidth = 3
      for (let i = 0; i < 16; i++) {
        const x = 1170 + R() * 100
        const y = 30 + R() * 540
        g.beginPath()
        g.moveTo(x, y)
        g.quadraticCurveTo(x + 10, y - 6, x + 20, y)
        g.stroke()
      }
      for (let i = 0; i < 8; i++) decor.push(['rice', 1125 + R() * 30, 80 + R() * 500, 0.7])
    }
    decor.sort((a, b) => a[2] - b[2])
    for (const [name, x, y, s] of decor) this.draw(name, x, y, s, s, 0, false, 1, g)
    if (world.decor === 'flags') {
      for (const [x0, x1] of [[0, 640], [640, W]] as const) {
        g.strokeStyle = '#6a3a3a'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(x0, 6)
        g.quadraticCurveTo((x0 + x1) / 2, 44, x1, 6)
        g.stroke()
        const colors = ['#ff6a90', '#ffd23f', '#4fc3f7', '#7ad06a', '#ff9a4a']
        for (let i = 1; i < 12; i++) {
          const t = i / 12
          const x = x0 + (x1 - x0) * t
          const y = 6 + 2 * t * (1 - t) * 38
          g.fillStyle = colors[i % colors.length]!
          g.beginPath()
          g.moveTo(x - 10, y)
          g.lineTo(x + 10, y)
          g.lineTo(x, y + 20)
          g.closePath()
          g.fill()
        }
      }
    }

    // The pen: soil tiles, then the fence.
    const px = PEN.x
    const py = PEN.y
    const pw = PEN.cols * PEN.cell
    const ph = PEN.rows * PEN.cell
    g.fillStyle = 'rgba(0,0,0,.18)'
    g.beginPath()
    g.roundRect(px - 6, py + 2, pw + 12, ph + 12, 10)
    g.fill()
    for (let r = 0; r < PEN.rows; r++) {
      for (let c = 0; c < PEN.cols; c++) {
        g.fillStyle = shade(p.soil, ((r + c) % 2 ? 0 : -0.05) + (R() - 0.5) * 0.06)
        g.fillRect(px + c * PEN.cell, py + r * PEN.cell, PEN.cell, PEN.cell)
        g.fillStyle = p.soilDark
        for (let k = 0; k < 3; k++) {
          g.beginPath()
          g.arc(px + c * PEN.cell + R() * PEN.cell, py + r * PEN.cell + R() * PEN.cell, 1.5 + R() * 2, 0, TAU)
          g.fill()
        }
      }
    }
    g.strokeStyle = p.fence
    g.lineCap = 'round'
    g.lineWidth = 5
    g.beginPath()
    for (const y of [py - 4, py + ph + 4]) {
      g.moveTo(px - 6, y - 10)
      g.lineTo(px + pw + 6, y - 10)
      g.moveTo(px - 6, y + 2)
      g.lineTo(px + pw + 6, y + 2)
    }
    for (const x of [px - 6, px + pw + 6]) {
      g.moveTo(x, py - 14)
      g.lineTo(x, py + ph + 6)
    }
    g.stroke()
    g.fillStyle = shade(p.fence, -0.15)
    for (let x = px - 6; x <= px + pw + 6; x += 40) {
      g.fillRect(x - 4, py - 22, 8, 26)
      g.fillRect(x - 4, py + ph - 8, 8, 26)
    }
    for (let y = py - 22; y <= py + ph; y += 40) {
      g.fillRect(px - 10, y, 8, 22)
      g.fillRect(px + pw + 2, y, 8, 22)
    }
    this.bg = bg
  }

  /* ------------------------------ Effects ------------------------------ */

  private emit(x: number, y: number, n: number, o: { colors: string[], s0?: number, s1?: number, a0?: number, a1?: number, l0?: number, l1?: number, z0?: number, z1?: number, g?: number, shape?: 0 | 1 }) {
    if (this.reducedMotion) n = Math.ceil(n / 3)
    for (let k = 0; k < n; k++) {
      const p = this.parts[this.pi]!
      this.pi = (this.pi + 1) % this.parts.length
      const a = rand(o.a0 ?? 0, o.a1 ?? TAU)
      const s = rand(o.s0 ?? 60, o.s1 ?? 220)
      p.on = true
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s
      p.max = p.life = rand(o.l0 ?? 0.3, o.l1 ?? 0.7)
      p.size = rand(o.z0 ?? 3, o.z1 ?? 6)
      p.color = o.colors[(Math.random() * o.colors.length) | 0]!
      p.g = o.g ?? 500
      p.shape = o.shape ?? 0
      p.rot = rand(0, TAU)
      p.vr = rand(-10, 10)
    }
  }

  private ring(x: number, y: number, r: number, color: string) {
    const p = this.parts[this.pi]!
    this.pi = (this.pi + 1) % this.parts.length
    Object.assign(p, { on: true, x, y, vx: 0, vy: 0, max: 0.45, life: 0.45, size: r, color, g: 0, shape: 2, rot: 0, vr: 0 })
  }

  private popup(x: number, y: number, text: string, color = '#fff7e0', icon?: SpriteName) {
    this.popups.push({ x, y, t: 0, text, color, icon })
  }

  private dust(x: number, y: number, n = 10) {
    this.emit(x, y, n, { colors: ['#e8d6b0', '#d0b88a', '#f4ead2'], s0: 40, s1: 160, a0: -Math.PI, a1: 0, g: 200, l0: 0.3, l1: 0.6, z0: 4, z1: 9, shape: 1 })
  }

  private sparkle(x: number, y: number, n = 10) {
    this.emit(x, y, n, { colors: ['#fff7c2', '#ffffff', '#ffe14d'], s0: 40, s1: 160, l0: 0.3, l1: 0.7, z0: 2, z1: 4, g: -40, shape: 1 })
  }

  /** Effects for what just happened in the game. */
  handle(events: GameEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'grass': {
          const x = tileX(e.c)
          const y = tileY(e.r)
          this.emit(x, y, 16, { colors: ['#4fc3f7', '#bfeaff', '#ffffff'], s0: 60, s1: 200, a0: -Math.PI * 0.95, a1: -Math.PI * 0.05, g: 700, l0: 0.3, l1: 0.6, z0: 2, z1: 4, shape: 1 })
          this.emit(x, y, 10, { colors: ['#6fcf52', '#9be15d', '#3f9a3a'], s0: 30, s1: 120, g: 200, l0: 0.3, l1: 0.6, z0: 3, z1: 5 })
          this.ring(x, y, 70, '#bfeaff')
          break
        }
        case 'noWater':
          this.nudge.set('well', 0.4)
          this.popup(SPOTS.well.x, SPOTS.well.y - 190, '!', '#ff9db0', 'water')
          break
        case 'refill':
          this.emit(SPOTS.well.x, SPOTS.well.y - 40, 10, { colors: ['#4fc3f7', '#bfeaff'], s0: 60, s1: 160, a0: -Math.PI * 0.9, a1: -Math.PI * 0.1, g: 600, l0: 0.3, l1: 0.6, z0: 2, z1: 4, shape: 1 })
          break
        case 'refilled':
          this.emit(SPOTS.well.x, SPOTS.well.y - 50, 18, { colors: ['#4fc3f7', '#bfeaff', '#ffffff'], s0: 80, s1: 240, a0: -Math.PI * 0.9, a1: -Math.PI * 0.1, g: 700, l0: 0.4, l1: 0.8, z0: 2, z1: 5, shape: 1 })
          this.nudge.set('well', 0.3)
          break
        case 'drop':
          if (e.made) this.sparkle(e.x, e.y - 20, 12)
          else this.dust(e.x, e.y, 4)
          break
        case 'collect':
          this.flyers.push({ item: e.item, x0: e.x, y0: e.y - 14, t: 0 })
          this.sparkle(e.x, e.y - 14, 6)
          break
        case 'full':
          this.nudge.set('barn', 0.5)
          break
        case 'spoil':
          this.emit(e.x, e.y - 10, 10, { colors: ['#b0a890', '#8a8270', '#d0c8b0'], s0: 20, s1: 80, g: -60, l0: 0.4, l1: 0.8, z0: 4, z1: 8, shape: 1 })
          break
        case 'buy':
          this.dust(e.x, e.y, 14)
          if (e.gift) this.sparkle(e.x, e.y - 30, 16)
          break
        case 'build': {
          const y = SPOTS.slots[0]!.y
          this.dust(e.x, y, 26)
          this.sparkle(e.x, y - 80, 20)
          this.nudge.set(`w${e.x}`, 0.4)
          this.shake = Math.max(this.shake, 4)
          break
        }
        case 'start':
          this.nudge.set(`w${e.x}`, 0.3)
          this.emit(e.x, SPOTS.slots[0]!.y - 120, 6, { colors: ['#ffffff', '#e8e8e8'], s0: 20, s1: 50, a0: -Math.PI * 0.7, a1: -Math.PI * 0.3, g: -80, l0: 0.6, l1: 1, z0: 5, z1: 9, shape: 1 })
          break
        case 'noInput':
        case 'noCoins':
          break
        case 'eat':
          this.emit(e.x, e.y - 6, 6, { colors: ['#6fcf52', '#9be15d'], s0: 30, s1: 90, a0: -Math.PI, a1: 0, g: 400, l0: 0.2, l1: 0.4, z0: 2, z1: 4 })
          break
        case 'truckGo':
          this.dust(SPOTS.truck.x + 40, SPOTS.truck.y - 6, 14)
          break
        case 'truckBack':
          this.popup(SPOTS.truck.x, SPOTS.truck.y - 160, `+${this.fmt(e.coins)}`, '#ffe14d', 'coin')
          this.emit(SPOTS.truck.x, SPOTS.truck.y - 120, 18, { colors: ['#ffcc33', '#ffe14d', '#fff3b0'], s0: 120, s1: 320, a0: -Math.PI * 0.9, a1: -Math.PI * 0.1, g: 700, l0: 0.5, l1: 0.9, z0: 3, z1: 6, shape: 1 })
          break
        case 'monkeyHit':
          this.emit(e.x, e.y - 40, 8, { colors: ['#ffe14d', '#ffffff', '#ffb040'], s0: 100, s1: 220, l0: 0.2, l1: 0.4, z0: 3, z1: 5, g: 0, shape: 1 })
          break
        case 'monkeyShoo':
          this.dust(e.x, e.y, 16)
          this.emit(e.x, e.y - 40, 14, { colors: ['#ffe14d', '#ffffff'], s0: 120, s1: 280, l0: 0.3, l1: 0.6, z0: 3, z1: 5, g: 0, shape: 1 })
          break
        case 'steal':
          this.dust(e.x, e.y, 8)
          break
        case 'goal':
          break
        case 'won':
          for (let i = 0; i < 7; i++) this.emit(rand(200, 1080), rand(80, 300), 22, { colors: ['#ffe14d', '#8fd36a', '#ff9cc9', '#4fc3f7', '#ffffff'], s0: 100, s1: 380, l0: 1, l1: 2, z0: 4, z1: 8, g: 260 })
          break
        default:
          break
      }
    }
  }

  /** Moves effects on (only while the game runs). */
  update(dt: number) {
    this.time += dt
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30)
    for (const [key, t] of this.nudge) {
      if (t - dt <= 0) this.nudge.delete(key)
      else this.nudge.set(key, t - dt)
    }
    for (const p of this.parts) {
      if (!p.on) continue
      p.life -= dt
      if (p.life <= 0) {
        p.on = false
        continue
      }
      p.vy += p.g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i]!.t += dt
      if (this.popups[i]!.t > 1.2) this.popups.splice(i, 1)
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]!
      f.t += dt / 0.55
      if (f.t >= 1) {
        this.flyers.splice(i, 1)
        this.nudge.set('barnIn', 0.2)
      }
    }
  }

  /* ------------------------------ Drawing ------------------------------ */

  render(engine: Engine, ui: BoardUi) {
    const ctx = this.ctx
    const K = this.K
    const sh = this.reducedMotion ? 0 : this.shake
    const sx = sh ? rand(-sh, sh) : 0
    const sy = sh ? rand(-sh, sh) : 0
    ctx.setTransform(K, 0, 0, K, sx * K, sy * K)
    if (this.bg) ctx.drawImage(this.bg, -sh, -sh, W + sh * 2, H + sh * 2)

    this.drawGrass(engine)
    if (ui.hover) {
      ctx.strokeStyle = engine.water > 0 ? 'rgba(255,255,255,.75)' : 'rgba(255,120,140,.8)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(PEN.x + ui.hover.c * PEN.cell + 3, PEN.y + ui.hover.r * PEN.cell + 3, PEN.cell - 6, PEN.cell - 6, 10)
      ctx.stroke()
    }

    this.drawWell(engine)
    for (const w of engine.workshops) this.drawWorkshop(engine, w)

    // Animals, goods and monkeys, back to front.
    type Thing = { y: number, kind: 0 | 1 | 2, i: number }
    const things: Thing[] = []
    engine.animals.forEach((a, i) => things.push({ y: a.y, kind: 0, i }))
    engine.goods.forEach((g, i) => things.push({ y: g.y + 2, kind: 1, i }))
    engine.monkeys.forEach((m, i) => things.push({ y: m.y + 1, kind: 2, i }))
    things.sort((a, b) => a.y - b.y)
    for (const t of things) {
      if (t.kind === 0) this.drawAnimal(engine.animals[t.i]!)
      else if (t.kind === 1) this.drawGood(engine.goods[t.i]!)
      else this.drawMonkey(engine.monkeys[t.i]!)
    }

    this.drawBarn(engine)
    this.drawTruck(engine)

    // Goods flying into the barn.
    for (const f of this.flyers) {
      const t = ease(f.t)
      const x = f.x0 + (BARN_DOOR.x - f.x0) * t
      const y = f.y0 + (BARN_DOOR.y - f.y0) * t - Math.sin(t * Math.PI) * 120
      const s = 1 - t * 0.4
      this.draw(f.item, x, y + 14, s, s)
    }

    // Particles: squares, dots and rings.
    for (const p of this.parts) {
      if (!p.on) continue
      const a = p.life / p.max
      ctx.globalAlpha = Math.min(1, a * 1.5)
      if (p.shape === 2) {
        ctx.strokeStyle = p.color
        ctx.lineWidth = 8 * a
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 - a * 0.8), 0, TAU)
        ctx.stroke()
      }
      else if (p.shape === 1) {
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU)
        ctx.fill()
      }
      else {
        ctx.fillStyle = p.color
        const s = p.size
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillRect(-s / 2, -s / 2, s, s)
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1

    for (const p of this.popups) {
      const y = p.y - p.t * 46
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, p.t - 0.6) / 0.6)
      const width = p.icon ? 30 : 0
      if (p.icon) this.draw(p.icon, p.x - this.textWidth(p.text, 30) / 2 - 4, y + 16, 1, 1, 0, false, ctx.globalAlpha)
      this.text(p.text, p.x + width / 2, y, 30, p.color)
    }
    ctx.globalAlpha = 1
  }

  private textWidth(text: string, size: number) {
    this.ctx.font = `${size}px Koulen, "Kantumruy Pro Variable", sans-serif`
    return this.ctx.measureText(text).width
  }

  private text(text: string, x: number, y: number, size: number, color: string, outline = 'rgba(40,24,8,.9)') {
    const ctx = this.ctx
    ctx.font = `${size}px Koulen, "Kantumruy Pro Variable", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = outline
    ctx.lineWidth = size * 0.22
    ctx.strokeText(text, x, y)
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
  }

  private badge(x: number, y: number, w: number, h: number, fill: string, stroke = 'rgba(40,24,8,.85)') {
    const ctx = this.ctx
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2)
    ctx.fill()
    ctx.stroke()
  }

  private bar(x: number, y: number, w: number, value: number, color: string) {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(40,24,8,.75)'
    ctx.beginPath()
    ctx.roundRect(x - w / 2 - 3, y - 7, w + 6, 14, 7)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - 4, Math.max(8, w * Math.min(1, value)), 8, 4)
    ctx.fill()
  }

  private drawGrass(engine: Engine) {
    const ctx = this.ctx
    const p = WORLDS[this.level.world]!.palette
    ctx.lineCap = 'round'
    for (let i = 0; i < engine.grass.length; i++) {
      const g = engine.grass[i]!
      if (!g) continue
      const r = Math.floor(i / PEN.cols)
      const c = i % PEN.cols
      const x = PEN.x + c * PEN.cell
      const y = PEN.y + r * PEN.cell
      ctx.globalAlpha = 0.45 + 0.18 * g
      ctx.fillStyle = (r + c) % 2 ? p.grassA : p.grassB
      ctx.beginPath()
      ctx.roundRect(x + 2, y + 2, PEN.cell - 4, PEN.cell - 4, 14)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = shade(p.grassB, -0.3)
      ctx.lineWidth = 3
      ctx.beginPath()
      const blades = this.blades[i]!
      const n = g * 3
      const sway = this.reducedMotion ? 0 : Math.sin(this.time * 2 + i) * 1.5
      for (let k = 0; k < n && k < blades.length; k++) {
        const b = blades[k]!
        const bx = x + b.x
        const by = y + b.y
        const h = b.h * (0.7 + g / GRASS_MAX * 0.4)
        ctx.moveTo(bx - 4, by)
        ctx.lineTo(bx - 6 + b.lean + sway, by - h)
        ctx.moveTo(bx, by)
        ctx.lineTo(bx + b.lean + sway, by - h - 3)
        ctx.moveTo(bx + 4, by)
        ctx.lineTo(bx + 6 + b.lean + sway, by - h)
      }
      ctx.stroke()
    }
  }

  private wobble(key: string) {
    const t = this.nudge.get(key)
    if (!t || this.reducedMotion) return 0
    return Math.sin(t * 50) * t * 0.12
  }

  private drawWell(engine: Engine) {
    const s = SPOTS.well
    const wob = this.wobble('well')
    this.draw('well', s.x, s.y, 1 + Math.abs(wob) * 0.5, 1 - Math.abs(wob) * 0.5, wob * 0.5)
    // Buckets left, as drops above the well.
    const max = this.level.water
    const gap = 26
    const x0 = s.x - ((max - 1) * gap) / 2
    for (let i = 0; i < max; i++) {
      const full = i < engine.water
      this.draw('water', x0 + i * gap, s.y - s.h - 6, full ? 0.85 : 0.7, full ? 0.85 : 0.7, 0, false, full ? 1 : 0.28)
    }
    if (engine.refilling > 0) {
      const t = 1 - engine.refilling / this.level.refill
      this.bar(s.x, s.y + 16, 110, t, '#4fc3f7')
    }
    else if (engine.water === 0) {
      const pulse = this.reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(this.time * 8)
      this.ctx.globalAlpha = pulse
      this.badge(s.x, s.y + 16, 46, 30, '#ffe14d')
      this.ctx.globalAlpha = 1
      this.draw('water', s.x, s.y + 28, 0.7, 0.7)
    }
  }

  private drawWorkshop(engine: Engine, w: Engine['workshops'][number]) {
    const s = SPOTS.slots[w.slot]!
    const def = WORKSHOPS[w.type]
    const wob = this.wobble(`w${w.x}`)
    if (!w.built) {
      this.draw('plot', s.x, s.y)
      this.draw(w.type, s.x, s.y - 4, 0.4, 0.4, 0, false, 0.5)
      const affordable = engine.coins >= def.build
      const label = this.fmt(def.build)
      const tw = this.textWidth(label, 24) + 44
      this.badge(s.x, s.y - 12, tw, 34, affordable ? '#ffe14d' : '#e8d8c0')
      this.draw('coin', s.x - tw / 2 + 20, s.y + 1, 0.8, 0.8)
      this.text(label, s.x + 12, s.y - 10, 24, affordable ? '#5a3a00' : '#8a7a6a', 'rgba(255,255,255,.4)')
      return
    }
    const working = w.busy > 0
    const bounce = working && !this.reducedMotion ? Math.sin(this.time * 10) * 0.02 : 0
    this.draw(w.type, s.x, s.y, 1 + bounce + Math.abs(wob), 1 - bounce - Math.abs(wob), wob * 0.3)
    if (working) {
      const t = 1 - w.busy / def.time
      this.bar(s.x, s.y + 6, 120, t, '#8fd36a')
      if (w.queue) {
        this.badge(s.x + 74, s.y - 130, 40, 30, '#ffe14d')
        this.text(`+${this.fmt(w.queue)}`, s.x + 74, s.y - 128, 20, '#5a3a00', 'rgba(255,255,255,.3)')
      }
      return
    }
    // Idle: a bubble with what it needs; it bobs when you can start it.
    const ready = engine.canStart(w)
    const bob = ready && !this.reducedMotion ? Math.sin(this.time * 5) * 4 : 0
    const n = def.inputs.length
    const bw = 32 + n * 34
    const by = s.y - s.h + 8 + bob
    this.ctx.globalAlpha = ready ? 1 : 0.7
    this.badge(s.x, by, bw, 44, ready ? '#fff7d6' : '#e8e0d0', ready ? '#5bb12c' : 'rgba(40,24,8,.5)')
    def.inputs.forEach((id, i) => this.draw(id, s.x - ((n - 1) * 34) / 2 + i * 34, by + 16, 0.8, 0.8, 0, false, ready ? 1 : 0.6))
    this.ctx.globalAlpha = 1
  }

  private drawAnimal(a: Engine['animals'][number]) {
    const def = ANIMALS[a.type]
    let y = a.y
    let alpha = 1
    if (a.age < 0.5) {
      const t = a.age / 0.5
      y -= (1 - ease(t)) * 260
      alpha = Math.min(1, t * 3)
    }
    let bob = 0
    let rot = 0
    if (!this.reducedMotion) {
      if (a.mode === 'walk') bob = Math.abs(Math.sin(this.time * def.speed * 0.12 + a.id)) * 4
      if (a.mode === 'eat') rot = Math.sin(this.time * 14) * 0.05 + 0.1 * a.face
    }
    this.ctx.globalAlpha = 0.18 * alpha
    this.ctx.fillStyle = '#000'
    this.ctx.beginPath()
    this.ctx.ellipse(a.x, a.y, SPRITES[a.type].w * 0.36, 7, 0, 0, TAU)
    this.ctx.fill()
    this.ctx.globalAlpha = 1
    this.draw(a.type, a.x, y - bob, a.face, 1, rot, false, alpha)
    if (a.food === 0) {
      // Hungry: a thought bubble with grass.
      const h = SPRITES[a.type].h
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.time * 6 + a.id) * 0.06
      const bx = a.x + 18
      const by = y - h - 14
      const ctx = this.ctx
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#d04a4a'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(bx, by, 18 * pulse, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(bx - 14, by + 18, 4, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = '#3f9a3a'
      ctx.beginPath()
      ctx.moveTo(bx - 7, by + 8)
      ctx.lineTo(bx - 9, by - 6)
      ctx.moveTo(bx, by + 8)
      ctx.lineTo(bx, by - 9)
      ctx.moveTo(bx + 7, by + 8)
      ctx.lineTo(bx + 9, by - 6)
      ctx.stroke()
    }
  }

  private drawGood(g: Engine['goods'][number]) {
    let s = 1
    let y = g.y
    if (g.age < 0.35) {
      const t = g.age / 0.35
      s = 0.4 + ease(t) * 0.6
      y -= Math.sin(t * Math.PI) * 26
    }
    const left = g.life - g.age
    let alpha = 1
    if (left < 4 && !this.reducedMotion) alpha = 0.45 + 0.55 * Math.abs(Math.cos(this.time * (left < 2 ? 14 : 8)))
    if (left < 4) {
      // A ring shows how long it has left.
      const ctx = this.ctx
      ctx.strokeStyle = 'rgba(255,90,122,.8)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(g.x, g.y - 14, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (left / 4))
      ctx.stroke()
    }
    this.draw(g.item, g.x, y, s, s, 0, false, alpha)
  }

  private drawMonkey(m: Engine['monkeys'][number]) {
    const flash = m.hit < 0.12
    const hop = this.reducedMotion ? 0 : Math.abs(Math.sin(this.time * (m.mode === 'flee' ? 18 : 9) + m.id)) * (m.mode === 'eat' ? 2 : 8)
    const squash = flash ? 0.9 : 1
    this.ctx.globalAlpha = 0.2
    this.ctx.fillStyle = '#000'
    this.ctx.beginPath()
    this.ctx.ellipse(m.x, m.y, 26, 6, 0, 0, TAU)
    this.ctx.fill()
    this.ctx.globalAlpha = 1
    this.draw('monkey', m.x, m.y - hop, m.face * (2 - squash), squash, 0, flash)
    if (m.carry) this.draw(m.carry, m.x + m.face * 6, m.y - hop - 68, 0.9, 0.9)
    if (m.mode !== 'flee') {
      const gap = 12
      const x0 = m.x - ((m.max - 1) * gap) / 2
      for (let i = 0; i < m.max; i++) {
        this.ctx.fillStyle = i < m.hp ? '#ff5a7a' : 'rgba(40,24,8,.35)'
        this.ctx.beginPath()
        this.ctx.arc(x0 + i * gap, m.y - 92 - hop, 5, 0, TAU)
        this.ctx.fill()
      }
    }
  }

  private drawBarn(engine: Engine) {
    const s = SPOTS.barn
    const wob = this.wobble('barn')
    const gulp = (this.nudge.get('barnIn') ?? 0) * 0.25
    this.draw('barn', s.x, s.y, 1 + gulp + Math.abs(wob) * 0.3, 1 - gulp * 0.6, wob * 0.2)
    const used = engine.barnUsed
    const cap = this.level.barnCap
    const full = used >= cap
    const label = `${this.fmt(used)}/${this.fmt(cap)}`
    const tw = this.textWidth(label, 24) + 24
    this.badge(s.x, s.y - s.h + 44, tw, 34, full ? '#ff9db0' : '#fff7d6')
    this.text(label, s.x, s.y - s.h + 46, 24, full ? '#7a1030' : '#4a2e16', 'rgba(255,255,255,.4)')
  }

  private drawTruck(engine: Engine) {
    const s = SPOTS.truck
    const tr = engine.truck
    let x = s.x
    const T = this.level.truckTime
    if (tr.state === 'away') {
      const p = 1 - tr.t / T
      const leg = Math.min(1.6, T * 0.2) / T
      if (p < leg) x = s.x + ease(p / leg) * 420
      else if (p > 1 - leg) x = s.x + (1 - ease(1 - (1 - p) / leg)) * 420
      else x = W + 400
      const secs = Math.ceil(tr.t)
      this.badge(s.x - 10, s.y - 40, 92, 38, '#fff7d6')
      this.draw('coin', s.x - 40, s.y - 26, 0.8, 0.8)
      this.text(this.fmt(secs), s.x + 4, s.y - 38, 24, '#4a2e16', 'rgba(255,255,255,.4)')
      this.ctx.strokeStyle = '#4a2e16'
      this.ctx.lineWidth = 3
      this.ctx.beginPath()
      this.ctx.arc(s.x + 30, s.y - 40, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (tr.t / T))
      this.ctx.stroke()
    }
    if (x > W + 120) return
    const moving = tr.state === 'away' && !this.reducedMotion
    const bump = moving ? Math.abs(Math.sin(this.time * 30)) * 3 : 0
    this.draw('truck', x, s.y - bump)
    // What's loaded rides on the back seat.
    let k = 0
    for (const id of ITEM_ORDER) {
      for (let i = 0; i < tr.load[id] && k < 6; i++, k++) {
        this.draw(id, x - 82 + (k % 3) * 34 + (k >= 3 ? 16 : 0), s.y - 72 - (k >= 3 ? 20 : 0) - bump, 0.8, 0.8)
      }
    }
  }
}
