<script setup lang="ts">
/**
 * One level, from start to finish: the world's story (first time), the briefing, the farm itself
 * with its top bar (coins, the order, the clock) and shop, the market panel, and the result. Going
 * to the next level reuses this page.
 */
import { AnimatePresence, motion } from 'motion-v'
import {
  ANIMALS, Engine, MAX_ANIMALS, TOTAL_LEVELS, WORLDS, getLevel, levelLabel,
  type AnimalId, type GameEvent, type LevelDef, type TapResult,
} from '#shared/game'
import { buzz } from '~/game/audio'
import type GameBoard from '~/components/game/GameBoard.vue'

type Phase = 'loading' | 'storyIntro' | 'briefing' | 'playing' | 'storyOutro' | 'result'

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
const progress = useProgressStore()
const reduced = useReducedMotion()
const audio = useGameAudio()

const phase = ref<Phase>('loading')
/** Whether the farm is on screen (the menus' 3D backdrop rests meanwhile). */
const playing = useState('playing', () => false)
watch(phase, p => (playing.value = p === 'playing' || p === 'result' || p === 'storyOutro'), { immediate: true })
const level = shallowRef<LevelDef>(getLevel(1))
const engine = shallowRef<Engine | null>(null)
const paused = ref(false)
const marketOpen = ref(false)
const settingsOpen = ref(false)
const board = ref<InstanceType<typeof GameBoard> | null>(null)

// Top bar values (updated from the frame loop only when they change).
const hud = reactive({ coins: 0, coinBump: 0, time: 0, goals: [] as { have: number, need: number }[], truckAway: false, truckT: 0, version: 0, animals: 0 })

const n = (value: number) => localNumber(value, locale.value)
const world = computed(() => WORLDS[level.value.world]!)
const label = computed(() => localDigits(levelLabel(level.value.n), locale.value))
const starsNow = computed(() => hud.time <= level.value.par.gold ? 3 : hud.time <= level.value.par.silver ? 2 : 1)
const nextStarAt = computed(() => hud.time <= level.value.par.gold ? level.value.par.gold : hud.time <= level.value.par.silver ? level.value.par.silver : 0)

useHead({ title: () => `${t('app.title')} · ${levelLabel(level.value.n)}` })

/* ------------------------------ Banners and hints ------------------------------ */

interface Banner { id: number, text: string, tone: 'sun' | 'berry' | 'leaf', big: boolean }
const banner = ref<Banner | null>(null)
let bannerTimer: ReturnType<typeof setTimeout> | undefined
let bannerId = 0
function showBanner(text: string, tone: Banner['tone'] = 'sun', ms = 1800, big = true) {
  clearTimeout(bannerTimer)
  banner.value = { id: ++bannerId, text, tone, big }
  bannerTimer = setTimeout(() => (banner.value = null), ms)
}

const hint = ref<string | null>(null)
let hintStep = 0
/** The first levels coach you through the basics, one step at a time. */
function coach(event: 'start' | 'grass' | 'collect' | 'noWater' | 'refill' | 'build' | 'started' | 'truck' | 'buy') {
  const L = level.value.n
  if (L === 1) {
    const steps: [string, string][] = [['start', 'hints.collect'], ['collect', 'hints.water'], ['grass', 'hints.well'], ['refill', '']]
    const step = steps[hintStep]
    if (step && step[0] === event) {
      hint.value = step[1] || null
      hintStep++
    }
    if (event === 'noWater') hint.value = 'hints.well'
    if (event === 'refill' && hint.value === 'hints.well') hint.value = null
  }
  if (L === 2 && event === 'start') hint.value = 'hints.buy'
  if (L === 2 && event === 'buy') hint.value = null
  if (L === 3) {
    if (event === 'start') hint.value = 'hints.build'
    if (event === 'build') hint.value = 'hints.bake'
    if (event === 'started') hint.value = null
  }
  if (L === 4) {
    if (event === 'start') hint.value = 'hints.truck'
    if (event === 'truck') hint.value = null
  }
}

/* ------------------------------ Flow ------------------------------ */

function init() {
  const num = Number(route.params.level)
  if (!Number.isInteger(num) || num < 1 || num > TOTAL_LEVELS) {
    void router.replace('/map')
    return
  }
  progress.load()
  if (!progress.isUnlocked(num)) {
    void router.replace('/map')
    return
  }
  level.value = getLevel(num)
  engine.value = null
  paused.value = false
  marketOpen.value = false
  banner.value = null
  hint.value = null
  const introId = `${world.value.id}-intro`
  phase.value = level.value.index === 0 && !progress.seen.includes(introId) ? 'storyIntro' : 'briefing'
}

function start() {
  const e = new Engine(level.value)
  engine.value = markRaw(e)
  sync(true)
  paused.value = false
  marketOpen.value = false
  phase.value = 'playing'
  hintStep = 0
  hint.value = null
  audio?.unlock()
  audio?.playMusic(level.value.world)
  audio?.duck(false)
  showBanner(t('game.go'), 'leaf', 1200)
  setTimeout(() => phase.value === 'playing' && coach('start'), 900)
}

function restart() {
  paused.value = false
  start()
}

function finish() {
  const e = engine.value
  if (!e) return
  audio?.duck(true)
  marketOpen.value = false
  progress.complete(level.value.n, e.stars, e.finishTime)
  if (level.value.n === TOTAL_LEVELS && !progress.seen.includes(`${world.value.id}-outro`)) {
    phase.value = 'storyOutro'
    return
  }
  phase.value = 'result'
}

function nextLevel() {
  void router.push(`/play/${level.value.n + 1}`)
}

function toLevels() {
  void router.push({ path: '/map' })
}

/* ------------------------------ Playing ------------------------------ */

function haptic(ms: number | number[]) {
  if (progress.settings.haptics) buzz(ms)
}

function onTap(result: TapResult) {
  switch (result) {
    case 'truck':
    case 'barn':
      audio?.ui('page')
      marketOpen.value = true
      break
    case 'busy':
      audio?.ui('tap')
      break
    case 'none':
      break
    default:
      if (result === 'noWater' || result === 'full' || result === 'noCoins' || result === 'noInput') haptic([10, 40, 10])
      else haptic(10)
  }
  hud.version++
}

function buy(type: AnimalId) {
  const e = engine.value
  if (!e || paused.value) return
  const result = e.buy(type)
  board.value?.flush()
  if (result === 'ok') {
    audio?.ui('select')
    haptic(15)
    coach('buy')
  }
  else {
    audio?.ui('nope')
    if (result === 'max') showBanner(t('game.tooMany'), 'berry', 1100, false)
  }
  hud.version++
}

function onEvents(events: GameEvent[]) {
  const e = engine.value!
  audio?.handle(events)
  for (const ev of events) {
    switch (ev.type) {
      case 'noWater':
        showBanner(t('game.noWater'), 'berry', 1200, false)
        coach('noWater')
        break
      case 'full':
        showBanner(t('game.barnFull'), 'berry', 1400, false)
        break
      case 'noCoins':
        showBanner(t('game.noCoins'), 'berry', 1100, false)
        break
      case 'noInput':
        showBanner(t('game.noInput', { name: t(`items.${ev.workshop === 'stall' ? 'cake' : ev.workshop === 'bakery' ? 'egg' : ev.workshop === 'saltjar' ? 'duckegg' : 'milk'}`) }), 'berry', 1300, false)
        break
      case 'grass':
        coach('grass')
        break
      case 'refill':
        coach('refill')
        break
      case 'collect':
        coach('collect')
        break
      case 'build':
        coach('build')
        break
      case 'start':
        coach('started')
        break
      case 'truckGo':
        coach('truck')
        break
      case 'monkeyIn':
        if (!e.monkeysShooed && e.monkeys.length === 1) showBanner(t('game.monkey'), 'berry', 1800, false)
        break
      case 'steal':
        haptic(40)
        break
      case 'monkeyShoo':
        haptic([20, 30, 20])
        break
      case 'buy':
        if (ev.gift) showBanner(t('game.gift'), 'leaf', 2200, false)
        break
      case 'goal':
        showBanner(t('game.goalDone'), 'leaf', 1100, false)
        haptic(30)
        break
      case 'won':
        hint.value = null
        haptic([30, 60, 30, 60, 80])
        setTimeout(finish, 1600)
        break
    }
  }
  hud.version++
}

let lastSecond = -1
function sync(force = false) {
  const e = engine.value
  if (!e) return
  if (e.coins !== hud.coins) {
    if (e.coins > hud.coins && !force) hud.coinBump++
    hud.coins = e.coins
  }
  const sec = Math.floor(e.state === 'won' ? e.finishTime : e.time)
  if (sec !== lastSecond || force) {
    lastSecond = sec
    hud.time = sec
    hud.truckAway = e.truck.state === 'away'
    hud.truckT = Math.ceil(e.truck.t)
    hud.animals = e.animals.length
  }
  const goals = e.level.goals.map(g => e.goalProgress(g))
  if (force || goals.some((g, i) => g.have !== hud.goals[i]?.have)) hud.goals = goals
}
function onFrame() {
  sync()
}

function togglePause() {
  if (phase.value !== 'playing' || engine.value?.state !== 'playing') return
  paused.value = !paused.value
  audio?.ui('tap')
  audio?.duck(paused.value)
}

function onKey(event: KeyboardEvent) {
  if (phase.value !== 'playing' || settingsOpen.value) return
  if (event.key === 'Escape') {
    if (marketOpen.value) marketOpen.value = false
    else togglePause()
    return
  }
  if (event.key === ' ' || event.key === 'p' || event.key === 'P') {
    event.preventDefault()
    togglePause()
    return
  }
  if (paused.value) return
  if (event.key === 'm' || event.key === 'M') marketOpen.value = !marketOpen.value
  const digit = Number(event.key)
  if (digit >= 1 && digit <= level.value.shop.length) buy(level.value.shop[digit - 1]!)
}

function onSettingChange(key: string, value: boolean) {
  if (key === 'music') audio?.setMusic(value, level.value.world)
}

function onVisibility() {
  if (document.hidden && phase.value === 'playing' && !paused.value && engine.value?.state === 'playing') {
    paused.value = true
    audio?.duck(true)
  }
}

watch(() => route.params.level, () => {
  if (route.path.startsWith('/play/')) init()
})

onMounted(() => {
  init()
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  playing.value = false
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('visibilitychange', onVisibility)
  clearTimeout(bannerTimer)
  audio?.stopMusic()
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col overflow-hidden">
    <StoryScene
      v-if="phase === 'storyIntro'"
      :world="world.id"
      part="intro"
      @done="phase = 'briefing'"
    />
    <StoryScene
      v-if="phase === 'storyOutro'"
      :world="world.id"
      part="outro"
      @done="phase = 'result'"
    />

    <div
      v-if="phase === 'briefing'"
      class="flex-1 overflow-y-auto"
    >
      <GameLevelBriefing
        :level="level"
        @start="start"
        @back="toLevels"
      />
    </div>

    <template v-if="engine && (phase === 'playing' || phase === 'result' || phase === 'storyOutro')">
      <!-- Top bar: pause, coins, the order, the clock. -->
      <header class="flex shrink-0 items-center gap-2 px-[calc(0.5rem+var(--safe-left))] pe-[calc(0.5rem+var(--safe-right))] pt-[calc(0.4rem+var(--safe-top))] pb-1 sm:gap-3">
        <button
          type="button"
          class="btn-icon shrink-0"
          :aria-label="t('game.pause')"
          @click="togglePause"
        >
          <UIcon
            name="i-lucide-pause"
            class="size-5"
          />
        </button>
        <div
          class="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border-3 border-[#4e2e14] bg-[#fff7e0] px-2 shadow-[0_3px_0_#2e1a0a]"
          role="status"
          :aria-label="`${t('game.coins')}: ${hud.coins}`"
        >
          <SpriteIcon
            name="coin"
            class="size-7"
          />
          <motion.span
            :key="hud.coinBump"
            :initial="reduced ? false : { scale: 1.35, color: '#e08a00' }"
            :animate="{ scale: 1, color: '#5a3a00' }"
            :transition="{ type: 'spring', stiffness: 500, damping: 18 }"
            class="min-w-10 font-display text-xl leading-none"
          >
            {{ n(hud.coins) }}
          </motion.span>
        </div>
        <ul
          class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]"
          :aria-label="t('briefing.order')"
        >
          <li
            v-for="(goal, i) in level.goals"
            :key="i"
            class="flex h-11 shrink-0 items-center gap-1 rounded-2xl px-1.5 pe-2.5 shadow-[0_3px_0_#2e1a0a] transition-colors"
            :class="(hud.goals[i]?.have ?? 0) >= goal.n ? 'bg-leaf-300 text-leaf-950' : 'bg-[#fff7e0] text-[#4a2e16]'"
          >
            <GameGoalIcon
              :goal="goal"
              class="size-8"
            />
            <span class="font-display text-lg leading-none">
              <template v-if="(hud.goals[i]?.have ?? 0) >= goal.n">
                <UIcon
                  name="i-lucide-check"
                  class="size-5"
                />
              </template>
              <template v-else>{{ n(hud.goals[i]?.have ?? 0) }}/{{ n(goal.n) }}</template>
            </span>
          </li>
        </ul>
        <div
          class="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-moss-950/70 px-2.5 ring-2 ring-moss-600"
          role="timer"
          :aria-label="t('game.time')"
        >
          <StarRow
            :count="starsNow"
            size="size-3.5"
            class="hidden sm:inline-flex landscape:inline-flex"
          />
          <span class="font-display text-lg leading-none text-sun-100">{{ formatTime(hud.time, locale) }}</span>
          <span
            v-if="nextStarAt"
            class="hidden text-xs font-semibold text-moss-300 md:inline"
          >/ {{ formatTime(nextStarAt, locale) }}</span>
        </div>
      </header>

      <main class="relative min-h-0 flex-1 px-[calc(0.5rem+var(--safe-left))] pe-[calc(0.5rem+var(--safe-right))]">
        <GameBoard
          ref="board"
          :engine="engine"
          :paused="paused || phase !== 'playing'"
          :on-tap="onTap"
          :on-events="onEvents"
          :on-frame="onFrame"
        />

        <AnimatePresence>
          <GameMarketPanel
            v-if="marketOpen && phase === 'playing'"
            :engine="engine"
            :version="hud.version"
            @close="marketOpen = false"
            @changed="hud.version++"
          />
        </AnimatePresence>

        <!-- Announcements. -->
        <div
          class="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-live="assertive"
        >
          <AnimatePresence>
            <motion.p
              v-if="banner"
              :key="banner.id"
              :initial="reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0, rotate: -6 }"
              :animate="{ scale: 1, opacity: 1, rotate: 0 }"
              :exit="reduced ? { opacity: 0 } : { scale: 1.3, opacity: 0 }"
              :transition="{ type: 'spring', stiffness: 400, damping: 20 }"
              class="px-4 text-center font-display leading-tight"
              :class="[
                banner.big ? 'text-5xl sm:text-7xl' : 'text-3xl',
                banner.tone === 'berry' ? 'text-[#ffd1dc] [text-shadow:0_4px_0_#7a1030,0_0_30px_rgb(255_77_109/0.7)]'
                : banner.tone === 'leaf' ? 'text-leaf-100 [text-shadow:0_4px_0_#29491c,0_0_30px_rgb(120_204_69/0.7)]'
                  : 'text-sun-100 [text-shadow:0_4px_0_#7a340d,0_0_30px_rgb(255_190_31/0.7)]',
              ]"
            >
              {{ banner.text }}
            </motion.p>
          </AnimatePresence>
        </div>

        <!-- Coaching on the first levels. -->
        <AnimatePresence>
          <motion.div
            v-if="hint && phase === 'playing' && !marketOpen"
            :key="hint"
            :initial="reduced ? false : { y: 30, opacity: 0 }"
            :animate="{ y: 0, opacity: 1 }"
            :exit="{ y: 30, opacity: 0 }"
            class="pointer-events-none absolute inset-x-0 bottom-3 mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-2xl bg-sun-300 px-4 py-2 font-semibold text-sun-950 shadow-xl"
            role="status"
          >
            <UIcon
              name="i-lucide-hand"
              class="size-5 shrink-0"
            />
            {{ t(hint) }}
          </motion.div>
        </AnimatePresence>
      </main>

      <!-- The shop: animals to buy, and the market. -->
      <footer class="flex shrink-0 items-center gap-2 px-[calc(0.5rem+var(--safe-left))] pe-[calc(0.5rem+var(--safe-right))] pt-1.5 pb-[calc(0.4rem+var(--safe-bottom))]">
        <div
          class="-my-1 flex min-w-0 items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none]"
          role="toolbar"
          :aria-label="t('game.shop')"
        >
          <button
            v-for="(type, i) in level.shop"
            :key="type"
            type="button"
            class="shop-card"
            :data-poor="hud.coins < ANIMALS[type].cost || hud.animals >= MAX_ANIMALS"
            :aria-label="t('game.buy', { name: t(`animals.${type}`), n: n(ANIMALS[type].cost) })"
            :aria-keyshortcuts="String(i + 1)"
            @click="buy(type)"
          >
            <SpriteIcon
              :name="type"
              class="size-9"
            />
            <span class="flex items-center gap-0.5 font-display text-lg leading-none">
              <SpriteIcon
                name="coin"
                class="size-4"
              />{{ n(ANIMALS[type].cost) }}
            </span>
          </button>
        </div>
        <span class="ms-auto hidden text-sm font-semibold text-moss-300 sm:inline">{{ t(`worlds.${world.id}.name`) }} · {{ label }}</span>
        <button
          type="button"
          class="shop-card market ms-auto shrink-0 sm:ms-0"
          :aria-label="t('market.title')"
          aria-keyshortcuts="M"
          @click="marketOpen = !marketOpen"
        >
          <SpriteIcon
            name="truck"
            class="size-10"
          />
          <span
            v-if="hud.truckAway"
            class="font-display text-lg leading-none"
          >{{ n(hud.truckT) }}</span>
          <span
            v-else
            class="font-display text-lg leading-none"
          >{{ t('market.short') }}</span>
        </button>
      </footer>

      <!-- Pause menu. -->
      <AnimatePresence>
        <motion.div
          v-if="paused && phase === 'playing'"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
          class="fixed inset-0 z-40 flex items-center justify-center bg-moss-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          :aria-label="t('pause.title')"
        >
          <motion.div
            :initial="reduced ? false : { scale: 0.85, y: 20 }"
            :animate="{ scale: 1, y: 0 }"
            :transition="{ type: 'spring', stiffness: 300, damping: 22 }"
            class="glass flex w-full max-w-xs flex-col gap-3 p-6 text-center"
          >
            <h2 class="text-glow font-display text-4xl">
              {{ t('pause.title') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t(`worlds.${world.id}.name`) }} · {{ label }}
            </p>
            <button
              type="button"
              class="btn-game"
              @click="togglePause"
            >
              <UIcon
                name="i-lucide-play"
                class="size-5"
              />
              {{ t('pause.resume') }}
            </button>
            <button
              type="button"
              class="btn-game ghost"
              @click="restart"
            >
              <UIcon
                name="i-lucide-rotate-ccw"
                class="size-5"
              />
              {{ t('pause.restart') }}
            </button>
            <div class="flex gap-3">
              <button
                type="button"
                class="btn-game ghost flex-1"
                @click="toLevels"
              >
                <UIcon
                  name="i-lucide-map"
                  class="size-5"
                />
                {{ t('pause.quit') }}
              </button>
              <button
                type="button"
                class="btn-game ghost"
                :aria-label="t('settings.title')"
                @click="settingsOpen = true"
              >
                <UIcon
                  name="i-lucide-settings"
                  class="size-5"
                />
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <GameResultSheet
        v-if="phase === 'result'"
        :engine="engine"
        @next="nextLevel"
        @replay="restart"
        @levels="toLevels"
      />
    </template>

    <SettingsModal
      v-model:open="settingsOpen"
      @change="onSettingChange"
    />
  </div>
</template>
