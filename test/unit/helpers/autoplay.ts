/**
 * A simple player, for tests and for the star times (shared/game/par.ts). It plays at a human pace:
 * a couple of taps every third of a second, never two things at once beyond that. It chases monkeys,
 * picks up goods before they spoil, waters grass for hungry animals, builds and runs the workshops the
 * goals need, buys animals, and sends the tuk-tuk to market with what isn't needed.
 */
import {
  ANIMALS, ANIMAL_ORDER, Engine, ITEMS, ITEM_ORDER, PEN, STEP, SPOTS, WORKSHOPS,
  neededAnimals, neededWorkshops, tileX, tileY,
  type AnimalId, type ItemId, type LevelDef, type WorkshopId,
} from '../../../shared/game'

const TICK = 0.33
const TAPS_PER_TICK = 2

export interface PlayResult { won: boolean, time: number, stars: number, engine: Engine }

export function autoplay(level: LevelDef, limit = 900): PlayResult {
  const e = new Engine(level)
  const wantWorkshops = neededWorkshops(level.goals)
  const wantAnimals = neededAnimals(level.goals)
  let next = 0
  while (e.state === 'playing' && e.time < limit) {
    e.step(STEP)
    e.drainEvents()
    if (e.time < next) continue
    next = e.time + TICK
    think(e, wantWorkshops, wantAnimals)
  }
  return { won: e.state === 'won', time: e.time, stars: e.stars, engine: e }
}

/** How many more of an item the goals still need made (including as an ingredient). */
function remaining(e: Engine, item: ItemId): number {
  let n = 0
  for (const g of e.level.goals) {
    if (g.kind === 'item' && g.item === item) n += Math.max(0, g.n - e.collected[item])
  }
  for (const [id, def] of Object.entries(WORKSHOPS) as [WorkshopId, (typeof WORKSHOPS)[WorkshopId]][]) {
    if (!def.inputs.includes(item)) continue
    const out = remaining(e, def.output)
    if (out > 0 && e.workshops.some(w => w.type === id)) n += out
  }
  return n
}

function think(e: Engine, wantWorkshops: Set<WorkshopId>, wantAnimals: Set<AnimalId>) {
  let taps = TAPS_PER_TICK
  const tap = (x: number, y: number) => {
    taps--
    return e.tap(x, y, 40)
  }

  // Monkeys.
  for (const m of e.monkeys) {
    if (taps <= 0) return
    if (m.mode !== 'flee' && m.x < PEN.x + PEN.cols * PEN.cell + 20) tap(m.x, m.y - 34)
  }

  // Goods, the ones about to spoil first.
  const goods = [...e.goods].sort((a, b) => (b.age / b.life) - (a.age / a.life))
  for (const g of goods) {
    if (taps <= 0) return
    if (e.barnUsed >= e.level.barnCap) break
    tap(g.x, g.y - 14)
  }

  // Water: grass for the hungry.
  if (e.water === 0 && !e.refilling && taps > 0) {
    tap(SPOTS.well.x, SPOTS.well.y - 40)
  }
  let bites = 0
  for (const v of e.grass) bites += v
  const hungry = e.animals.filter(a => a.food < 0.45)
  if (hungry.length && bites < e.animals.length * 1.2 && e.water > 0 && taps > 0) {
    const a = hungry[0]!
    const c = Math.max(0, Math.min(PEN.cols - 1, Math.floor((a.x - PEN.x) / PEN.cell)))
    const r = Math.max(0, Math.min(PEN.rows - 1, Math.floor((a.y - PEN.y) / PEN.cell)))
    tap(tileX(c), tileY(r))
  }
  if (taps <= 0) return

  // Builds the goals need.
  let reserve = 0
  for (const w of e.workshops) {
    if (w.built || !wantWorkshops.has(w.type)) continue
    const cost = WORKSHOPS[w.type].build
    if (e.coins >= cost && taps > 0) {
      tap(w.x, SPOTS.slots[w.slot]!.y - 60)
    }
    else reserve += cost
  }

  // Run the workshops.
  for (const w of e.workshops) {
    if (taps <= 0) return
    if (!w.built || !e.canStart(w)) continue
    if (remaining(e, WORKSHOPS[w.type].output) <= w.queue + (w.busy > 0 ? 1 : 0)) continue
    tap(w.x, SPOTS.slots[w.slot]!.y - 60)
  }

  // Animals.
  for (const type of ANIMAL_ORDER) {
    if (!e.level.shop.includes(type)) continue
    let target = 0
    if (wantAnimals.has(type)) target = type === 'cow' ? 3 : 4
    for (const g of e.level.goals) if (g.kind === 'animal' && g.animal === type) target = Math.max(target, g.n)
    if (type === 'chicken' && target === 0 && e.level.goals.some(g => g.kind === 'coins')) target = 3
    if (e.animalCount(type) < target && e.coins >= ANIMALS[type].cost + reserve) {
      e.buy(type)
      return
    }
  }

  // The tuk-tuk.
  if (e.truck.state === 'home') {
    for (const id of ITEM_ORDER) {
      const keep = Math.min(3, remaining(e, id) > 0 && isInput(id) ? remaining(e, id) : 0)
      const spare = e.barn[id] - keep
      if (spare > 0) e.loadTruck(id, spare)
    }
    const coinsGoal = e.level.goals.some(g => g.kind === 'coins' && e.earned < g.n)
    const needCoins = reserve > e.coins || coinsGoal
    const full = e.truckLoad >= e.level.truckCap || e.barnUsed >= e.level.barnCap - 1
    if (e.truckLoad > 0 && (full || e.truckValue >= 160 || (needCoins && e.truckValue >= 60) || e.truckValue >= ITEMS.cake.price * 2)) e.sendTruck()
  }
}

function isInput(item: ItemId) {
  return Object.values(WORKSHOPS).some(w => w.inputs.includes(item))
}
