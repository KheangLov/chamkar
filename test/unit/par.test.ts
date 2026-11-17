/**
 * The star times. `pnpm par` plays every level with the simple player and writes shared/game/par.ts;
 * run it after changing levels or tuning numbers. Otherwise this checks the table is up to date.
 */
import { describe, expect, it } from 'vitest'
import { PAR, TOTAL_LEVELS, getLevel } from '../../shared/game'
import { autoplay } from './helpers/autoplay'

// Node's own modules and globals, without pulling Node's types into the shared tsconfig.
declare const process: { env: Record<string, string | undefined> }
const update = !!process.env.UPDATE_PAR

describe('star times', () => {
  it('match the simple player', async () => {
    const times: number[] = []
    for (let n = 1; n <= TOTAL_LEVELS; n++) {
      const r = autoplay(getLevel(n), 900)
      expect(r.won, `level ${n}`).toBe(true)
      times.push(Math.ceil(r.time))
    }
    if (update) {
      const { writeFileSync } = await import(/* @vite-ignore */ `node:${'fs'}`) as { writeFileSync: (path: URL, data: string) => void }
      const rows: string[] = []
      for (let i = 0; i < times.length; i += 25) rows.push(`  ${times.slice(i, i + 25).join(', ')},`)
      writeFileSync(new URL('../../shared/game/par.ts', import.meta.url), `/** Seconds the simple player (test/unit/helpers/autoplay.ts) takes on each level, one row per world. Made by \`pnpm par\`. */\nexport const PAR: number[] = [\n${rows.join('\n')}\n]\n`)
    }
    else expect(PAR).toEqual(times)
  }, 120_000)
})
