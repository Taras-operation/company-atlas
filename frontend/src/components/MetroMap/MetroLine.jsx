

import { LINE_STYLE } from './metroConstants'

export default function MetroLine({ line, isDimmed, isActive, onHover, onLeave }) {
  const strokeWidth = line.type === 'regional' ? LINE_STYLE.width : LINE_STYLE.serviceWidth

  return (
    <g
      onMouseEnter={() => onHover?.(line.id)}
      onMouseLeave={() => onLeave?.()}
      style={{ cursor: 'pointer' }}
    >
      <path
        d={line.path}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth + 8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isDimmed ? 0.18 : 0.42}
      />

      <path
        d={line.path}
        fill="none"
        stroke={line.color}
        strokeWidth={isActive ? strokeWidth + 1.5 : strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isDimmed ? 0.25 : 1}
        style={{
          filter: isActive ? `drop-shadow(0 0 8px ${line.color})` : 'none',
          transition: 'opacity 180ms ease, stroke-width 180ms ease, filter 180ms ease',
        }}
      />
    </g>
  )
}