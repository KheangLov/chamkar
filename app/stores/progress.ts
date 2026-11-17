import { defineStore } from 'pinia'
import { LEVELS_PER_WORLD, TOTAL_LEVELS } from '#shared/game'

/** Where progress and settings are kept (this device only; nothing is sent anywhere). */
export const STORAGE_KEY = 'chamkar:v1'

export interface Settings {
  sound: boolean
  music: boolean
  haptics: boolean
}

interface Saved {
  /** Best stars per level (index = level number; 0 = not cleared). */
  stars: number[]
  /** Best time per level, in seconds (index = level number; 0 = not cleared). */
  best: number[]
  /** Story scenes already seen, e.g. 'village-intro'. */
  seen: string[]
  settings: Settings
}

const DEFAULT_SETTINGS: Settings = { sound: true, music: true, haptics: true }

export const useProgressStore = defineStore('progress', () => {
  const loaded = ref(false)
  const stars = ref<number[]>(Array(TOTAL_LEVELS + 1).fill(0))
  const seen = ref<string[]>([])
  const best = ref<number[]>(Array(TOTAL_LEVELS + 1).fill(0))
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })

  /** The furthest level you can play: one past the furthest cleared. */
  const unlocked = computed(() => {
    let n = 1
    while (n <= TOTAL_LEVELS && stars.value[n]! > 0) n++
    return Math.min(n, TOTAL_LEVELS)
  })
  const cleared = computed(() => stars.value.filter(s => s > 0).length)
  const totalStars = computed(() => stars.value.reduce((a, b) => a + b, 0))
  const allDone = computed(() => cleared.value >= TOTAL_LEVELS)

  function worldStars(world: number) {
    let sum = 0
    for (let n = world * LEVELS_PER_WORLD + 1; n <= (world + 1) * LEVELS_PER_WORLD; n++) sum += stars.value[n]!
    return sum
  }
  function isUnlocked(n: number) {
    return n >= 1 && n <= unlocked.value
  }

  function load() {
    if (loaded.value || !import.meta.client) return
    loaded.value = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<Saved>
      if (Array.isArray(saved.stars)) {
        stars.value = Array.from({ length: TOTAL_LEVELS + 1 }, (_, i) => Math.max(0, Math.min(3, Number(saved.stars![i]) || 0)))
      }
      if (Array.isArray(saved.seen)) seen.value = saved.seen.filter(s => typeof s === 'string')
      if (Array.isArray(saved.best)) {
        best.value = Array.from({ length: TOTAL_LEVELS + 1 }, (_, i) => Math.max(0, Number(saved.best![i]) || 0))
      }
      if (saved.settings && typeof saved.settings === 'object') settings.value = { ...DEFAULT_SETTINGS, ...saved.settings }
    }
    catch {
      // Unreadable or blocked storage: start fresh.
    }
  }

  function save() {
    if (!import.meta.client) return
    try {
      const data: Saved = { stars: stars.value, best: best.value, seen: seen.value, settings: settings.value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }
    catch {
      // Storage full or blocked: progress lasts for this visit only.
    }
  }

  /** Records a cleared level. Returns whether it was the first time. */
  function complete(n: number, got: number, time: number) {
    const first = stars.value[n] === 0
    if (got > stars.value[n]!) stars.value[n] = got
    if (!best.value[n] || time < best.value[n]!) best.value[n] = Math.ceil(time)
    save()
    return first
  }

  function markSeen(id: string) {
    if (!seen.value.includes(id)) {
      seen.value.push(id)
      save()
    }
  }

  function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings.value[key] = value
    save()
  }

  function reset() {
    stars.value = Array(TOTAL_LEVELS + 1).fill(0)
    seen.value = []
    best.value = Array(TOTAL_LEVELS + 1).fill(0)
    save()
  }

  return { loaded, stars, best, seen, settings, unlocked, cleared, totalStars, allDone, worldStars, isUnlocked, load, save, complete, markSeen, setSetting, reset }
})
