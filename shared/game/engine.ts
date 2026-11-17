/**
 * The rules of the farm, with no drawing: a plain TypeScript engine stepped at a fixed rate. It is
 * deterministic (its own seeded random numbers), so tests can play whole levels. It emits events
 * (goods dropped, collected, the tuk-tuk back...) that drive the effects, sounds and top bar.
 */
import {
  ANIMALS, GRASS_MAX, ITEMS, ITEM_ORDER, MAX_ANIMALS, MONKEY, PEN, PEN_BOTTOM, PEN_RIGHT, SPOTS, WORKSHOPS,
  inSpot, tileAt, tileX, tileY,
  type AnimalId, type ItemId, type WorkshopId,
} from './data'
import type { Goal, LevelDef } from './levels'
import { createRng, type Rng } from './rng'

export type GameEvent
  = | { type: 'grass', r: number, c: number }
    | { type: 'noWater' }
    | { type: 'refill' }
    | { type: 'refilled' }
    | { type: 'drop', item: ItemId, x: number, y: number, made: boolean }
    | { type: 'collect', item: ItemId, x: number, y: number }
    | { type: 'full' }
    | { type: 'spoil', item: ItemId, x: number, y: number }
    | { type: 'buy', animal: AnimalId, x: number, y: number, gift: boolean }
    | { type: 'build', workshop: WorkshopId, x: number }
    | { type: 'start', workshop: WorkshopId, x: number }
    | { type: 'noInput', workshop: WorkshopId }
    | { type: 'noCoins' }
    | { type: 'eat', x: number, y: number }
    | { type: 'hungry', x: number, y: number }
    | { type: 'truckGo', value: number }
    | { type: 'truckBack', coins: number }
    | { type: 'monkeyIn' }
    | { type: 'monkeyHit', x: number, y: number, left: number }
    | { type: 'monkeyShoo', x: number, y: number }
    | { type: 'steal', item: ItemId, x: number, y: number }
    | { type: 'goal', index: number }
    | { type: 'won' }

export type TapResult
  = | 'monkey' | 'good' | 'well' | 'workshop' | 'truck' | 'barn' | 'grass'
    | 'noWater' | 'full' | 'noCoins' | 'noInput' | 'busy' | 'none'

export interface Animal {
  id: number
  type: AnimalId
  x: number
  y: number
  tx: number
  ty: number
  /** 1 = full, 0 = hungry. */
  food: number
  /** Towards the next good, 0 to 1. */
  prod: number
  mode: 'walk' | 'wait' | 'eat'
  t: number
  /** The tile it's walking to or eating from, or -1. */
  cell: number
  face: 1 | -1
  /** Seconds since it arrived (for the drop-in animation). */
  age: number
}

export interface Good {
  id: number
  item: ItemId
  x: number
  y: number
  age: number
  life: number
}

export interface Workshop {
  slot: number
  type: WorkshopId
  built: boolean
  x: number
  /** Seconds left on the one being made (0 when idle). */
  busy: number
  /** How many more are waiting after it. */
  queue: number
}

export interface Monkey {
  id: number
  x: number
  y: number
  hp: number
  max: number
  mode: 'sneak' | 'eat' | 'flee'
  targetGood: number
  targetCell: number
  carry: ItemId | null
  t: number
  life: number
  bites: number
  face: 1 | -1
  /** Seconds since the last tap (for the flinch). */
  hit: number
}

export type Stock = Record<ItemId, number>
const emptyStock = (): Stock => ({ egg: 0, duckegg: 0, milk: 0, cake: 0, saltegg: 0, yogurt: 0, dessert: 0 })

export class Engine {
  readonly level: LevelDef
  time = 0
  state: 'playing' | 'won' = 'playing'
  finishTime = 0
  coins: number
  earned = 0
  water: number
  /** Seconds left filling the well (0 when not). */
  refilling = 0
  grass: Uint8Array
  animals: Animal[] = []
  goods: Good[] = []
  workshops: Workshop[]
  monkeys: Monkey[] = []
  barn: Stock = emptyStock()
  collected: Stock = emptyStock()
  truck = { state: 'home' as 'home' | 'away', t: 0, load: emptyStock(), value: 0 }
  /** Goals already met, so each is announced once. */
  done: boolean[]
  monkeysShooed = 0
  goodsLost = 0

  private events: GameEvent[] = []
  private rng: Rng
  private nextId = 1
  private nextMonkey: number
  private stuck = 0

  constructor(level: LevelDef) {
    this.level = level
    this.rng = createRng(level.n * 104729 + 17)
    this.coins = level.startCoins
    this.water = level.water
    this.grass = new Uint8Array(PEN.rows * PEN.cols)
    // A little grass to start with, in the middle of the pen.
    for (let r = 1; r < PEN.rows - 1; r++) {
      for (let c = 3; c < 7; c++) this.grass[r * PEN.cols + c] = 2
    }
    this.workshops = level.workshops.map(s => ({ slot: s.slot, type: s.type, built: s.built, x: SPOTS.slots[s.slot]!.x, busy: 0, queue: 0 }))
    for (const [type, count] of Object.entries(level.startAnimals) as [AnimalId, number][]) {
      for (let i = 0; i < count; i++) this.addAnimal(type, true)
    }
    this.nextMonkey = level.monkeys ? level.monkeys.first : Infinity
    this.done = level.goals.map(() => false)
  }

  /* ------------------------------ Queries ------------------------------ */

  get barnUsed() {
    let n = 0
    for (const id of ITEM_ORDER) n += this.barn[id]
    return n
  }

  get truckLoad() {
    let n = 0
    for (const id of ITEM_ORDER) n += this.truck.load[id]
    return n
  }

  get truckValue() {
    let v = 0
    for (const id of ITEM_ORDER) v += this.truck.load[id] * ITEMS[id].price
    return v
  }

  animalCount(type: AnimalId) {
    let n = 0
    for (const a of this.animals) if (a.type === type) n++
    return n
  }

  goalProgress(goal: Goal) {
    const have = goal.kind === 'item' ? this.collected[goal.item] : goal.kind === 'coins' ? this.earned : this.animalCount(goal.animal)
    return { have: Math.min(have, goal.n), need: goal.n }
  }

  /** How far through the goals, 0 to 1. */
  get progress() {
    let sum = 0
    for (const g of this.level.goals) {
      const p = this.goalProgress(g)
      sum += p.have / p.need
    }
    return sum / Math.max(1, this.level.goals.length)
  }

  get stars() {
    if (this.state !== 'won') return 0
    const t = this.finishTime
    return t <= this.level.par.gold ? 3 : t <= this.level.par.silver ? 2 : 1
  }

  drainEvents() {
    const out = this.events
    this.events = []
    return out
  }

  /* ------------------------------ Actions ------------------------------ */

  /** A tap on the board, in board units. `radius` is how close to a good or monkey counts. */
  tap(x: number, y: number, radius = 52): TapResult {
    if (this.state !== 'playing') return 'none'
    // Monkeys first: chasing them is what you meant.
    let best: Monkey | null = null
    let bestD = radius + 10
    for (const m of this.monkeys) {
      if (m.mode === 'flee') continue
      const dist = Math.hypot(m.x - x, m.y - 34 - y)
      if (dist < bestD) {
        best = m
        bestD = dist
      }
    }
    if (best) {
      this.hitMonkey(best)
      return 'monkey'
    }
    const good = this.goodAt(x, y, radius)
    if (good) return this.collect(good)
    if (inSpot(SPOTS.well, x, y, 6)) return this.tapWell()
    for (const w of this.workshops) {
      const spot = SPOTS.slots[w.slot]!
      if (inSpot(spot, x, y, 4)) return this.tapWorkshop(w)
    }
    if (inSpot(SPOTS.truck, x, y, 6)) return 'truck'
    if (inSpot(SPOTS.barn, x, y, 6)) return 'barn'
    const tile = tileAt(x, y)
    if (tile) return this.water_(tile.r, tile.c)
    return 'none'
  }

  goodAt(x: number, y: number, radius: number) {
    let best: Good | null = null
    let bestD = radius
    for (const g of this.goods) {
      const dist = Math.hypot(g.x - x, g.y - 14 - y)
      if (dist < bestD) {
        best = g
        bestD = dist
      }
    }
    return best
  }

  collect(good: Good): TapResult {
    if (this.barnUsed >= this.level.barnCap) {
      this.emit({ type: 'full' })
      return 'full'
    }
    this.goods.splice(this.goods.indexOf(good), 1)
    this.barn[good.item]++
    this.collected[good.item]++
    this.emit({ type: 'collect', item: good.item, x: good.x, y: good.y })
    return 'good'
  }

  /** Waters a tile of the pen: grass grows there and, a little less, around it. */
  water_(r: number, c: number): TapResult {
    if (this.water <= 0) {
      this.emit({ type: 'noWater' })
      return 'noWater'
    }
    this.water--
    const give = this.level.grassGive
    const grow = (rr: number, cc: number, amount: number) => {
      if (rr < 0 || rr >= PEN.rows || cc < 0 || cc >= PEN.cols || amount <= 0) return
      const i = rr * PEN.cols + cc
      this.grass[i] = Math.min(GRASS_MAX, this.grass[i]! + amount)
    }
    grow(r, c, give)
    grow(r - 1, c, give - 1)
    grow(r + 1, c, give - 1)
    grow(r, c - 1, give - 1)
    grow(r, c + 1, give - 1)
    this.emit({ type: 'grass', r, c })
    return 'grass'
  }

  tapWell(): TapResult {
    if (this.refilling > 0 || this.water >= this.level.water) return 'busy'
    this.refilling = this.level.refill
    this.emit({ type: 'refill' })
    return 'well'
  }

  tapWorkshop(w: Workshop): TapResult {
    const def = WORKSHOPS[w.type]
    if (!w.built) {
      if (this.coins < def.build) {
        this.emit({ type: 'noCoins' })
        return 'noCoins'
      }
      this.coins -= def.build
      w.built = true
      this.emit({ type: 'build', workshop: w.type, x: w.x })
      return 'workshop'
    }
    if (w.queue >= 2) return 'busy'
    if (!def.inputs.every(id => this.barn[id] > 0)) {
      this.emit({ type: 'noInput', workshop: w.type })
      return 'noInput'
    }
    for (const id of def.inputs) this.barn[id]--
    if (w.busy > 0) w.queue++
    else w.busy = def.time
    this.emit({ type: 'start', workshop: w.type, x: w.x })
    return 'workshop'
  }

  /** Whether a workshop can start one now (built, inputs in the barn, room in its queue). */
  canStart(w: Workshop) {
    return w.built && w.queue < 2 && WORKSHOPS[w.type].inputs.every(id => this.barn[id] > 0)
  }

  buy(type: AnimalId): 'ok' | 'noCoins' | 'max' {
    if (this.state !== 'playing') return 'max'
    if (this.animals.length >= MAX_ANIMALS) return 'max'
    const cost = ANIMALS[type].cost
    if (this.coins < cost) {
      this.emit({ type: 'noCoins' })
      return 'noCoins'
    }
    this.coins -= cost
    this.addAnimal(type, false)
    return 'ok'
  }

  /** Moves goods from the barn onto the tuk-tuk. Returns how many went. */
  loadTruck(item: ItemId, count = 1) {
    if (this.truck.state !== 'home') return 0
    const n = Math.min(count, this.barn[item], this.level.truckCap - this.truckLoad)
    if (n <= 0) return 0
    this.barn[item] -= n
    this.truck.load[item] += n
    return n
  }

  unloadTruck(item: ItemId, count = 1) {
    if (this.truck.state !== 'home') return 0
    const n = Math.min(count, this.truck.load[item])
    this.truck.load[item] -= n
    this.barn[item] += n
    return n
  }

  sendTruck() {
    if (this.state !== 'playing' || this.truck.state !== 'home' || this.truckLoad === 0) return false
    this.truck.state = 'away'
    this.truck.t = this.level.truckTime
    this.truck.value = this.truckValue
    this.emit({ type: 'truckGo', value: this.truck.value })
    return true
  }

  /* ------------------------------ Time ------------------------------ */

  step(dt: number) {
    if (this.state !== 'playing') {
      // Animals keep pottering about on the result screen.
      for (const a of this.animals) this.wander(a, dt)
      return
    }
    this.time += dt

    if (this.refilling > 0) {
      this.refilling -= dt
      if (this.refilling <= 0) {
        this.refilling = 0
        this.water = this.level.water
        this.emit({ type: 'refilled' })
      }
    }

    for (const a of this.animals) this.stepAnimal(a, dt)

    for (let i = this.goods.length - 1; i >= 0; i--) {
      const g = this.goods[i]!
      g.age += dt
      if (g.age >= g.life) {
        this.goods.splice(i, 1)
        this.goodsLost++
        this.emit({ type: 'spoil', item: g.item, x: g.x, y: g.y })
      }
    }

    for (const w of this.workshops) {
      if (w.busy <= 0) continue
      w.busy -= dt
      if (w.busy <= 0) {
        const def = WORKSHOPS[w.type]
        this.dropGood(def.output, w.x + this.rng.range(-36, 36), PEN.y + 26 + this.rng.range(0, 18), true)
        if (w.queue > 0) {
          w.queue--
          w.busy = def.time
        }
        else w.busy = 0
      }
    }

    if (this.truck.state === 'away') {
      this.truck.t -= dt
      if (this.truck.t <= 0) {
        this.coins += this.truck.value
        this.earned += this.truck.value
        this.emit({ type: 'truckBack', coins: this.truck.value })
        this.truck = { state: 'home', t: 0, load: emptyStock(), value: 0 }
      }
    }

    if (this.time >= this.nextMonkey && this.level.monkeys) {
      this.spawnMonkey()
      this.nextMonkey = this.time + this.level.monkeys.every
    }
    for (let i = this.monkeys.length - 1; i >= 0; i--) {
      const m = this.monkeys[i]!
      this.stepMonkey(m, dt)
      if (m.mode === 'flee' && m.x > PEN_RIGHT + 260) this.monkeys.splice(i, 1)
    }

    this.rescue(dt)
    this.checkGoals()
  }

  /* ------------------------------ Animals ------------------------------ */

  private addAnimal(type: AnimalId, start: boolean, gift = false) {
    const x = this.rng.range(PEN.x + 60, PEN_RIGHT - 60)
    const y = this.rng.range(PEN.y + 70, PEN_BOTTOM - 20)
    const a: Animal = {
      id: this.nextId++, type, x, y, tx: x, ty: y, food: start ? this.rng.range(0.5, 1) : 1,
      prod: start ? this.rng.range(0, 0.4) : 0, mode: 'wait', t: this.rng.range(0.2, 1.2), cell: -1,
      face: this.rng.next() < 0.5 ? 1 : -1, age: start ? 10 : 0,
    }
    this.animals.push(a)
    if (!start) this.emit({ type: 'buy', animal: type, x, y, gift })
  }

  private stepAnimal(a: Animal, dt: number) {
    const def = ANIMALS[a.type]
    a.age += dt
    const wasFed = a.food > 0
    a.food = Math.max(0, a.food - dt / def.belly)
    if (wasFed && a.food === 0) this.emit({ type: 'hungry', x: a.x, y: a.y })
    if (a.food > 0) {
      a.prod += dt / def.period
      if (a.prod >= 1) {
        a.prod = 0
        this.dropGood(def.product, a.x + a.face * -14, a.y + 2, false)
      }
    }

    if (a.mode === 'eat') {
      a.t -= dt
      if (a.t <= 0) {
        if (a.cell >= 0 && this.grass[a.cell]! > 0) {
          this.grass[a.cell]!--
          a.food = 1
          this.emit({ type: 'eat', x: a.x, y: a.y })
        }
        a.cell = -1
        a.mode = 'wait'
        a.t = this.rng.range(0.3, 1)
      }
      return
    }

    // Hungry: head for the nearest grass.
    if (a.food < 0.3 && (a.cell < 0 || this.grass[a.cell] === 0)) {
      const cell = this.nearestGrass(a.x, a.y)
      if (cell >= 0) {
        a.cell = cell
        const r = Math.floor(cell / PEN.cols)
        const c = cell % PEN.cols
        a.tx = tileX(c) + this.rng.range(-14, 14)
        a.ty = tileY(r) + this.rng.range(4, 18)
        a.mode = 'walk'
      }
    }

    if (a.cell >= 0 && a.mode === 'walk') {
      if (this.moveTo(a, def.speed * (a.food < 0.3 ? 1.25 : 1), dt)) {
        if (this.grass[a.cell]! > 0) {
          a.mode = 'eat'
          a.t = def.eat
        }
        else a.cell = -1
      }
      return
    }
    this.wander(a, dt)
  }

  private wander(a: Animal, dt: number) {
    if (a.mode === 'wait') {
      a.t -= dt
      if (a.t <= 0) {
        a.tx = Math.max(PEN.x + 30, Math.min(PEN_RIGHT - 30, a.x + this.rng.range(-160, 160)))
        a.ty = Math.max(PEN.y + 60, Math.min(PEN_BOTTOM - 12, a.y + this.rng.range(-110, 110)))
        a.mode = 'walk'
      }
      return
    }
    if (this.moveTo(a, ANIMALS[a.type].speed * 0.6, dt)) {
      a.mode = 'wait'
      a.t = this.rng.range(0.6, 2.4)
    }
  }

  private moveTo(a: { x: number, y: number, tx: number, ty: number, face: 1 | -1 }, speed: number, dt: number) {
    const dx = a.tx - a.x
    const dy = a.ty - a.y
    const dist = Math.hypot(dx, dy)
    const stepLen = speed * dt
    if (dist <= stepLen || dist < 0.5) {
      a.x = a.tx
      a.y = a.ty
      return true
    }
    a.x += (dx / dist) * stepLen
    a.y += (dy / dist) * stepLen
    if (Math.abs(dx) > 2) a.face = dx > 0 ? 1 : -1
    return false
  }

  private nearestGrass(x: number, y: number) {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < this.grass.length; i++) {
      if (!this.grass[i]) continue
      const r = Math.floor(i / PEN.cols)
      const c = i % PEN.cols
      // Prefer thick grass a little: it's more food on fewer trips.
      const dist = Math.hypot(tileX(c) - x, tileY(r) - y) - this.grass[i]! * 12
      if (dist < bestD) {
        best = i
        bestD = dist
      }
    }
    return best
  }

  private dropGood(item: ItemId, x: number, y: number, made: boolean) {
    const gx = Math.max(PEN.x + 20, Math.min(PEN_RIGHT - 20, x))
    const gy = Math.max(PEN.y + 26, Math.min(PEN_BOTTOM - 6, y))
    this.goods.push({ id: this.nextId++, item, x: gx, y: gy, age: 0, life: ITEMS[item].life })
    this.emit({ type: 'drop', item, x: gx, y: gy, made })
  }

  /* ------------------------------ Monkeys ------------------------------ */

  private spawnMonkey() {
    const def = this.level.monkeys!
    const y = this.rng.range(PEN.y + 70, PEN_BOTTOM - 10)
    this.monkeys.push({
      id: this.nextId++, x: PEN_RIGHT + 200, y, hp: def.hp, max: def.hp, mode: 'sneak', targetGood: -1, targetCell: -1,
      carry: null, t: 0, life: MONKEY.stay, bites: 0, face: -1, hit: 9,
    })
    this.emit({ type: 'monkeyIn' })
  }

  private hitMonkey(m: Monkey) {
    m.hp--
    m.hit = 0
    if (m.hp <= 0) {
      m.mode = 'flee'
      m.face = 1
      this.monkeysShooed++
      // It drops what it took.
      if (m.carry) {
        this.dropGood(m.carry, m.x, m.y, false)
        m.carry = null
      }
      this.emit({ type: 'monkeyShoo', x: m.x, y: m.y })
    }
    else this.emit({ type: 'monkeyHit', x: m.x, y: m.y, left: m.hp })
  }

  private stepMonkey(m: Monkey, dt: number) {
    m.hit += dt
    if (m.mode === 'flee') {
      m.x += MONKEY.flee * dt
      m.face = 1
      return
    }
    m.life -= dt
    if (m.life <= 0) {
      m.mode = 'flee'
      return
    }
    if (m.mode === 'eat') {
      m.t -= dt
      if (m.t <= 0) {
        if (m.targetCell >= 0 && this.grass[m.targetCell]! > 0) this.grass[m.targetCell] = Math.max(0, this.grass[m.targetCell]! - 2)
        m.targetCell = -1
        m.bites++
        m.mode = m.bites >= 3 ? 'flee' : 'sneak'
      }
      return
    }
    // Sneaking: after goods first, else the grass.
    let good = m.targetGood >= 0 ? this.goods.find(g => g.id === m.targetGood) : undefined
    if (!good) {
      m.targetGood = -1
      let bestD = Infinity
      for (const g of this.goods) {
        const dist = Math.hypot(g.x - m.x, g.y - m.y)
        if (dist < bestD) {
          bestD = dist
          good = g
        }
      }
      if (good) m.targetGood = good.id
    }
    const walker = { x: m.x, y: m.y, tx: m.x, ty: m.y, face: m.face }
    if (good) {
      walker.tx = good.x
      walker.ty = good.y
      const arrived = this.moveTo(walker, MONKEY.speed, dt)
      m.x = walker.x
      m.y = walker.y
      m.face = walker.face
      if (arrived || Math.hypot(good.x - m.x, good.y - m.y) < 14) {
        this.goods.splice(this.goods.indexOf(good), 1)
        this.goodsLost++
        m.carry = good.item
        m.mode = 'flee'
        this.emit({ type: 'steal', item: good.item, x: good.x, y: good.y })
      }
      return
    }
    if (m.targetCell < 0 || this.grass[m.targetCell] === 0) m.targetCell = this.nearestGrass(m.x, m.y)
    if (m.targetCell < 0) {
      walker.tx = PEN_RIGHT - 120
      walker.ty = m.y
      this.moveTo(walker, MONKEY.speed * 0.5, dt)
      m.x = walker.x
      m.face = walker.face
      return
    }
    const r = Math.floor(m.targetCell / PEN.cols)
    const c = m.targetCell % PEN.cols
    walker.tx = tileX(c)
    walker.ty = tileY(r) + 10
    const arrived = this.moveTo(walker, MONKEY.speed, dt)
    m.x = walker.x
    m.y = walker.y
    m.face = walker.face
    if (arrived) {
      m.mode = 'eat'
      m.t = 1.6
    }
  }

  /* ------------------------------ Goals ------------------------------ */

  /** Never stuck: with nothing left to sell or buy with, the village chief gives you a chicken. */
  private rescue(dt: number) {
    const cheapest = Math.min(...this.level.shop.map(a => ANIMALS[a].cost), Infinity)
    const nothing = this.animals.length === 0 && this.goods.length === 0 && this.barnUsed === 0
      && this.truck.state === 'home' && this.truckLoad === 0 && this.coins < cheapest
      && this.workshops.every(w => w.busy <= 0)
    if (!nothing) {
      this.stuck = 0
      return
    }
    this.stuck += dt
    if (this.stuck > 3) {
      this.stuck = 0
      this.addAnimal('chicken', false, true)
    }
  }

  private checkGoals() {
    let all = true
    this.level.goals.forEach((g, i) => {
      const p = this.goalProgress(g)
      const met = p.have >= p.need
      if (met && !this.done[i]) {
        this.done[i] = true
        this.emit({ type: 'goal', index: i })
      }
      if (!met) all = false
    })
    if (all) {
      this.state = 'won'
      this.finishTime = this.time
      this.emit({ type: 'won' })
    }
  }

  private emit(event: GameEvent) {
    this.events.push(event)
  }
}
