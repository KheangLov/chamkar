<script setup lang="ts">
/**
 * The board: a canvas that fills the space it's given at the board's shape, the game loop, and
 * touch/mouse input. The loop steps the engine at a fixed 60 steps a second, however fast the screen
 * refreshes, and draws once per screen frame.
 */
import { BOARD, STEP, tileAt, type Engine, type GameEvent, type TapResult } from '#shared/game'
import { Renderer, type BoardUi } from '~/game/renderer'

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
const wrap = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const reduced = useReducedMotion()
let renderer: Renderer | null = null
let raf = 0
let last = 0
let acc = 0
let dirty = true
const ui: BoardUi = { hover: null }
const size = reactive({ w: 0, h: 0 })

watch(() => props.paused, () => {
  last = performance.now()
  dirty = true
})
watch(reduced, (r) => {
  if (renderer) renderer.reducedMotion = r
})

function fit() {
  const el = wrap.value
  if (!el || !canvas.value || !renderer) return
  const box = el.getBoundingClientRect()
  const w = Math.max(1, Math.min(box.width, (box.height * BOARD.width) / BOARD.height))
  const h = (w * BOARD.height) / BOARD.width
  size.w = Math.floor(w)
  size.h = Math.floor(h)
  renderer.resize(size.w, size.h, window.devicePixelRatio || 1)
  dirty = true
}

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  let dt = (now - last) / 1000
  last = now
  if (dt > 0.25) dt = 0.25
  const engine = props.engine
  if (!props.paused && renderer) {
    acc += dt
    let steps = 0
    while (acc >= STEP && steps < 12) {
      engine.step(STEP)
      acc -= STEP
      steps++
    }
    if (steps === 12) acc = 0
    flush()
    renderer.update(dt)
    dirty = true
  }
  props.onFrame?.()
  if (dirty && renderer) {
    renderer.render(engine, ui)
    dirty = !props.paused
  }
}

function flush() {
  const events = props.engine.drainEvents()
  if (events.length) {
    renderer?.handle(events)
    props.onEvents(events)
  }
}

function toBoard(e: { clientX: number, clientY: number }) {
  const rect = canvas.value!.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) / rect.width) * BOARD.width,
    y: ((e.clientY - rect.top) / rect.height) * BOARD.height,
  }
}

function onPointerDown(e: PointerEvent) {
  if (props.paused || props.engine.state !== 'playing') return
  const p = toBoard(e)
  const result = props.engine.tap(p.x, p.y, e.pointerType === 'mouse' ? 44 : 58)
  flush()
  props.onTap(result)
  dirty = true
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  const p = toBoard(e)
  const tile = tileAt(p.x, p.y)
  ui.hover = tile && !props.engine.goodAt(p.x, p.y, 44) ? tile : null
  dirty = true
}

function onPointerLeave() {
  ui.hover = null
  dirty = true
}

let observer: ResizeObserver | null = null
onMounted(() => {
  renderer = new Renderer(canvas.value!, props.engine.level, n => localNumber(n, locale.value))
  renderer.reducedMotion = reduced.value
  observer = new ResizeObserver(fit)
  observer.observe(wrap.value!)
  fit()
  last = performance.now()
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
})

defineExpose({ flush, redraw: () => (dirty = true) })
</script>

<template>
  <div
    ref="wrap"
    class="relative flex size-full items-center justify-center"
  >
    <canvas
      ref="canvas"
      class="block touch-none rounded-xl shadow-[0_10px_40px_rgb(0_0_0/0.45)]"
      :style="{ width: `${size.w}px`, height: `${size.h}px` }"
      role="img"
      :aria-label="t('game.board')"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
    />
  </div>
</template>
