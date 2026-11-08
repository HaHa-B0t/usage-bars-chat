import type { ClientModule } from 'claude-code'

type Props = { text: string; width: number }
type State = { step: number }

// Runs on the drawing side: steady frame clock, no round trip per step
const STEP_MS = 160
const GAP = '     •     '

const Ticker: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements

  if (surface.state === undefined) {
    surface.setState({ step: 0 })
    surface.every(STEP_MS, () => surface.setState({ step: (surface.state?.step ?? 0) + 1 }))
  }

  const { text, width } = props
  if (text.length <= width) {
    return <Text dimColor italic>{text}</Text>
  }

  const loop = text + GAP
  const at = (surface.state?.step ?? 0) % loop.length
  return <Text dimColor italic mono wrap="truncate-end">{(loop + loop).slice(at, at + width)}</Text>
}

export default Ticker
