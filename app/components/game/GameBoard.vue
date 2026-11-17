<script setup lang="ts">
/**
 * The board: the 3D farm filling the space it's given, the game loop, and touch/mouse input. The
 * loop steps the engine at a fixed 60 steps a second, however fast the screen refreshes, and draws
 * once per screen frame. Taps are turned into board points by the view (app/game/three/farm.ts).
 */
import { STEP, type Engine, type GameEvent, type TapResult } from '#shared/game'
import { FarmView, ICON_MODELS, type Hover } from '~/game/three/farm'
import { ensureIcons } from '~/game/three/icons'

const props = defineProps<{
  engine: Engine
  paused: boolean
  /** What a tap on the board did. */
  onTap: (result: TapResult) => void
  /** Things that happened in the game since the last frame. */
  onEvents: (events: GameEvent[]) => void
  /** Every frame, after the game moved on (to update the top bar without Vue). */
  onFrame?: () => void
}>()

const { locale, t } = useI18n()
const progress = useProgressStore()
const wrap = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const overlay = ref<HTMLElement | null>(null)
const reduced = useReducedMotion()
const failed = ref(false)
let view: FarmView | null = null
let raf = 0
let last = 0
let acc = 0
let hover: Hover | null = null

watch(() => props.paused, () => {
  last = performance.now()
})
watch(reduced, (r) => {
  if (view) view.reducedMotion = r
})

function fit() {
  const el = wrap.value
  if (!el || !view) return
  const box = el.getBoundingClientRect()
  view.resize(Math.max(1, Math.floor(box.width)), Math.max(1, Math.floor(box.height)), window.devicePixelRatio || 1)
}

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  let dt = (now - last) / 1000
  last = now
  if (dt > 0.25) dt = 0.25
  const engine = props.engine
  if (!view) return
  if (!props.paused) {
    acc += dt
    let steps = 0
    while (acc >= STEP && steps < 12) {
      engine.step(STEP)
      acc -= STEP
      steps++
    }
    if (steps === 12) acc = 0
    flush()
    view.update(dt)
  }
  props.onFrame?.()
  view.render(engine, hover)
}

function flush() {
  const events = props.engine.drainEvents()
  if (events.length) {
    view?.handle(events)
    props.onEvents(events)
  }
}

function local(e: { clientX: number, clientY: number }) {
  const rect = canvas.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function onPointerDown(e: PointerEvent) {
  if (!view || props.paused || props.engine.state !== 'playing') return
  const p = local(e)
  const at = view.pick(props.engine, p.x, p.y, e.pointerType !== 'mouse')
  const result = at ? props.engine.tap(at.x, at.y, 30) : 'none'
  flush()
  props.onTap(result)
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || !view) return
  const p = local(e)
  hover = view.hoverAt(p.x, p.y)
}

function onPointerLeave() {
  hover = null
}

let observer: ResizeObserver | null = null
onMounted(() => {
  try {
    view = new FarmView(canvas.value!, overlay.value!, props.engine.level, n => localNumber(n, locale.value), progress.settings.hd ? 'high' : 'low')
  }
  catch {
    failed.value = true
    return
  }
  view.reducedMotion = reduced.value
  void ensureIcons(ICON_MODELS)
  observer = new ResizeObserver(fit)
  observer.observe(wrap.value!)
  fit()
  last = performance.now()
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
  view?.dispose()
  view = null
})

defineExpose({ flush })
</script>

<template>
  <div
    ref="wrap"
    class="relative size-full overflow-hidden rounded-xl shadow-[0_10px_40px_rgb(0_0_0/0.45)]"
  >
    <canvas
      ref="canvas"
      class="block size-full touch-none"
      role="img"
      :aria-label="t('game.board')"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
    />
    <div
      ref="overlay"
      class="farm-overlay pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    />
    <p
      v-if="failed"
      class="absolute inset-0 flex items-center justify-center p-6 text-center text-moss-100"
    >
      {{ t('game.noWebgl') }}
    </p>
  </div>
</template>
