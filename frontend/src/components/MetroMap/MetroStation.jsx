

import { STATION_SIZES } from './metroConstants'

function getRadius(station) {
  if (station.isHub) return STATION_SIZES.hubRadius
  if (station.visualType === 'service') return STATION_SIZES.serviceRadius

  return STATION_SIZES.defaultRadius
}

export default function MetroStation({ station, isActive, isDimmed, onHover, onLeave, onClick }) {
  const radius = getRadius(station)
  const innerRadius = Math.max(3, radius - 5)

  return (
    <g
      transform={`translate(${station.x}, ${station.y})`}
      onMouseEnter={() => onHover?.(String(station.id))}
      onMouseLeave={() => onLeave?.()}
      onClick={() => onClick?.(String(station.id))}
      style={{
        cursor: 'pointer',
        opacity: isDimmed ? 0.28 : 1,
        transition: 'opacity 180ms ease',
      }}
    >
      <circle
        r={isActive ? radius * 1.35 : radius + 5}
        fill="rgba(255,255,255,0.08)"
        stroke="none"
        style={{ transition: 'r 180ms ease' }}
      />

      <circle
        r={isActive ? radius * 1.25 : radius}
        fill={station.color}
        stroke="#FFFFFF"
        strokeWidth={2.4}
        style={{
          filter: isActive ? `drop-shadow(0 0 10px ${station.color})` : 'drop-shadow(0 0 5px rgba(0,0,0,.45))',
          transition: 'r 180ms ease, filter 180ms ease',
        }}
      />

      {station.isHub && (
        <circle
          r={innerRadius}
          fill="#0D1B2A"
          stroke="#FFFFFF"
          strokeWidth={1.6}
        />
      )}

      <text
        x={station.labelX - station.x}
        y={station.labelY - station.y}
        textAnchor={station.textAnchor || 'start'}
        fill="#F8FAFC"
        fontSize={station.isHub ? 13 : 12}
        fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        fontWeight={station.isHub ? 800 : 700}
        style={{
          paintOrder: 'stroke',
          stroke: '#0D1B2A',
          strokeWidth: 4,
          strokeLinejoin: 'round',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {station.name}
      </text>
    </g>
  )
}