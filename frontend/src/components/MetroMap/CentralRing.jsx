import MetroStation from './MetroStation'

export default function CentralRing({
  stations,
  activeStationId,
  dimmedStationIds,
  onStationHover,
  onStationLeave,
  onStationClick,
}) {
  if (!stations || stations.length === 0) return null

  const ringPath = buildRingPath(stations)

  return (
    <g>
      <path
        d={ringPath}
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d={ringPath}
        fill="none"
        stroke="#38BDF8"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {stations.map((station) => (
        <MetroStation
          key={station.id}
          station={station}
          isActive={String(activeStationId) === String(station.id)}
          isDimmed={dimmedStationIds?.has(String(station.id))}
          onHover={onStationHover}
          onLeave={onStationLeave}
          onClick={onStationClick}
        />
      ))}
    </g>
  )
}

function buildRingPath(stations) {
  if (stations.length < 2) return ''

  const commands = []

  stations.forEach((station, index) => {
    const next = stations[(index + 1) % stations.length]

    if (index === 0) {
      commands.push(`M ${station.x} ${station.y}`)
    }

    commands.push(`L ${next.x} ${next.y}`)
  })

  return commands.join(' ')
}
