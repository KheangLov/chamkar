/**
 * The story: Srey comes home to her grandfather's farm (Ta) and builds it up, from the village to the
 * Water Festival, while Sva and his monkeys try to help themselves. A scene plays before each world's
 * first level, and a last one after the final festival. The words are in i18n/locales/*.json under
 * `story.<world>.<intro|outro>`, one line per speaker below, in order.
 */
import type { WorldId } from './levels'
import type { SpriteName } from './sprites'

export type Speaker = 'srey' | 'ta' | 'sva'

export const SPEAKER_SPRITE: Record<Speaker, SpriteName> = {
  srey: 'srey',
  ta: 'ta',
  sva: 'monkey',
}

export const STORY: Record<WorldId, { intro: Speaker[], outro: Speaker[] }> = {
  village: { intro: ['ta', 'srey', 'ta', 'srey'], outro: [] },
  ricefield: { intro: ['srey', 'ta', 'sva', 'srey'], outro: [] },
  riverside: { intro: ['ta', 'srey', 'ta'], outro: [] },
  temple: { intro: ['srey', 'ta', 'sva'], outro: [] },
  palmgrove: { intro: ['ta', 'srey', 'ta'], outro: [] },
  festival: { intro: ['srey', 'ta', 'sva'], outro: ['ta', 'sva', 'srey'] },
}
