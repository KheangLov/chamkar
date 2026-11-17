<script setup lang="ts">
/** The end of a level: the stars, the time against the star times, and on to the next. */
import { motion } from 'motion-v'
import { LEVELS_PER_WORLD, TOTAL_LEVELS, getLevel, type Engine } from '#shared/game'

const props = defineProps<{ engine: Engine }>()
const emit = defineEmits<{ next: [], replay: [], levels: [] }>()
const { locale, t } = useI18n()
const reduced = useReducedMotion()
const nextButton = ref<HTMLButtonElement | null>(null)

const level = computed(() => props.engine.level)
const hasNext = computed(() => level.value.n < TOTAL_LEVELS)
const worldDone = computed(() => level.value.index === LEVELS_PER_WORLD - 1)
const nextNews = computed(() => hasNext.value ? getLevel(level.value.n + 1).news[0] : undefined)
const time = (s: number) => formatTime(s, locale.value)

const rows = computed(() => [
  { stars: 3, at: level.value.par.gold, ok: props.engine.finishTime <= level.value.par.gold },
  { stars: 2, at: level.value.par.silver, ok: props.engine.finishTime <= level.value.par.silver },
])

onMounted(() => setTimeout(() => nextButton.value?.focus(), 400))
</script>

<template>
  <motion.div
    :initial="reduced ? false : { opacity: 0 }"
    :animate="{ opacity: 1 }"
    class="fixed inset-0 z-40 flex items-center justify-center bg-moss-950/70 p-4 backdrop-blur-sm"
    role="alertdialog"
    aria-modal="true"
    :aria-label="t('result.won')"
  >
    <motion.div
      :initial="reduced ? false : { scale: 0.7, y: 40, opacity: 0 }"
      :animate="{ scale: 1, y: 0, opacity: 1 }"
      :transition="{ type: 'spring', stiffness: 260, damping: 18 }"
      class="glass flex w-full max-w-md flex-col items-center gap-3 p-6 text-center landscape:max-lg:max-w-2xl landscape:max-lg:flex-row landscape:max-lg:flex-wrap landscape:max-lg:justify-center landscape:max-lg:gap-x-6 landscape:max-lg:p-4"
    >
      <div class="flex flex-col items-center gap-2">
        <p
          v-if="worldDone"
          class="chip text-sun-200"
        >
          <UIcon
            name="i-lucide-trophy"
            class="size-4"
          />
          {{ level.n === TOTAL_LEVELS ? t('result.theEnd') : t('result.worldDone', { n: localNumber(Math.ceil(level.n / LEVELS_PER_WORLD), locale) }) }}
        </p>
        <h2 class="text-glow font-display text-4xl leading-tight">
          {{ t('result.won') }}
        </h2>
        <StarRow
          :count="props.engine.stars"
          size="size-12"
          animate
          :label="t('map.stars', { n: localNumber(props.engine.stars, locale) })"
        />
        <p class="flex items-center gap-1.5 font-display text-2xl text-sun-100">
          <UIcon
            name="i-lucide-timer"
            class="size-6"
          />
          {{ time(props.engine.finishTime) }}
        </p>
      </div>

      <div class="flex flex-col items-center gap-3">
        <ul class="flex flex-col gap-1 text-sm">
          <li
            v-for="row in rows"
            :key="row.stars"
            class="flex items-center gap-2"
            :class="row.ok ? 'text-leaf-200' : 'text-moss-400'"
          >
            <UIcon
              :name="row.ok ? 'i-lucide-circle-check' : 'i-lucide-circle'"
              class="size-4"
            />
            <StarRow
              :count="row.stars"
              size="size-3.5"
            />
            {{ t('result.within', { time: time(row.at) }) }}
          </li>
        </ul>

        <p
          v-if="nextNews"
          class="flex items-center gap-2 text-sm text-leaf-200"
        >
          <UIcon
            name="i-lucide-gift"
            class="size-4"
          />
          {{ t('result.nextNew', { name: t(`news.${nextNews}.name`) }) }}
        </p>

        <div class="flex flex-wrap justify-center gap-2">
          <button
            v-if="hasNext"
            ref="nextButton"
            type="button"
            class="btn-game"
            @click="emit('next')"
          >
            {{ t('result.next') }}
            <UIcon
              name="i-lucide-chevron-right"
              class="size-5"
            />
          </button>
          <button
            type="button"
            class="btn-game"
            :class="hasNext ? 'ghost' : 'sun'"
            @click="emit('replay')"
          >
            <UIcon
              name="i-lucide-rotate-ccw"
              class="size-5"
            />
            {{ t('result.replay') }}
          </button>
          <button
            type="button"
            class="btn-game ghost"
            @click="emit('levels')"
          >
            <UIcon
              name="i-lucide-map"
              class="size-5"
            />
            {{ t('result.levels') }}
          </button>
        </div>
      </div>
    </motion.div>
  </motion.div>
</template>
