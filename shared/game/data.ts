/**
 * What's on the farm: the goods, the animals that lay or give them, the workshops that turn them into
 * something worth more, and where everything sits on the board. All the tuning numbers live here.
 */

export const STEP = 1 / 60

/** The board, in board units (the canvas scales it to the screen). */
export const BOARD = { width: 1280, height: 720 }

/** The pen: grass grows on its tiles, animals walk in it, goods fall in it. */
export const PEN = { x: 300, y: 196, cols: 10, rows: 5, cell: 80 }
export const PEN_RIGHT = PEN.x + PEN.cols * PEN.cell
export const PEN_BOTTOM = PEN.y + PEN.rows * PEN.cell

/** Where the buildings stand (bottom centre of each). */
export const SPOTS = {
  well: { x: 150, y: 400, w: 150, h: 170 },
  barn: { x: 150, y: 690, w: 220, h: 210 },
  truck: { x: 1150, y: 694, w: 210, h: 150 },
  /** Workshops, left to right, along the top of the pen. */
  slots: [420, 620, 820, 1020].map(x => ({ x, y: 184, w: 176, h: 160 })),
}

export type ItemId = 'egg' | 'duckegg' | 'milk' | 'cake' | 'saltegg' | 'yogurt' | 'dessert'
export type AnimalId = 'chicken' | 'duck' | 'cow'
export type WorkshopId = 'bakery' | 'saltjar' | 'dairy' | 'stall'

export interface ItemDef {
  /** Coins it fetches at the market. */
  price: number
  /** Seconds it lies on the ground before it spoils. */
  life: number
}

export const ITEMS: Record<ItemId, ItemDef> = {
  egg: { price: 10, life: 14 },
  duckegg: { price: 18, life: 14 },
  milk: { price: 32, life: 14 },
  cake: { price: 45, life: 18 },
  saltegg: { price: 70, life: 18 },
  yogurt: { price: 110, life: 18 },
  dessert: { price: 300, life: 20 },
}
export const ITEM_ORDER: ItemId[] = ['egg', 'duckegg', 'milk', 'cake', 'saltegg', 'yogurt', 'dessert']

export interface AnimalDef {
  cost: number
  product: ItemId
  /** Seconds between two goods, while fed. */
  period: number
  /** Seconds a full belly lasts. */
  belly: number
  /** Board units a second. */
  speed: number
  /** Seconds to eat one tile's bite of grass. */
  eat: number
}

export const ANIMALS: Record<AnimalId, AnimalDef> = {
  chicken: { cost: 100, product: 'egg', period: 7, belly: 13, speed: 70, eat: 1.2 },
  duck: { cost: 260, product: 'duckegg', period: 9, belly: 15, speed: 62, eat: 1.3 },
  cow: { cost: 650, product: 'milk', period: 12, belly: 18, speed: 46, eat: 1.6 },
}
export const ANIMAL_ORDER: AnimalId[] = ['chicken', 'duck', 'cow']
export const MAX_ANIMALS = 14

export interface WorkshopDef {
  build: number
  inputs: ItemId[]
  output: ItemId
  /** Seconds to make one. */
  time: number
}

export const WORKSHOPS: Record<WorkshopId, WorkshopDef> = {
  bakery: { build: 220, inputs: ['egg'], output: 'cake', time: 5 },
  saltjar: { build: 480, inputs: ['duckegg'], output: 'saltegg', time: 7 },
  dairy: { build: 950, inputs: ['milk'], output: 'yogurt', time: 8 },
  stall: { build: 1700, inputs: ['cake', 'yogurt'], output: 'dessert', time: 10 },
}
export const WORKSHOP_ORDER: WorkshopId[] = ['bakery', 'saltjar', 'dairy', 'stall']

/** Which animal or workshop makes an item. */
export const MAKER: Record<ItemId, { animal?: AnimalId, workshop?: WorkshopId }> = {
  egg: { animal: 'chicken' },
  duckegg: { animal: 'duck' },
  milk: { animal: 'cow' },
  cake: { workshop: 'bakery' },
  saltegg: { workshop: 'saltjar' },
  yogurt: { workshop: 'dairy' },
  dessert: { workshop: 'stall' },
}

/** Grass a tile can hold (bites), and what one watering gives. */
export const GRASS_MAX = 3

/** Monkeys: board units a second when sneaking in and when running off. */
export const MONKEY = { speed: 78, flee: 260, stay: 26 }

/** The tuk-tuk to the market. */
export const TRUCK = { drive: 1.6 }

export const LEVELS_PER_WORLD = 25

/** Board centre of a pen tile. */
export function tileX(c: number) {
  return PEN.x + (c + 0.5) * PEN.cell
}
export function tileY(r: number) {
  return PEN.y + (r + 0.5) * PEN.cell
}
export function tileAt(x: number, y: number): { r: number, c: number } | null {
  const c = Math.floor((x - PEN.x) / PEN.cell)
  const r = Math.floor((y - PEN.y) / PEN.cell)
  if (c < 0 || c >= PEN.cols || r < 0 || r >= PEN.rows) return null
  return { r, c }
}

/** Whether a point is inside a building's box (anchored at its bottom centre). */
export function inSpot(spot: { x: number, y: number, w: number, h: number }, x: number, y: number, pad = 0) {
  return x >= spot.x - spot.w / 2 - pad && x <= spot.x + spot.w / 2 + pad && y >= spot.y - spot.h - pad && y <= spot.y + pad
}
