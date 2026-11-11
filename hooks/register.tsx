import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Window } from '../types'

const windows = atom({ plugin: 'usage-bars-chat', key: 'windows' } as const, [] as Window[])

// Quote ticker width in cells; the scrolling runs in ./ticker.tsx
const TICKER_WIDTH = 40

const LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: '$',
}

// Bar width in cells
const WIDTH = 24

function fillColor(pct: number): string {
  if (pct >= 85) return 'error'
  if (pct >= 60) return 'warning'
  return 'success'
}

const QUOTES = [
  'Measure twice, cut once.',
  'Well begun is half done. — Aristotle',
  'Simplicity is the ultimate sophistication.',
  'Little by little, one travels far.',
  'Well done is better than well said. — Franklin',
  'Luck is what happens when preparation meets opportunity. — Seneca',
  'The best way out is always through. — Frost',
  'If it is not written down, it did not happen.',
  'Fix the cause, not the symptom.',
  'Slow is smooth, smooth is fast.',
  'Done is better than perfect.',
  'An ounce of prevention is worth a pound of cure. — Franklin',
  'What gets measured gets managed.',
  'He who has a why can bear almost any how. — Nietzsche',
  'Quality is never an accident.',
  // Funny ones
  'Measure twice, cut once, swear three times.',
  'It works on my machine.',
  'If at first you don’t succeed, call it version 1.0.',
  'The drawing is correct. The part is wrong.',
  'Nothing is more permanent than a temporary fix.',
  'Tolerance: how much the shop will put up with.',
  'I’m not lazy, I’m in energy-saving mode.',
  'There is no Ctrl+Z in the machine shop.',
  'Coffee: because adulting is hard.',
  'If it ain’t broke, you haven’t revised it yet.',
  'Rev A was a learning experience.',
  'Duct tape can’t fix stupid, but it can muffle it.',
  'The first 90% takes 90% of the time. So does the other 10%.',
  'I put the “pro” in procrastinate.',
  'Everything is a hammer if you try hard enough.',
  'A pawn can be whatever it wants as long as it keeps moving forward - except a king - you have to be born a king.',
]

// New quote every 15 minutes, shown on the next redraw
const QUOTE_MS = 15 * 60000

const SPAN_MS: Record<string, number> = {
  five_hour: 5 * 3600000,
  seven_day: 7 * 86400000,
}

// Face by pace: used % vs. how much of the window has passed
function face(w: Window, now: number): string {
  if (w.percentUsed >= 90) return '😱'
  const span = SPAN_MS[w.kind]
  if (!span || !w.resetsAt) return ''
  const left = Date.parse(w.resetsAt) - now
  const elapsed = Math.max(0, Math.min(100, ((span - left) / span) * 100))
  const ahead = w.percentUsed - elapsed
  if (ahead <= -15) return '😎'
  if (ahead <= 0) return '🙂'
  if (ahead <= 15) return '😬'
  return '😰'
}

function untilReset(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!(ms > 0)) return '↻ now'
  const mins = Math.round(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return `↻ ${d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`}`
}

// Redraw clock: bumped on each poll so countdowns stay current
const tick = atom({ plugin: 'usage-bars-chat', key: 'tick' } as const, 0)

// Newest reading from any session, shared through $.store
const SHARED_KEY = 'latest'
type Shared = { at: number; windows: Window[] }

// How often each session checks the shared reading
const POLL_MS = 30000

// Ask the usage service when the shared reading is older than this
const FETCH_MS = 3 * 60000

// Same figures as Settings → Usage, without waiting for a message
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

// A window past its reset time counts as empty until a new reading
function current(list: Window[], now: number): Window[] {
  return list.map(w =>
    w.resetsAt && Date.parse(w.resetsAt) <= now ? { kind: w.kind, percentUsed: 0 } : w,
  )
}

async function publish($: Engine, list: Window[]) {
  if (!list.length) return
  await setLocal($, list)
  await $.store.set(SHARED_KEY, { at: await $.clock.now(), windows: list } satisfies Shared)
}

// Live reading from the usage service; quietly does nothing on any failure
async function fetchUsage($: Engine): Promise<Window[]> {
  try {
    const auth = await $.session.authorize()
    if (!auth || auth.kind !== 'bearer') return []
    const res = await $.http.fetch(USAGE_URL, {
      auth: auth.handle,
      headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    })
    if (!res.ok) return []
    const body = JSON.parse(res.text) as Record<string, { utilization?: unknown; resets_at?: unknown } | null>
    const out: Window[] = []
    for (const kind of ['five_hour', 'seven_day']) {
      const w = body[kind]
      if (!w || typeof w.utilization !== 'number') continue
      out.push({
        kind,
        percentUsed: Math.round(w.utilization * 10) / 10,
        ...(typeof w.resets_at === 'string' ? { resetsAt: w.resets_at } : {}),
      })
    }
    return out
  } catch {
    return []
  }
}

// Fetch only when nobody has a recent reading
async function refreshIfStale($: Engine, force = false) {
  const s = await readShared($)
  const now = await $.clock.now()
  if (!force && s && now - s.at < FETCH_MS) return
  await publish($, await fetchUsage($))
}

async function readShared($: Engine): Promise<Shared | undefined> {
  const v = (await $.store.get(SHARED_KEY)) as Shared | undefined
  return v && Array.isArray(v.windows) && typeof v.at === 'number' ? v : undefined
}

async function setLocal($: Engine, list: Window[]) {
  const cur = await read($, windows)
  if (JSON.stringify(cur) !== JSON.stringify(list)) {
    await update($, windows, () => list.map(r => ({ ...r })))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    // Prefer the newest shared reading; fall back to this session's own
    const shared = await readShared($)
    if (shared && shared.windows.length) {
      await setLocal($, shared.windows)
    } else {
      const { rateLimits } = await $.session.usage()
      await setLocal($, rateLimits.map(r => ({ ...r })))
    }

    // Live numbers at startup, whatever the store holds
    await refreshIfStale($, true)

    // Pick up readings from other sessions, refresh when stale, keep countdowns fresh
    $.clock.every(POLL_MS, async () => {
      await refreshIfStale($)
      const s = await readShared($)
      if (s && s.windows.length) await setLocal($, s.windows)
      await update($, tick, n => n + 1)
    })

    return result
  })

  // A fresh reading in this session: show it and share it
  on('session.measure', async ($, e, next) => {
    await publish($, e.rateLimits.map(r => ({ ...r })))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Whatever other mods draw in this band (e.g. Prompt Master's button)
    // stays, on the same row as the bars.
    const below = await next(e)
    await read($, tick)
    const now = await $.clock.now()
    const list = current(await read($, windows), now)
    if (e.props.hasSurvey || list.length === 0) return below

    const els = $.ui.resolve(e)
    const { Box, Text } = els

    const quote = `“${QUOTES[Math.floor(now / QUOTE_MS) % QUOTES.length]}”`

    // One row: whatever other mods draw here first (e.g. Prompt Master's
    // star), then the bars, then the quote.
    return (
      <Box flexDirection="row" justifyContent="space-between" gap={3}>
        <Box flexDirection="row" gap={3} flexShrink={0}>
        {below ? (
          <Box key="others" flexDirection="row">
            {below}
          </Box>
        ) : null}
        {list.map(w => {
          const pct = Math.max(0, Math.min(100, w.percentUsed))
          const filled = Math.round((pct / 100) * WIDTH)
          // Solid track: colored spaces, no shade glyphs
          return (
            <Box key={w.kind} flexDirection="row" gap={1}>
              <Text dimColor>{LABELS[w.kind] ?? w.kind}</Text>
              <Text>
                <Text backgroundColor={fillColor(pct)}>{' '.repeat(filled)}</Text>
                <Text backgroundColor="promptBorder">{' '.repeat(WIDTH - filled)}</Text>
              </Text>
              <Text color={fillColor(pct)} tabular>{Math.round(w.percentUsed)}%</Text>
              <Text>{face(w, now)}</Text>
              <Text dimColor tabular>{untilReset(w.resetsAt, now)}</Text>
            </Box>
          )
        })}
        </Box>
        <Box width={TICKER_WIDTH} flexShrink={0}>
          {'Client' in els ? (
            <els.Client key="ticker" module="./ticker.tsx" props={{ text: quote, width: TICKER_WIDTH }} width={TICKER_WIDTH} />
          ) : (
            <Text dimColor italic wrap="truncate-end">{quote}</Text>
          )}
        </Box>
      </Box>
    )
  })
}
