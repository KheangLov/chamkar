import { describe, expect, it } from 'vitest'
import {
  ANIMALS, Engine, ITEMS, LEVELS_PER_WORLD, PEN, SPOTS, STEP, TOTAL_LEVELS, WORKSHOPS, WORLDS,
  getLevel, levelLabel, tileX, tileY,
} from '../../shared/game'
import { autoplay } from './helpers/autoplay'

const run = (e: Engine, seconds: number) => {
  for (let t = 0; t < seconds; t += STEP) e.step(STEP)
}

describe('levels', () => {
  it('has 150 levels in six worlds', () => {
    expect(TOTAL_LEVELS).toBe(150)
    expect(WORLDS).toHaveLength(6)
    expect(LEVELS_PER_WORLD).toBe(25)
    expect(levelLabel(1)).toBe('1-1')
    expect(levelLabel(26)).toBe('2-1')
    expect(levelLabel(150)).toBe('6-25')
  })

  it('is the same every time', () => {
    expect(JSON.stringify(getLevel(77))).toBe(JSON.stringify(getLevel(77)))
  })

  it('only asks for what the world has', () => {
    for (let n = 1; n <= TOTAL_LEVELS; n++) {
      const level = getLevel(n)
      const world = WORLDS[level.world]!
      expect(level.goals.length, `level ${n}`).toBeGreaterThan(0)
      for (const g of level.goals) {
        expect(g.n, `level ${n}`).toBeGreaterThan(0)
        if (g.kind === 'animal') expect(world.animals).toContain(g.animal)
        if (g.kind === 'item') {
          const made = level.workshops.some(s => WORKSHOPS[s.type].output === g.item)
            || world.animals.some(a => ANIMALS[a].product === g.item)
          expect(made, `level ${n} ${g.item}`).toBe(true)
        }
      }
      expect(level.par.silver).toBeGreaterThan(level.par.gold)
    }
  })

  it('ends every world with a festival, with rush levels and a monkey raid', () => {
    for (let w = 0; w < 6; w++) {
      expect(getLevel(w * 25 + 25).kind).toBe('festival')
      expect(getLevel(w * 25 + 10).kind).toBe('rush')
      if (w > 0) expect(getLevel(w * 25 + 15).kind).toBe('raid')
    }
    expect(getLevel(1).monkeys).toBeNull()
    expect(getLevel(28).monkeys).not.toBeNull()
  })
})

describe('engine', () => {
  it('waters grass, and animals lay when fed', () => {
    const e = new Engine(getLevel(1))
    const water = e.water
    expect(e.tap(tileX(0), tileY(0))).toBe('grass')
    expect(e.water).toBe(water - 1)
    expect(e.grass[0]).toBe(3)
    expect(e.grass[1]).toBe(2)
    run(e, 12)
    expect(e.goods.length + e.collected.egg).toBeGreaterThan(0)
  })

  it('collects into the barn until it is full', () => {
    const e = new Engine(getLevel(1))
    run(e, 10)
    const g = e.goods[0]!
    expect(e.tap(g.x, g.y - 14)).toBe('good')
    expect(e.barn.egg).toBe(1)
    expect(e.collected.egg).toBe(1)
    e.barn.egg = e.level.barnCap
    run(e, 8)
    const h = e.goods[0]!
    expect(e.tap(h.x, h.y - 14)).toBe('full')
  })

  it('spoils goods left on the ground', () => {
    const e = new Engine(getLevel(1))
    run(e, 8)
    const count = e.goods.length
    expect(count).toBeGreaterThan(0)
    run(e, ITEMS.egg.life + 1)
    expect(e.goodsLost).toBeGreaterThan(0)
  })

  it('needs water from the well', () => {
    const e = new Engine(getLevel(1))
    while (e.water > 0) e.tap(tileX(1), tileY(1))
    expect(e.tap(tileX(1), tileY(1))).toBe('noWater')
    expect(e.tap(SPOTS.well.x, SPOTS.well.y - 40)).toBe('well')
    run(e, e.level.refill + 0.1)
    expect(e.water).toBe(e.level.water)
  })

  it('builds and runs a workshop', () => {
    const e = new Engine(getLevel(3))
    const w = e.workshops[0]!
    const spot = SPOTS.slots[w.slot]!
    expect(w.built).toBe(false)
    expect(e.tap(w.x, spot.y - 60)).toBe('workshop')
    expect(w.built).toBe(true)
    expect(e.tap(w.x, spot.y - 60)).toBe('noInput')
    e.barn.egg = 2
    expect(e.tap(w.x, spot.y - 60)).toBe('workshop')
    expect(e.tap(w.x, spot.y - 60)).toBe('workshop')
    expect(w.queue).toBe(1)
    run(e, WORKSHOPS.bakery.time * 2 + 0.1)
    expect(e.goods.filter(g => g.item === 'cake')).toHaveLength(2)
  })

  it('sells at the market with the tuk-tuk', () => {
    const e = new Engine(getLevel(4))
    e.barn.cake = 3
    expect(e.loadTruck('cake', 5)).toBe(3)
    expect(e.sendTruck()).toBe(true)
    expect(e.loadTruck('egg')).toBe(0)
    const coins = e.coins
    run(e, e.level.truckTime + 0.1)
    expect(e.coins).toBe(coins + 3 * ITEMS.cake.price)
    expect(e.earned).toBe(3 * ITEMS.cake.price)
  })

  it('buys animals', () => {
    const e = new Engine(getLevel(2))
    expect(e.buy('chicken')).toBe('ok')
    expect(e.buy('chicken')).toBe('ok')
    expect(e.buy('chicken')).toBe('noCoins')
    expect(e.animalCount('chicken')).toBe(4)
  })

  it('chases monkeys off, and they drop what they took', () => {
    const level = getLevel(28)
    const e = new Engine(level)
    while (!e.monkeys.length) e.step(STEP)
    const m = e.monkeys[0]!
    m.x = PEN.x + 300
    m.carry = 'egg'
    for (let i = 0; i < m.max; i++) e.tap(m.x, m.y - 34)
    expect(m.mode).toBe('flee')
    expect(e.goods.some(g => g.item === 'egg')).toBe(true)
  })

  it('never leaves you stuck', () => {
    const e = new Engine({ ...getLevel(5), startAnimals: {}, startCoins: 0 })
    run(e, 5)
    expect(e.animals).toHaveLength(1)
  })
})

describe('the simple player', () => {
  it('wins every level, the first world quickly', () => {
    let three = 0
    for (let n = 1; n <= TOTAL_LEVELS; n++) {
      const r = autoplay(getLevel(n))
      expect(r.won, `level ${n}`).toBe(true)
      if (n <= 4) expect(r.time, `level ${n}`).toBeLessThan(90)
      if (r.stars === 3) three++
    }
    expect(three).toBe(TOTAL_LEVELS)
  }, 120_000)
})
