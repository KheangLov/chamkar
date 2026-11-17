<script setup lang="ts">
/**
 * The tuk-tuk to market: tap goods in the barn to load them (or load all of one kind), tap them on
 * the tuk-tuk to take them back off, then send it. The game keeps going while this is open.
 */
import { motion } from 'motion-v'
import { ITEMS, ITEM_ORDER, type Engine, type ItemId } from '#shared/game'

const props = defineProps<{ engine: Engine, version: number }>()
const emit = defineEmits<{ close: [], changed: [] }>()
const { locale, t } = useI18n()
const reduced = useReducedMotion()
const audio = useUiSound()
const n = (value: number) => localNumber(value, locale.value)

// `version` changes whenever the engine's barn or tuk-tuk do: reading it makes these recompute.
function live<T>(read: () => T) {
  return computed(() => {
    void props.version
    return read()
  })
}
const barn = live(() => ITEM_ORDER.filter(id => props.engine.barn[id] > 0).map(id => ({ id, count: props.engine.barn[id] })))
const load = live(() => ITEM_ORDER.filter(id => props.engine.truck.load[id] > 0).map(id => ({ id, count: props.engine.truck.load[id] })))
const home = live(() => props.engine.truck.state === 'home')
const loaded = live(() => props.engine.truckLoad)
const value = live(() => props.engine.truckValue)
const away = live(() => Math.ceil(props.engine.truck.t))
const cap = computed(() => props.engine.level.truckCap)

function add(id: ItemId, all = false) {
  if (!home.value) return
  const moved = props.engine.loadTruck(id, all ? 99 : 1)
  audio.ui(moved ? 'select' : 'nope')
  emit('changed')
}
function remove(id: ItemId) {
  if (props.engine.unloadTruck(id)) audio.ui('tap')
  emit('changed')
}
function loadAll() {
  for (const id of ITEM_ORDER) props.engine.loadTruck(id, 99)
  audio.ui('select')
  emit('changed')
}
function send() {
  if (props.engine.sendTruck()) {
    audio.ui('unlock')
    emit('changed')
    emit('close')
  }
  else audio.ui('nope')
}
</script>

<template>
  <motion.aside
    :initial="reduced ? false : { x: 60, opacity: 0 }"
    :animate="{ x: 0, opacity: 1 }"
    :exit="reduced ? undefined : { x: 60, opacity: 0 }"
    :transition="{ type: 'spring', stiffness: 320, damping: 28 }"
    class="glass absolute inset-y-1 end-1 z-30 flex w-[min(22rem,92%)] flex-col gap-3 overflow-y-auto p-3"
    role="dialog"
    :aria-label="t('market.title')"
    @pointerdown.stop
  >
    <header class="flex items-center gap-2">
      <SpriteIcon
        name="truck"
        class="size-10"
      />
      <h2 class="me-auto font-display text-2xl leading-tight text-sun-100">
        {{ t('market.title') }}
      </h2>
      <button
        type="button"
        class="btn-icon"
        :aria-label="t('market.close')"
        @click="emit('close')"
      >
        <UIcon
          name="i-lucide-x"
          class="size-5"
        />
      </button>
    </header>

    <template v-if="home">
      <section>
        <div class="mb-1 flex items-center justify-between text-sm font-semibold text-moss-200">
          <span>{{ t('market.barn') }}</span>
          <button
            v-if="barn.length"
            type="button"
            class="rounded-lg px-2 py-1 text-leaf-200 hover:bg-moss-800"
            @click="loadAll"
          >
            {{ t('market.loadAll') }}
          </button>
        </div>
        <p
          v-if="!barn.length"
          class="rounded-xl bg-moss-900/60 p-3 text-sm text-muted"
        >
          {{ t('market.barnEmpty') }}
        </p>
        <ul
          v-else
          class="grid grid-cols-2 gap-2"
        >
          <li
            v-for="item in barn"
            :key="item.id"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-xl bg-[#fff7e0] p-1.5 pe-2 text-start text-[#4a2e16] shadow-[0_3px_0_#2e1a0a] active:translate-y-0.5"
              :aria-label="t('market.loadOne', { name: t(`items.${item.id}`) })"
              @click="add(item.id)"
              @dblclick="add(item.id, true)"
            >
              <SpriteIcon
                :name="item.id"
                class="size-9 shrink-0"
              />
              <span class="min-w-0 flex-1 leading-tight">
                <span class="block font-display text-lg">×{{ n(item.count) }}</span>
                <span class="flex items-center gap-1 text-xs font-semibold text-[#8a5a24]">
                  <SpriteIcon
                    name="coin"
                    class="size-3.5"
                  />{{ n(ITEMS[item.id].price) }}
                </span>
              </span>
              <UIcon
                name="i-lucide-plus"
                class="size-4 text-leaf-700"
              />
            </button>
          </li>
        </ul>
      </section>

      <section class="rounded-2xl bg-moss-950/60 p-2">
        <div class="mb-1 flex items-center justify-between px-1 text-sm font-semibold text-moss-200">
          <span>{{ t('market.truck') }}</span>
          <span :class="loaded >= cap ? 'text-sun-300' : ''">{{ n(loaded) }}/{{ n(cap) }}</span>
        </div>
        <p
          v-if="!load.length"
          class="p-2 text-sm text-muted"
        >
          {{ t('market.truckEmpty') }}
        </p>
        <ul
          v-else
          class="flex flex-wrap gap-1.5"
        >
          <li
            v-for="item in load"
            :key="item.id"
          >
            <button
              type="button"
              class="relative flex items-center rounded-xl bg-moss-800 p-1"
              :aria-label="t('market.unload', { name: t(`items.${item.id}`) })"
              @click="remove(item.id)"
            >
              <SpriteIcon
                :name="item.id"
                class="size-9"
              />
              <span class="absolute -end-1 -top-1 rounded-full bg-sun-300 px-1.5 font-display text-xs leading-5 text-sun-950">{{ n(item.count) }}</span>
            </button>
          </li>
        </ul>
      </section>

      <button
        type="button"
        class="btn-game sun"
        :disabled="!loaded"
        @click="send"
      >
        <UIcon
          name="i-lucide-truck"
          class="size-6"
        />
        {{ t('market.send') }}
        <span class="ms-1 flex items-center gap-1 rounded-lg bg-white/40 px-2 py-0.5 text-lg">
          <SpriteIcon
            name="coin"
            class="size-5"
          />{{ n(value) }}
        </span>
      </button>
    </template>

    <div
      v-else
      class="flex flex-col items-center gap-2 p-4 text-center"
    >
      <UIcon
        name="i-lucide-timer"
        class="size-10 text-sun-300"
      />
      <p class="font-display text-xl text-sun-100">
        {{ t('market.away', { n: n(away) }) }}
      </p>
      <p class="text-sm text-muted">
        {{ t('market.awayText') }}
      </p>
    </div>
  </motion.aside>
</template>
