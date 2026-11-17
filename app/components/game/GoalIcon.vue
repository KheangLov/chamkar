<script setup lang="ts">
/** A goal's picture: the good, the animal, or a coin. */
import type { Goal, SpriteName } from '#shared/game'

const props = defineProps<{ goal: Goal }>()
const name = computed<SpriteName>(() => props.goal.kind === 'item' ? props.goal.item : props.goal.kind === 'animal' ? props.goal.animal : 'coin')
</script>

<template>
  <SpriteIcon :name="name" />
</template>
