<script setup lang="ts">
/** Before a level: the order to fill, what's new, and the times for the stars. */
import { motion } from 'motion-v'
import { ANIMALS, WORKSHOPS, WORLDS, levelLabel, type LevelDef, type SpriteName } from '#shared/game'

const props = defineProps<{ level: LevelDef }>()
const emit = defineEmits<{ start: [], back: [] }>()
const { locale, t } = useI18n()
const progress = useProgressStore()
const reduced = useReducedMotion()

const n = (value: number) => localNumber(value, locale.value)
const world = computed(() => WORLDS[props.level.world]!)
const label = computed(() => localDigits(levelLabel(props.level.n), locale.value))
const best = computed(() => progress.stars[props.level.n] ?? 0)
const time = (s: number) => formatTime(s, locale.value)

const kind = computed(() => {
  switch (props.level.kind) {
    case 'festival': return { key: 'festival', icon: 'i-lucide-party-popper' }
    case 'rush': return { key: 'rush', icon: 'i-lucide-zap' }
    case 'raid': return { key: 'raid', icon: 'i-lucide-alert-triangle' }
    default: return null
  }
})

const news = computed(() => props.level.news.map((key) => {
  let sprite: SpriteName = 'srey'
  let cost: number | null = null
  if (key === 'chicken' || key === 'duck' || key === 'cow') {
    sprite = key
    cost = ANIMALS[key].cost
  }
  else if (key in WORKSHOPS) {
    sprite = key as SpriteName
    cost = WORKSHOPS[key as keyof typeof WORKSHOPS].build
  }
  else if (key === 'monkey') sprite = 'monkey'
  else if (key === 'truck') sprite = 'truck'
  else if (key === 'dry') sprite = 'palm'
  else if (key === 'festival') sprite = 'stall'
  return { key, sprite, cost }
}))

function goalLabel(g: LevelDef['goals'][number]) {
  if (g.kind === 'item') return t('goals.item', { n: n(g.n), name: t(`items.${g.item}`) })
  if (g.kind === 'animal') return t('goals.animal', { n: n(g.n), name: t(`animals.${g.animal}`) })
  return t('goals.coins', { n: n(g.n) })
}

const pop = (delay: number) => reduced.value
  ? {}
  : { initial: { opacity: 0, y: 16, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { type: 'spring' as const, stiffness: 240, damping: 20, delay } }
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-3 p-[calc(0.75rem+var(--safe-top))_calc(1rem+var(--safe-right))_calc(1rem+var(--safe-bottom))_calc(1rem+var(--safe-left))]">
    <motion.header
      v-bind="pop(0)"
      class="flex items-center gap-3"
    >
      <button
        type="button"
        class="btn-icon"
        :aria-label="t('map.back')"
        @click="emit('back')"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-5"
        />
      </button>
      <div class="me-auto">
        <p class="text-xs font-semibold text-moss-300">
          {{ t(`worlds.${world.id}.name`) }}
        </p>
        <h1 class="text-glow font-display text-3xl leading-tight">
          {{ t('map.level', { label }) }}
        </h1>
      </div>
      <StarRow
        :count="best"
        size="size-5"
        :label="t('map.stars', { n: n(best) })"
      />
    </motion.header>

    <div class="grid gap-3 sm:grid-cols-2 landscape:grid-cols-2">
      <motion.section
        v-bind="pop(0.05)"
        class="glass flex flex-col gap-3 p-4"
      >
        <div class="flex items-center gap-2">
          <h2 class="me-auto font-display text-xl text-sun-100">
            {{ t('briefing.order') }}
          </h2>
          <span
            v-if="kind"
            class="chip text-sun-200"
          >
            <UIcon
              :name="kind.icon"
              class="size-4"
            />
            {{ t(`kinds.${kind.key}`) }}
          </span>
        </div>
        <ul class="flex flex-col gap-2">
          <li
            v-for="(goal, i) in props.level.goals"
            :key="i"
            class="flex items-center gap-3 rounded-xl bg-[#fff7e0] p-2 text-[#4a2e16] shadow-[0_3px_0_#2e1a0a]"
          >
            <GameGoalIcon
              :goal="goal"
              class="size-10 shrink-0"
            />
            <span class="font-semibold leading-tight">{{ goalLabel(goal) }}</span>
          </li>
        </ul>
        <div class="flex flex-wrap gap-2 text-sm">
          <span class="chip text-sun-200">
            <StarRow
              :count="3"
              size="size-3.5"
            />
            {{ time(props.level.par.gold) }}
          </span>
          <span class="chip text-moss-200">
            <StarRow
              :count="2"
              size="size-3.5"
            />
            {{ time(props.level.par.silver) }}
          </span>
        </div>
      </motion.section>

      <motion.section
        v-bind="pop(0.1)"
        class="glass flex flex-col gap-3 p-4"
      >
        <template v-if="news.length">
          <h2 class="font-display text-xl text-leaf-200">
            {{ t('briefing.new') }}
          </h2>
          <div
            v-for="item in news"
            :key="item.key"
            class="flex items-start gap-3"
          >
            <SpriteIcon
              :name="item.sprite"
              class="size-16 shrink-0"
            />
            <div class="flex flex-col gap-1">
              <p class="font-display text-lg leading-tight text-sun-100">
                {{ t(`news.${item.key}.name`) }}
              </p>
              <p class="text-sm leading-relaxed text-moss-100">
                {{ t(`news.${item.key}.text`) }}
              </p>
              <p
                v-if="item.cost"
                class="flex items-center gap-1 text-sm font-semibold text-sun-200"
              >
                <SpriteIcon
                  name="coin"
                  class="size-4"
                />{{ n(item.cost) }}
              </p>
            </div>
          </div>
        </template>
        <template v-else>
          <h2 class="font-display text-xl text-leaf-200">
            {{ t('briefing.farm') }}
          </h2>
          <ul class="flex flex-col gap-1.5 text-sm text-moss-100">
            <li class="flex items-center gap-2">
              <SpriteIcon
                name="coin"
                class="size-5"
              />{{ t('briefing.coins', { n: n(props.level.startCoins) }) }}
            </li>
            <li class="flex items-center gap-2">
              <SpriteIcon
                name="water"
                class="size-5"
              />{{ t('briefing.water', { n: n(props.level.water) }) }}
            </li>
            <li class="flex items-center gap-2">
              <SpriteIcon
                name="barn"
                class="size-5"
              />{{ t('briefing.barn', { n: n(props.level.barnCap) }) }}
            </li>
            <li
              v-if="props.level.monkeys"
              class="flex items-center gap-2"
            >
              <SpriteIcon
                name="monkey"
                class="size-5"
              />{{ t('briefing.monkeys', { n: n(props.level.monkeys.hp) }) }}
            </li>
            <li
              v-if="world.dry"
              class="flex items-center gap-2"
            >
              <SpriteIcon
                name="palm"
                class="size-5"
              />{{ t('news.dry.text') }}
            </li>
          </ul>
        </template>
      </motion.section>
    </div>

    <motion.div
      v-bind="pop(0.15)"
      class="mt-auto flex justify-center pt-2"
    >
      <button
        type="button"
        class="btn-game lg"
        autofocus
        @click="emit('start')"
      >
        <UIcon
          name="i-lucide-play"
          class="size-7"
        />
        {{ t('briefing.start') }}
      </button>
    </motion.div>
  </div>
</template>
