import { useMemo } from 'react'
import { MiniMap, TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'

import MetroLine from './MetroLine'
import MetroStation from './MetroStation'

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls()
  const btn = {
    width: 34, height: 34, borderRadius: 9,
    border: '1px solid rgba(148,163,184,0.22)',
    background: 'rgba(15,23,42,0.92)', color: '#E2E8F0',
    fontSize: 17, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(8px)', lineHeight: 1,
  }
  return (
    <div style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button style={btn} onClick={() => zoomIn()} title="Наблизити">+</button>
      <button style={btn} onClick={() => zoomOut()} title="Віддалити">−</button>
      <button style={{ ...btn, fontSize: 13 }} onClick={() => resetTransform()} title="Скинути">⤢</button>
    </div>
  )
}

const RELATION_PRIORITY_STYLE = {
  high: {
    strokeWidth: 2,
    opacity: 0.22,
    activeStrokeWidth: 3.2,
    activeOpacity: 0.78,
    dashArray: '8 10',
    glowOpacity: 0.04,
    activeGlowOpacity: 0.2,
  },
  middle: {
    strokeWidth: 2,
    opacity: 0.36,
    activeStrokeWidth: 2.5,
    activeOpacity: 0.58,
    dashArray: '6 11',
    glowOpacity: 0.08,
    activeGlowOpacity: 0.14,
  },
  mid: {
    strokeWidth: 2,
    opacity: 0.36,
    activeStrokeWidth: 2.5,
    activeOpacity: 0.58,
    dashArray: '6 11',
    glowOpacity: 0.08,
    activeGlowOpacity: 0.14,
  },
  low: {
    strokeWidth: 1.4,
    opacity: 0.22,
    activeStrokeWidth: 1.8,
    activeOpacity: 0.4,
    dashArray: '3 13',
    glowOpacity: 0.04,
    activeGlowOpacity: 0.08,
  },
}

function getRelationPriority(relation) {
  return String(relation?.strength || relation?.priority || 'middle').toLowerCase()
}

function getRelationStyle(relation) {
  return RELATION_PRIORITY_STYLE[getRelationPriority(relation)] || RELATION_PRIORITY_STYLE.middle
}

function getStationColor(station) {
  return station?.color || station?.line?.color || '#60A5FA'
}

function resolveVisibleRelationStation(stationById, primaryId, parentId) {
  const primaryStation = primaryId ? stationById.get(String(primaryId)) : null

  if (primaryStation) {
    return {
      station: primaryStation,
      resolvedId: String(primaryId),
      isFallbackToParent: false,
    }
  }

  const parentStation = parentId ? stationById.get(String(parentId)) : null

  if (parentStation) {
    return {
      station: parentStation,
      resolvedId: String(parentId),
      isFallbackToParent: true,
    }
  }

  return {
    station: null,
    resolvedId: null,
    isFallbackToParent: false,
  }
}

function buildRelationPath(sourceStation, targetStation, relationIndex) {
  const sourceX = Number(sourceStation.x)
  const sourceY = Number(sourceStation.y)
  const targetX = Number(targetStation.x)
  const targetY = Number(targetStation.y)

  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const distance = Math.sqrt(dx * dx + dy * dy) || 1
  const normalX = -dy / distance
  const normalY = dx / distance
  const curveOffset = 34 + (relationIndex % 3) * 14
  const controlX = (sourceX + targetX) / 2 + normalX * curveOffset
  const controlY = (sourceY + targetY) / 2 + normalY * curveOffset

  return `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`
}

function isBackwardRelation(relation) {
  return String(relation?.direction || '').toLowerCase() === 'backward'
}

function isActiveRelationSegment(segment, activeStationId) {
  if (!activeStationId) return false

  const normalizedActiveId = String(activeStationId)

  return (
    segment.sourceId === normalizedActiveId ||
    segment.targetId === normalizedActiveId ||
    segment.resolvedSourceId === normalizedActiveId ||
    segment.resolvedTargetId === normalizedActiveId
  )
}

export default function MapCanvas({
  centralStations,
  regionalLines,
  relations = [],
  activeStationId,
  hoveredLineId,
  dimmedStationIds,
  onStationHover,
  onStationLeave,
  onStationClick,
  onLineHover,
  onLineLeave,
}) {
  const stationById = useMemo(() => {
    const stationMap = new Map()

    centralStations.forEach((station) => {
      stationMap.set(String(station.id), station)
    })

    regionalLines.forEach((line) => {
      line.stations.forEach((station) => {
        stationMap.set(String(station.id), {
          ...station,
          line,
        })
      })
    })

    return stationMap
  }, [centralStations, regionalLines])

  const relationSegments = useMemo(() => {
    return relations
      .map((relation, index) => {
        const sourceId = String(relation.source_department_id || relation.source)
        const targetId = String(relation.target_department_id || relation.target)
        const sourceResolved = resolveVisibleRelationStation(
          stationById,
          sourceId,
          relation.source_parent_department_id,
        )
        const targetResolved = resolveVisibleRelationStation(
          stationById,
          targetId,
          relation.target_parent_department_id,
        )
        const sourceStation = sourceResolved.station
        const targetStation = targetResolved.station

        if (!sourceStation || !targetStation) {
          return null
        }

        if (sourceResolved.resolvedId === targetResolved.resolvedId) {
          return null
        }

        const isBidirectional = Boolean(relation.is_bidirectional || relation.direction === 'bidirectional')
        const isBackward = isBackwardRelation(relation)
        const renderSourceStation = !isBidirectional && isBackward ? targetStation : sourceStation
        const renderTargetStation = !isBidirectional && isBackward ? sourceStation : targetStation
        const renderSourceColor = getStationColor(renderSourceStation)
        const renderTargetColor = getStationColor(renderTargetStation)

        return {
          relation,
          index,
          sourceId,
          targetId,
          resolvedSourceId: sourceResolved.resolvedId,
          resolvedTargetId: targetResolved.resolvedId,
          isSourceFallbackToParent: sourceResolved.isFallbackToParent,
          isTargetFallbackToParent: targetResolved.isFallbackToParent,
          sourceStation,
          targetStation,
          renderSourceStation,
          renderTargetStation,
          sourceColor: renderSourceColor,
          targetColor: renderTargetColor,
          path: buildRelationPath(renderSourceStation, renderTargetStation, index),
          style: getRelationStyle(relation),
          isBidirectional,
        }
      })
      .filter(Boolean)
  }, [relations, stationById])
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0D1B2A',
      }}
    >
      <TransformWrapper
        minScale={0.45}
        maxScale={2.2}
        initialScale={0.9}
        wheel={{ smoothStep: 0.08 }}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent
          wrapperStyle={{
            width: '100%',
            height: '100%',
          }}
          contentStyle={{
            width: '100%',
            height: '100%',
          }}
        >
          <svg
            viewBox="0 0 1400 900"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
          >
            <rect width="1400" height="900" fill="#0D1B2A" />

            <defs>
              <filter id="metro-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="relation-glow" x="-45%" y="-45%" width="190%" height="190%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {relationSegments.map((segment) => (
                <linearGradient
                  key={`relation-gradient-${segment.relation.id}`}
                  id={`relation-gradient-${segment.relation.id}`}
                  gradientUnits="userSpaceOnUse"
                  x1={segment.renderSourceStation.x}
                  y1={segment.renderSourceStation.y}
                  x2={segment.renderTargetStation.x}
                  y2={segment.renderTargetStation.y}
                >
                  <stop offset="0%" stopColor={segment.sourceColor} />
                  <stop offset="38%" stopColor={segment.sourceColor} />
                  <stop offset="62%" stopColor={segment.targetColor} />
                  <stop offset="100%" stopColor={segment.targetColor} />
                </linearGradient>
              ))}

              {relationSegments.map((segment) => (
                <marker
                  key={`relation-arrow-end-${segment.relation.id}`}
                  id={`relation-arrow-end-${segment.relation.id}`}
                  viewBox="0 0 10 10"
                  refX="8.5"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={segment.isBidirectional ? segment.targetColor : segment.sourceColor} opacity="0.86" />
                </marker>
              ))}

              {relationSegments
                .filter((segment) => segment.isBidirectional)
                .map((segment) => (
                  <marker
                    key={`relation-arrow-start-${segment.relation.id}`}
                    id={`relation-arrow-start-${segment.relation.id}`}
                    viewBox="0 0 10 10"
                    refX="1.5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 10 0 L 0 5 L 10 10 z" fill={segment.sourceColor} opacity="0.86" />
                  </marker>
                ))}
            </defs>

            <g>
              <circle
                cx="700"
                cy="450"
                r="30"
                fill="rgba(255,255,255,0.12)"
                stroke="none"
              />
              <circle
                cx="700"
                cy="450"
                r="20"
                fill="#0D1B2A"
                stroke="#FFFFFF"
                strokeWidth="4"
              />
              <circle
                cx="700"
                cy="450"
                r="9"
                fill="#FFFFFF"
              />
              <text
                x="700"
                y="420"
                textAnchor="middle"
                fill="#F8FAFC"
                fontSize="13"
                fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
                fontWeight="900"
                style={{
                  paintOrder: 'stroke',
                  stroke: '#0D1B2A',
                  strokeWidth: 4,
                  strokeLinejoin: 'round',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                Company Core
              </text>
            </g>


            {regionalLines.map((line) => {
              const isActive = hoveredLineId === line.id
              const isDimmed = hoveredLineId && hoveredLineId !== line.id

              return (
                <MetroLine
                  key={line.id}
                  line={line}
                  isActive={isActive}
                  isDimmed={isDimmed}
                  onHover={onLineHover}
                  onLeave={onLineLeave}
                />
              )
            })}

            <g style={{ pointerEvents: 'none' }}>
              {relationSegments.map((segment) => {
                const isActive = isActiveRelationSegment(segment, activeStationId)
                const lineStrokeWidth = isActive ? segment.style.activeStrokeWidth : segment.style.strokeWidth
                const lineOpacity = isActive ? segment.style.activeOpacity : segment.style.opacity
                const glowOpacity = isActive ? segment.style.activeGlowOpacity : segment.style.glowOpacity

                return (
                  <g key={`relation-${segment.relation.id}`}>
                    <path
                      d={segment.path}
                      fill="none"
                      stroke={segment.isBidirectional ? `url(#relation-gradient-${segment.relation.id})` : segment.sourceColor}
                      strokeWidth={lineStrokeWidth + 6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={segment.style.dashArray}
                      opacity={glowOpacity}
                      filter="url(#relation-glow)"
                    />
                    <path
                      d={segment.path}
                      fill="none"
                      stroke={segment.isBidirectional ? `url(#relation-gradient-${segment.relation.id})` : segment.sourceColor}
                      strokeWidth={lineStrokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={segment.style.dashArray}
                      opacity={lineOpacity}
                      markerStart={segment.isBidirectional ? `url(#relation-arrow-start-${segment.relation.id})` : undefined}
                      markerEnd={`url(#relation-arrow-end-${segment.relation.id})`}
                    />
                  </g>
                )
              })}
            </g>

            {centralStations.map((station) => (
              <g key={`service-hub-${station.id}`}>
                {station.servicePath && (
                  <>
                    <path
                      d={station.servicePath}
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth={13}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={station.servicePath}
                      fill="none"
                      stroke={station.color}
                      strokeWidth={5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}

                <MetroStation
                  station={station}
                  isActive={String(activeStationId) === String(station.id)}
                  isDimmed={dimmedStationIds?.has(String(station.id))}
                  onHover={onStationHover}
                  onLeave={onStationLeave}
                  onClick={onStationClick}
                />
              </g>
            ))}

            {regionalLines.map((line) => (
              <g key={`stations-${line.id}`}>
                {line.stations.map((station) => (
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
            ))}
          </svg>
        </TransformComponent>

        <ZoomControls />

        <div style={{
          position: 'absolute', right: 16, bottom: 16, zIndex: 30,
          border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10,
          overflow: 'hidden', background: 'rgba(13,27,42,0.9)',
          backdropFilter: 'blur(8px)',
        }}>
          <MiniMap width={180} height={116} borderColor="rgba(96,165,250,0.8)">
            <svg viewBox="0 0 1400 900" width="100%" height="100%" style={{ display: 'block', background: '#0D1B2A' }}>
              {regionalLines.map((line) =>
                line.stations.map((s) => (
                  <circle key={`mini-${s.id}`} cx={s.x} cy={s.y} r="14" fill={s.color || '#60A5FA'} />
                )),
              )}
              {centralStations.map((s) => (
                <circle key={`mini-c-${s.id}`} cx={s.x} cy={s.y} r="16" fill={s.color || '#22C55E'} />
              ))}
            </svg>
          </MiniMap>
        </div>
      </TransformWrapper>
    </div>
  )
}
