<script setup lang="ts">
/**
 * The menus' background: a little 3D farm turning slowly, its animals pottering about. It uses the
 * game's own engine and view (with a made-up level that never ends), and stops whenever a level is
 * being played, so only one 3D scene ever runs at a time. Without WebGL, the plain backdrop shows.
 */
import { Engine, PEN, STEP, getLevel, type LevelDef } from '#shared/game'
import { FarmView } from '~/game/three/farm'

const props = defineProps<{ world: number }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const overlay = ref<HTMLElement | null>(null)
const progress = useProgressStore()
const reduced = useReducedMotion()
const ready = ref(false)
let view: FarmView | null = null
let engine: Engine | null = null
let raf = 0
let last = 0
let acc = 0
let yaw = -0.5
let tidy = 0

function scene(world: number): LevelDef {
  const base = getLevel(world * 25 + 5)
  return {
    ...base,
    goals: [{ kind: 'coins', n: 1e12 }],
    startAnimals: { chicken: 5, duck: world >= 1 ? 3 : 0, cow: world >= 2 ? 2 : 0 },
    workshops: base.workshops.map(s => ({ ...s, built: true })),
    monkeys: null,
  }
}

function start() {
  stop()
  try {
    engine = new Engine(scene(props.world))
    engine.grass.fill(3)
    view = new FarmView(canvas.value!, overlay.value!, engine.level, String, progress.settings.hd ? 'high' : 'low', { scenic: true })
  }
  catch {
    view = null
    return
  }
  ready.value = true
  fit()
  last = performance.now()
  raf = requestAnimationFrame(frame)
}

function stop() {
  cancelAnimationFrame(raf)
  view?.dispose()
  view = null
  ready.value = false
}

function fit() {
  if (!view) return
  view.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
}

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  if (!view || !engine || document.hidden) return
  let dt = (now - last) / 1000
  last = now
  if (dt > 0.1) dt = 0.1
  acc += dt
  while (acc >= STEP) {
    engine.step(STEP)
    acc -= STEP
  }
  view.handle(engine.drainEvents())
  // Keep the farm tidy: goods go to the barn, eaten grass grows back.
  tidy += dt
  if (tidy > 1.5) {
    tidy = 0
    for (const g of [...engine.goods]) if (g.age > 2.5) engine.goods.splice(engine.goods.indexOf(g), 1)
    const i = Math.floor(Math.random() * PEN.rows * PEN.cols)
    engine.grass[i] = 3
  }
  if (!reduced.value) {
    yaw += dt * 0.035
    view.orbit(Math.sin(yaw) * 0.6)
  }
  view.update(dt)
  view.render(engine, null)
}

watch(() => props.world, () => {
  if (view) start()
})
onMounted(() => {
  start()
  window.addEventListener('resize', fit)
})
onBeforeUnmount(() => {
  stop()
  window.removeEventListener('resize', fit)
})
</script>

<template>
  <div
    class="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-700"
    :class="ready ? 'opacity-100' : 'opacity-0'"
    aria-hidden="true"
  >
    <canvas
      ref="canvas"
      class="block size-full"
    />
    <div
      ref="overlay"
      class="hidden"
    />
    <!-- Darkened towards the middle, where the menus are, so text stays easy to read. -->
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(7_20_13/0.72),rgb(7_20_13/0.35)_70%,rgb(7_20_13/0.2))]" />
  </div>
</template>
