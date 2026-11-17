/**
 * The 150 levels: six worlds of twenty-five. Each level is generated from its number with a seeded
 * random generator, so it is the same on every device and every time, and tests can play them all.
 *
 * The first levels of each world teach what's new there (an animal, a workshop, monkeys, the dry
 * season, the festival). Every world has two rush levels (10th and 20th: start rich, finish fast), a
 * monkey raid (15th) and a festival order at its 25th: a big order using everything you have.
 * Star times come from par.ts, made by a simple player playing every level (see test/unit/par.test.ts).
 */
import {
  ANIMAL_ORDER, LEVELS_PER_WORLD, WORKSHOP_ORDER,
  type AnimalId, type ItemId, type WorkshopId,
} from './data'
import { PAR } from './par'
import { createRng } from './rng'

export const WORLD_COUNT = 6
export const TOTAL_LEVELS = WORLD_COUNT * LEVELS_PER_WORLD

export type WorldId = 'village' | 'ricefield' | 'riverside' | 'temple' | 'palmgrove' | 'festival'

export interface WorldDef {
  id: WorldId
  /** Dry season: watering grows less grass and the well is slower. */
  dry: boolean
  palette: { grassA: string, grassB: string, soil: string, soilDark: string, yard: string, yardDark: string, fence: string, edge: string }
  /** Things drawn around the yard. */
  decor: 'banana' | 'rice' | 'river' | 'temple' | 'palms' | 'flags'
  /** Colours of the world's card on the map. */
  accent: { from: string, to: string }
  /** What can be bought and built from this world on. */
  animals: AnimalId[]
  workshops: WorkshopId[]
}

export const WORLDS: WorldDef[] = [
  { id: 'village', dry: false, decor: 'banana', accent: { from: '#9bdc6a', to: '#2f7d3a' }, animals: ['chicken'], workshops: ['bakery'],
    palette: { grassA: '#8fcf5c', grassB: '#82c450', soil: '#b98a5a', soilDark: '#946a40', yard: '#d9b98a', yardDark: '#c3a274', fence: '#7a4d2a', edge: '#5e8f3a' } },
  { id: 'ricefield', dry: false, decor: 'rice', accent: { from: '#d6e872', to: '#5f9a2a' }, animals: ['chicken', 'duck'], workshops: ['bakery', 'saltjar'],
    palette: { grassA: '#9fd062', grassB: '#92c556', soil: '#a98657', soilDark: '#86663e', yard: '#d8c08e', yardDark: '#c0a777', fence: '#6f4a28', edge: '#6aa03c' } },
  { id: 'riverside', dry: false, decor: 'river', accent: { from: '#6fd0e8', to: '#1f6a86' }, animals: ['chicken', 'duck', 'cow'], workshops: ['bakery', 'saltjar', 'dairy'],
    palette: { grassA: '#7cc66a', grassB: '#70ba5e', soil: '#9a7a58', soilDark: '#7a5c3e', yard: '#cdb894', yardDark: '#b59f7c', fence: '#5e4028', edge: '#4f9a6a' } },
  { id: 'temple', dry: false, decor: 'temple', accent: { from: '#f0c98a', to: '#8a5a2a' }, animals: ['chicken', 'duck', 'cow'], workshops: ['bakery', 'saltjar', 'dairy', 'stall'],
    palette: { grassA: '#8cc46a', grassB: '#80b85e', soil: '#a88a66', soilDark: '#86694a', yard: '#d4c3a0', yardDark: '#bcaa86', fence: '#6a4a30', edge: '#6c9a50' } },
  { id: 'palmgrove', dry: true, decor: 'palms', accent: { from: '#ffc46a', to: '#a4541e' }, animals: ['chicken', 'duck', 'cow'], workshops: ['bakery', 'saltjar', 'dairy', 'stall'],
    palette: { grassA: '#bcc46a', grassB: '#b0b85e', soil: '#c49060', soilDark: '#a07048', yard: '#e6c690', yardDark: '#cfae78', fence: '#7a4a24', edge: '#a0984a' } },
  { id: 'festival', dry: false, decor: 'flags', accent: { from: '#ff8fb0', to: '#6a2a7a' }, animals: ['chicken', 'duck', 'cow'], workshops: ['bakery', 'saltjar', 'dairy', 'stall'],
    palette: { grassA: '#84cc66', grassB: '#78c05a', soil: '#a7805a', soilDark: '#845f3e', yard: '#dcc095', yardDark: '#c4a87c', fence: '#6a3a3a', edge: '#5aa060' } },
]

export type LevelKind = 'tutorial' | 'normal' | 'rush' | 'raid' | 'festival'

export type Goal
  = | { kind: 'item', item: ItemId, n: number }
    | { kind: 'coins', n: number }
    | { kind: 'animal', animal: AnimalId, n: number }

export interface WorkshopSlot {
  slot: number
  type: WorkshopId
  built: boolean
}

export interface LevelDef {
  /** 1 to TOTAL_LEVELS. */
  n: number
  world: number
  /** 0 to 24 inside its world. */
  index: number
  kind: LevelKind
  goals: Goal[]
  startCoins: number
  startAnimals: Partial<Record<AnimalId, number>>
  /** Animals you can buy. */
  shop: AnimalId[]
  workshops: WorkshopSlot[]
  /** Buckets the well holds, and seconds to fill it. */
  water: number
  refill: number
  /** Bites of grass one watering gives the tapped tile (its neighbours get one less). */
  grassGive: number
  barnCap: number
  truckCap: number
  /** Seconds for a round trip to the market. */
  truckTime: number
  /** Monkeys: the first comes at `first` seconds, then one every `every`; each takes `hp` taps. */
  monkeys: { first: number, every: number, hp: number } | null
  /** Finish within `gold` seconds (half again the simple player's time) for three stars, within `silver` for two. */
  par: { gold: number, silver: number }
  /** Whether this level brings something new (shown on the briefing). */
  news: ('chicken' | 'duck' | 'cow' | WorkshopId | 'monkey' | 'dry' | 'festival' | 'truck')[]
}

const round = (value: number, to: number) => Math.max(to, Math.round(value / to) * to)

/** "3-12": world 3, level 12. */
export function levelLabel(n: number) {
  const w = Math.floor((n - 1) / LEVELS_PER_WORLD)
  return `${w + 1}-${n - w * LEVELS_PER_WORLD}`
}

function parOf(n: number) {
  const bot = PAR[n - 1] ?? 150
  const gold = Math.ceil((bot * 1.5) / 5) * 5
  return { gold, silver: Math.ceil((gold * 1.6) / 5) * 5 }
}

/** How many of an item a goal asks for, at a difficulty from 0 to 1. */
function itemCount(item: ItemId, d: number, scale: number) {
  const base: Record<ItemId, [number, number]> = {
    egg: [8, 34], duckegg: [6, 26], milk: [4, 18],
    cake: [3, 16], saltegg: [3, 12], yogurt: [2, 9], dessert: [1, 5],
  }
  const [a, b] = base[item]
  return Math.max(1, Math.round((a + (b - a) * d) * scale))
}

const cache = new Map<number, LevelDef>()

export function getLevel(n: number): LevelDef {
  const hit = cache.get(n)
  if (hit) return hit
  const level = makeLevel(n)
  cache.set(n, level)
  return level
}

function makeLevel(n: number): LevelDef {
  const world = Math.floor((n - 1) / LEVELS_PER_WORLD)
  const index = n - 1 - world * LEVELS_PER_WORLD
  const w = WORLDS[world]!
  const d = (n - 1) / (TOTAL_LEVELS - 1)
  const rng = createRng(0xC4A7 + n * 7919)

  const base: LevelDef = {
    n, world, index, kind: 'normal', goals: [], startCoins: 0, startAnimals: { chicken: 2 },
    shop: [...w.animals],
    workshops: w.workshops.map(type => ({ slot: WORKSHOP_ORDER.indexOf(type), type, built: false })),
    water: w.dry ? 5 : 6,
    refill: w.dry ? 4 : 2.5,
    grassGive: w.dry ? 2 : 3,
    barnCap: 12 + world * 3,
    truckCap: 8 + world * 2,
    truckTime: world === 5 ? 8 : 12 - world * 0.5,
    monkeys: null,
    par: parOf(n),
    news: [],
  }

  const tutorial = tutorialLevel(base)
  if (tutorial) return tutorial

  // Kinds inside a world.
  let kind: LevelKind = 'normal'
  if (index === 24) kind = 'festival'
  else if (index === 9 || index === 19) kind = 'rush'
  else if (index === 14 && world > 0) kind = 'raid'
  base.kind = kind

  // What this level is about: the newer animals and workshops are picked more often.
  const items: ItemId[] = []
  for (const a of w.animals) items.push(a === 'chicken' ? 'egg' : a === 'duck' ? 'duckegg' : 'milk')
  for (const ws of w.workshops) items.push(ws === 'bakery' ? 'cake' : ws === 'saltjar' ? 'saltegg' : ws === 'dairy' ? 'yogurt' : 'dessert')
  const weights = items.map((_, i) => 1 + i * 0.6)
  const pickItem = (exclude: Set<ItemId>) => {
    let total = 0
    for (let i = 0; i < items.length; i++) if (!exclude.has(items[i]!)) total += weights[i]!
    let r = rng.next() * total
    for (let i = 0; i < items.length; i++) {
      if (exclude.has(items[i]!)) continue
      r -= weights[i]!
      if (r <= 0) return items[i]!
    }
    return items.find(it => !exclude.has(it))!
  }

  const scale = kind === 'festival' ? 1.35 : kind === 'rush' ? 0.8 : 1
  const goalCount = kind === 'festival' ? Math.min(4, items.length) : d < 0.25 ? 2 : rng.next() < 0.5 ? 2 : 3
  const used = new Set<ItemId>()
  const goals: Goal[] = []
  if (kind === 'festival') {
    // The festival always asks for the world's finest product.
    const top = items[items.length - 1]!
    used.add(top)
    goals.push({ kind: 'item', item: top, n: itemCount(top, d, scale) })
  }
  while (goals.length < goalCount) {
    const roll = rng.next()
    if (roll < 0.14 && !goals.some(g => g.kind === 'coins')) {
      goals.push({ kind: 'coins', n: round((300 + 3200 * d) * scale, 50) })
    }
    else if (roll < 0.24 && !goals.some(g => g.kind === 'animal')) {
      const animal = rng.pick(w.animals)
      const counts: Record<AnimalId, [number, number]> = { chicken: [4, 9], duck: [3, 7], cow: [2, 5] }
      const [a, b] = counts[animal]
      goals.push({ kind: 'animal', animal, n: Math.round(a + (b - a) * d) })
    }
    else if (used.size < items.length) {
      const item = pickItem(used)
      used.add(item)
      goals.push({ kind: 'item', item, n: itemCount(item, d, scale) })
    }
  }
  base.goals = goals

  // Workshops: the ones from earlier worlds are often already built.
  for (const slot of base.workshops) {
    const fromWorld = WORLDS.findIndex(wd => wd.workshops.includes(slot.type))
    slot.built = kind === 'rush' || (fromWorld < world && rng.next() < 0.55)
  }

  // Animals to start with: some chickens, and one of each other animal the goals need.
  const start: Partial<Record<AnimalId, number>> = { chicken: 2 + (rng.next() < d ? 1 : 0) }
  const needs = neededAnimals(goals)
  for (const a of ANIMAL_ORDER) {
    if (a !== 'chicken' && needs.has(a) && w.animals.includes(a)) start[a] = 1
  }
  base.startAnimals = start

  // Coins to start with: enough to get going, more for rush levels.
  let coins = 120 + Math.round(500 * d)
  const unbuilt = base.workshops.filter(s => !s.built && neededWorkshops(goals).has(s.type))
  if (unbuilt.length) coins += Math.round(unbuilt.reduce((sum, s) => sum + buildCost(s.type), 0) * 0.35)
  if (kind === 'rush') coins *= 2.5
  base.startCoins = round(coins, 10)

  // Monkeys, from the second world's third level on.
  if (world >= 1 && !(world === 1 && index < 2)) {
    const hp = 3 + Math.floor(d * 4)
    base.monkeys = kind === 'raid'
      ? { first: 12, every: 9, hp: hp + 1 }
      : { first: rng.int(24, 36), every: Math.round(Math.max(13, 38 - 22 * d) * (world === 5 ? 0.8 : 1)), hp }
  }
  if (world === 1 && index === 2) base.news.push('monkey')
  return base
}

function buildCost(type: WorkshopId) {
  return { bakery: 220, saltjar: 480, dairy: 950, stall: 1700 }[type]
}

/** Workshops a set of goals needs (including the ones that feed them). */
export function neededWorkshops(goals: Goal[]) {
  const set = new Set<WorkshopId>()
  for (const g of goals) {
    if (g.kind !== 'item') continue
    if (g.item === 'cake') set.add('bakery')
    if (g.item === 'saltegg') set.add('saltjar')
    if (g.item === 'yogurt') set.add('dairy')
    if (g.item === 'dessert') {
      set.add('stall')
      set.add('bakery')
      set.add('dairy')
    }
  }
  return set
}

/** Animals a set of goals needs. */
export function neededAnimals(goals: Goal[]) {
  const set = new Set<AnimalId>()
  for (const g of goals) {
    if (g.kind === 'animal') set.add(g.animal)
    if (g.kind !== 'item') continue
    if (g.item === 'egg' || g.item === 'cake' || g.item === 'dessert') set.add('chicken')
    if (g.item === 'duckegg' || g.item === 'saltegg') set.add('duck')
    if (g.item === 'milk' || g.item === 'yogurt' || g.item === 'dessert') set.add('cow')
  }
  return set
}

/** The hand-made first levels of each world, which teach what the world brings. */
function tutorialLevel(base: LevelDef): LevelDef | null {
  const { world, index } = base
  const only = (types: WorkshopId[], built: WorkshopId[] = []) =>
    base.workshops.filter(s => types.includes(s.type)).map(s => ({ ...s, built: built.includes(s.type) }))
  const set = (patch: Partial<LevelDef>): LevelDef => ({ ...base, kind: 'tutorial', ...patch })

  if (world === 0) {
    switch (index) {
      case 0: return set({ goals: [{ kind: 'item', item: 'egg', n: 6 }], startCoins: 0, startAnimals: { chicken: 2 }, workshops: [], shop: [], news: ['chicken'] })
      case 1: return set({ goals: [{ kind: 'animal', animal: 'chicken', n: 4 }, { kind: 'item', item: 'egg', n: 10 }], startCoins: 200, workshops: [], news: ['chicken'] })
      case 2: return set({ goals: [{ kind: 'item', item: 'cake', n: 3 }], startCoins: 240, startAnimals: { chicken: 3 }, workshops: only(['bakery']), news: ['bakery'] })
      case 3: return set({ goals: [{ kind: 'coins', n: 250 }], startCoins: 60, startAnimals: { chicken: 3 }, workshops: only(['bakery'], ['bakery']), news: ['truck'] })
    }
  }
  if (world === 1) {
    switch (index) {
      case 0: return set({ goals: [{ kind: 'item', item: 'duckegg', n: 8 }, { kind: 'animal', animal: 'duck', n: 3 }], startCoins: 300, startAnimals: { chicken: 2, duck: 1 }, workshops: only(['bakery'], ['bakery']), news: ['duck'] })
      case 1: return set({ goals: [{ kind: 'item', item: 'saltegg', n: 4 }], startCoins: 520, startAnimals: { chicken: 2, duck: 2 }, workshops: only(['bakery', 'saltjar'], ['bakery']), news: ['saltjar'] })
    }
  }
  if (world === 2) {
    switch (index) {
      case 0: return set({ goals: [{ kind: 'item', item: 'milk', n: 6 }], startCoins: 700, startAnimals: { chicken: 2, cow: 1 }, workshops: only(['bakery', 'saltjar'], ['bakery', 'saltjar']), monkeys: null, news: ['cow'] })
      case 1: return set({ goals: [{ kind: 'item', item: 'yogurt', n: 3 }], startCoins: 1000, startAnimals: { chicken: 2, cow: 2 }, workshops: only(['bakery', 'saltjar', 'dairy'], ['bakery', 'saltjar']), monkeys: null, news: ['dairy'] })
    }
  }
  if (world === 3 && index === 0) {
    return set({ goals: [{ kind: 'item', item: 'dessert', n: 2 }], startCoins: 1800, startAnimals: { chicken: 3, cow: 2 }, workshops: only(['bakery', 'saltjar', 'dairy', 'stall'], ['bakery', 'dairy']), monkeys: null, news: ['stall'] })
  }
  if (world === 4 && index === 0) {
    return set({ goals: [{ kind: 'item', item: 'egg', n: 20 }, { kind: 'item', item: 'cake', n: 6 }], startCoins: 400, startAnimals: { chicken: 3 }, workshops: only(['bakery', 'saltjar', 'dairy', 'stall'], ['bakery']), monkeys: null, news: ['dry'] })
  }
  if (world === 5 && index === 0) {
    return set({ goals: [{ kind: 'coins', n: 1500 }, { kind: 'item', item: 'saltegg', n: 6 }], startCoins: 900, startAnimals: { chicken: 2, duck: 2 }, workshops: only(['bakery', 'saltjar', 'dairy', 'stall'], ['bakery', 'saltjar']), monkeys: { first: 30, every: 24, hp: 6 }, news: ['festival'] })
  }
  return null
}
