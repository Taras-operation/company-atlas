import { useMemo, useState } from 'react'
import { MiniMap, TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'

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

const W = 1440
const H = 900
const CX = W / 2
const CY = H / 2

// Outer ring (rounded rectangle)
const RX1 = 115
const RY1 = 95
const RX2 = 1325
const RY2 = 805
const RR = 52  // corner radius

// Inner service area
const IX1 = 295
const IY1 = 180
const IX2 = 1145
const IY2 = 720

const COLOR_REGIONAL = '#3B82F6'
const COLOR_SERVICE = '#22C55E'
const BG = '#0D1B2A'

function getStationType(station, line) {
  return String(
    station.department_type_name ||
    station.department_type ||
    station.type ||
    station.kind ||
    line?.name ||
    line?.type ||
    '',
  ).toLowerCase()
}

function isRegionalStation(station, line) {
  const t = getStationType(station, line)
  return t.includes('regional') || t.includes('регион') || t.includes('регіон')
}

function isServiceStation(station, line) {
  const t = getStationType(station, line)
  return t.includes('service') || t.includes('сервис') || t.includes('сервіс')
}

function isChildStation(station) {
  return Boolean(station.parent_id || station.parentId || station.parent_department_id)
}

// ─── Rounded-rect perimeter math ────────────────────────────────────────────

function rrPerimeter(x1, y1, x2, y2, r) {
  return 2 * (x2 - x1 - 2 * r) + 2 * (y2 - y1 - 2 * r) + 2 * Math.PI * r
}

/**
 * Returns {x, y, nx, ny} at distance `d` along the rounded-rect perimeter
 * going clockwise from the top-left start point.
 * nx, ny = inward-facing normal (toward the interior).
 */
function rrPoint(d, x1, y1, x2, y2, r) {
  const w = x2 - x1 - 2 * r
  const h = y2 - y1 - 2 * r
  const arc = (Math.PI / 2) * r
  const perim = 2 * w + 2 * h + 4 * arc

  // normalise d
  const dd = ((d % perim) + perim) % perim

  const segs = [
    // [length, fn(t) -> {x, y, nx, ny}]
    [w,   (t) => ({ x: x1 + r + t * w,   y: y1,           nx:  0, ny:  1 })],  // top L→R
    [arc, (t) => {                                                               // top-right arc
      const a = -Math.PI / 2 + t * (Math.PI / 2)
      return { x: x2 - r + r * Math.cos(a), y: y1 + r + r * Math.sin(a), nx: -Math.cos(a), ny: -Math.sin(a) }
    }],
    [h,   (t) => ({ x: x2,           y: y1 + r + t * h,   nx: -1, ny:  0 })],  // right T→B
    [arc, (t) => {
      const a = 0 + t * (Math.PI / 2)
      return { x: x2 - r + r * Math.cos(a), y: y2 - r + r * Math.sin(a), nx: -Math.cos(a), ny: -Math.sin(a) }
    }],
    [w,   (t) => ({ x: x2 - r - t * w,   y: y2,           nx:  0, ny: -1 })],  // bottom R→L
    [arc, (t) => {
      const a = Math.PI / 2 + t * (Math.PI / 2)
      return { x: x1 + r + r * Math.cos(a), y: y2 - r + r * Math.sin(a), nx: -Math.cos(a), ny: -Math.sin(a) }
    }],
    [h,   (t) => ({ x: x1,           y: y2 - r - t * h,   nx:  1, ny:  0 })],  // left  B→T
    [arc, (t) => {
      const a = Math.PI + t * (Math.PI / 2)
      return { x: x1 + r + r * Math.cos(a), y: y1 + r + r * Math.sin(a), nx: -Math.cos(a), ny: -Math.sin(a) }
    }],
  ]

  let rem = dd
  for (const [len, fn] of segs) {
    if (rem <= len) return fn(len === 0 ? 0 : rem / len)
    rem -= len
  }
  return segs[0][1](0)
}

function rrSvgPath(x1, y1, x2, y2, r) {
  return (
    `M ${x1 + r} ${y1}` +
    ` L ${x2 - r} ${y1}` +
    ` Q ${x2} ${y1} ${x2} ${y1 + r}` +
    ` L ${x2} ${y2 - r}` +
    ` Q ${x2} ${y2} ${x2 - r} ${y2}` +
    ` L ${x1 + r} ${y2}` +
    ` Q ${x1} ${y2} ${x1} ${y2 - r}` +
    ` L ${x1} ${y1 + r}` +
    ` Q ${x1} ${y1} ${x1 + r} ${y1} Z`
  )
}

// ─── Inner grid layout ──────────────────────────────────────────────────────

function buildInnerGrid(stations) {
  if (!stations.length) return []
  const areaW = IX2 - IX1
  const areaH = IY2 - IY1
  const n = stations.length
  const cols = Math.max(1, Math.round(Math.sqrt(n * (areaW / areaH))))
  const rows = Math.ceil(n / cols)
  const cellW = areaW / cols
  const cellH = areaH / rows

  return stations.map((s, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    const rowStations = Math.min(cols, n - row * cols)
    const rowOffsetX = ((cols - rowStations) * cellW) / 2
    return {
      ...s,
      gx: IX1 + rowOffsetX + col * cellW + cellW / 2,
      gy: IY1 + row * cellH + cellH / 2,
    }
  })
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function OrbitMap({
  payload,
  selectedDepartmentId,
  setSelectedDepartmentId,
  setHoveredDepartmentId,
}) {
  const [hoveredId, setHoveredId] = useState(null)
  const activeId = hoveredId || selectedDepartmentId

  // Split stations
  const { outerStations, innerStations } = useMemo(() => {
    if (!payload) return { outerStations: [], innerStations: [] }
    const outer = []
    const inner = []
    payload.lines.forEach((line) => {
      line.stations.forEach((station) => {
        if (isChildStation(station)) return
        if (isRegionalStation(station, line)) outer.push({ ...station, line })
        else inner.push({ ...station, line })
      })
    })
    return { outerStations: outer, innerStations: inner }
  }, [payload])

  // Outer ring positions
  const outerPosMap = useMemo(() => {
    const n = outerStations.length
    const map = new Map()
    if (!n) return map
    const perim = rrPerimeter(RX1, RY1, RX2, RY2, RR)
    // Start from top-center going clockwise
    const topLen = RX2 - RX1 - 2 * RR
    const startD = topLen / 2 - ((n - 1) / 2) * (perim / n)
    outerStations.forEach((s, i) => {
      const d = ((startD + i * (perim / n)) % perim + perim) % perim
      const pt = rrPoint(d, RX1, RY1, RX2, RY2, RR)
      map.set(String(s.id), { ...pt, num: String(i + 1).padStart(2, '0') })
    })
    return map
  }, [outerStations])

  // Inner grid
  const innerGrided = useMemo(() => buildInnerGrid(innerStations), [innerStations])

  // Combined position map (for relations lookup)
  const allPosMap = useMemo(() => {
    const map = new Map()
    outerPosMap.forEach((pos, id) => map.set(id, { x: pos.x, y: pos.y }))
    innerGrided.forEach((s) => map.set(String(s.id), { x: s.gx, y: s.gy }))
    return map
  }, [outerPosMap, innerGrided])

  // Connected IDs for dim effect
  const connectedIds = useMemo(() => {
    const set = new Set()
    if (!payload || !activeId) return set
    payload.relations.forEach((r) => {
      const src = String(r.source)
      const tgt = String(r.target)
      if (src === String(activeId)) set.add(tgt)
      if (tgt === String(activeId)) set.add(src)
    })
    return set
  }, [payload, activeId])

  // Which relations to draw
  const visibleRelations = useMemo(() => {
    if (!payload) return []
    if (!activeId) {
      return payload.relations.filter(
        (r) => r.is_critical || String(r.strength || '').toLowerCase() === 'high',
      )
    }
    return payload.relations.filter((r) => {
      const src = String(r.source)
      const tgt = String(r.target)
      return src === String(activeId) || tgt === String(activeId)
    })
  }, [payload, activeId])

  const onHover = (id) => { setHoveredId(id); setHoveredDepartmentId?.(id) }
  const onLeave = () => { setHoveredId(null); setHoveredDepartmentId?.(null) }
  const onClick = (id) => setSelectedDepartmentId(id)

  const trackPath = rrSvgPath(RX1, RY1, RX2, RY2, RR)

  return (
    <div style={{ width: '100%', height: '100%', background: BG }}>
      <TransformWrapper
        minScale={0.3}
        maxScale={2.8}
        initialScale={0.82}
        wheel={{ smoothStep: 0.07 }}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%', height: '100%' }}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <filter id="oa-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="oa-glow-sm" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <marker id="oa-arr" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 1 L 9 5 L 0 9 Z" fill="#94A3B8" opacity="0.75" />
              </marker>
              <marker id="oa-arr-crit" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 1 L 9 5 L 0 9 Z" fill="#F97316" opacity="0.9" />
              </marker>
            </defs>

            {/* ── Background ── */}
            <rect width={W} height={H} fill={BG} />
            <pattern id="oa-dots" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="15" cy="15" r="0.85" fill="rgba(148,163,184,0.07)" />
            </pattern>
            <rect width={W} height={H} fill="url(#oa-dots)" />

            {/* ── Outer track: wide glow ── */}
            <path d={trackPath} fill="none"
              stroke={COLOR_REGIONAL} strokeWidth={14} opacity={0.05} />
            {/* Outer track: main line */}
            <path d={trackPath} fill="none"
              stroke={COLOR_REGIONAL} strokeWidth={3.5} opacity={0.32}
              strokeLinejoin="round" />
            {/* Outer track: bright center line */}
            <path d={trackPath} fill="none"
              stroke={COLOR_REGIONAL} strokeWidth={1.2} opacity={0.55}
              strokeLinejoin="round" />

            {/* ── Inner service zone background ── */}
            <rect
              x={IX1 - 18} y={IY1 - 18}
              width={IX2 - IX1 + 36} height={IY2 - IY1 + 36}
              rx={32}
              fill="rgba(16,36,62,0.42)"
              stroke={`${COLOR_SERVICE}22`}
              strokeWidth={1.5}
            />
            {/* subtle inner grid lines */}
            <rect
              x={IX1 - 18} y={IY1 - 18}
              width={IX2 - IX1 + 36} height={IY2 - IY1 + 36}
              rx={32}
              fill="none"
              stroke={`${COLOR_SERVICE}18`}
              strokeWidth={3}
            />

            {/* ── Relations ── */}
            {visibleRelations.map((rel, ri) => {
              const sp = allPosMap.get(String(rel.source))
              const tp = allPosMap.get(String(rel.target))
              if (!sp || !tp) return null
              const isCrit = Boolean(rel.is_critical)
              const dx = tp.x - sp.x
              const dy = tp.y - sp.y
              const dist = Math.sqrt(dx * dx + dy * dy) || 1
              const nx = -dy / dist
              const ny = dx / dist
              const off = 22 + (ri % 5) * 9
              const qx = (sp.x + tp.x) / 2 + nx * off
              const qy = (sp.y + tp.y) / 2 + ny * off
              return (
                <g key={`rel-${rel.id}`}>
                  {isCrit && (
                    <path
                      d={`M ${sp.x} ${sp.y} Q ${qx} ${qy} ${tp.x} ${tp.y}`}
                      fill="none" stroke="#F97316" strokeWidth={5}
                      strokeLinecap="round" opacity={0.12}
                    />
                  )}
                  <path
                    d={`M ${sp.x} ${sp.y} Q ${qx} ${qy} ${tp.x} ${tp.y}`}
                    fill="none"
                    stroke={isCrit ? '#F97316' : '#94A3B8'}
                    strokeWidth={isCrit ? 2.2 : 1.3}
                    strokeDasharray={isCrit ? '0' : '5 8'}
                    strokeLinecap="round"
                    opacity={isCrit ? 0.85 : 0.5}
                    markerEnd={isCrit ? 'url(#oa-arr-crit)' : 'url(#oa-arr)'}
                  />
                </g>
              )
            })}

            {/* ── Inner service connections (light web) ── */}
            {innerGrided.length > 1 &&
              innerGrided.map((s, i) => {
                if (i === 0) return null
                const p = innerGrided[i - 1]
                return (
                  <line key={`ic-${i}`}
                    x1={p.gx} y1={p.gy} x2={s.gx} y2={s.gy}
                    stroke={COLOR_SERVICE} strokeWidth={2} opacity={0.09}
                  />
                )
              })}

            {/* ── Inner service stations ── */}
            {innerGrided.map((station) => {
              const id = String(station.id)
              const isSel = String(selectedDepartmentId) === id
              const isHov = hoveredId === id
              const isAct = isSel || isHov
              const isDim = Boolean(activeId) && !isAct && !connectedIds.has(id)
              const col = station.line?.color || COLOR_SERVICE
              const nW = Math.max(140, (station.name || '').length * 7.8 + 32)
              const nH = 36
              return (
                <g key={id}
                  transform={`translate(${station.gx},${station.gy})`}
                  style={{ cursor: 'pointer', opacity: isDim ? 0.18 : 1, transition: 'opacity 180ms ease' }}
                  onMouseEnter={() => onHover(id)}
                  onMouseLeave={onLeave}
                  onClick={() => onClick(id)}
                >
                  {/* glow ring */}
                  {isAct && (
                    <rect x={-nW / 2 - 6} y={-nH / 2 - 6} width={nW + 12} height={nH + 12}
                      rx={22} fill={col} opacity={0.18} filter="url(#oa-glow)" />
                  )}
                  {/* pill body */}
                  <rect x={-nW / 2} y={-nH / 2} width={nW} height={nH}
                    rx={18}
                    fill={isAct ? 'rgba(14,33,60,0.95)' : 'rgba(12,28,52,0.9)'}
                    stroke={isAct ? '#FFFFFF' : col}
                    strokeWidth={isAct ? 2.5 : 2}
                  />
                  {/* name */}
                  <text x={0} y={1} textAnchor="middle" dominantBaseline="middle"
                    fill={isAct ? '#FFFFFF' : '#D1FAE5'}
                    fontSize={12.5} fontFamily="Inter, ui-sans-serif, sans-serif" fontWeight={700}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {station.name}
                  </text>
                </g>
              )
            })}

            {/* ── Outer regional stations ── */}
            {outerStations.map((station) => {
              const id = String(station.id)
              const pos = outerPosMap.get(id)
              if (!pos) return null

              const isSel = String(selectedDepartmentId) === id
              const isHov = hoveredId === id
              const isAct = isSel || isHov
              const isDim = Boolean(activeId) && !isAct && !connectedIds.has(id)
              const col = station.line?.color || COLOR_REGIONAL

              // Pill placed inward from the track point
              const PILL_OFFSET = 28
              const px = pos.x + pos.nx * PILL_OFFSET
              const py = pos.y + pos.ny * PILL_OFFSET

              const nW = Math.max(110, (station.name || '').length * 7 + 26)
              const nH = 28

              // Number: placed outward from track
              const numX = pos.x - pos.nx * 14
              const numY = pos.y - pos.ny * 14

              return (
                <g key={id}
                  style={{ cursor: 'pointer', opacity: isDim ? 0.18 : 1, transition: 'opacity 180ms ease' }}
                  onMouseEnter={() => onHover(id)}
                  onMouseLeave={onLeave}
                  onClick={() => onClick(id)}
                >
                  {/* Short tick from track to pill */}
                  <line
                    x1={pos.x} y1={pos.y}
                    x2={px} y2={py}
                    stroke={col} strokeWidth={1.2} opacity={0.45}
                  />

                  {/* Station dot on track */}
                  {isAct && (
                    <circle cx={pos.x} cy={pos.y} r={9}
                      fill={col} opacity={0.2} filter="url(#oa-glow-sm)" />
                  )}
                  <circle cx={pos.x} cy={pos.y}
                    r={isAct ? 6.5 : 4.5}
                    fill={isAct ? '#FFFFFF' : col}
                    stroke={isAct ? col : BG}
                    strokeWidth={1.8}
                    style={{ transition: 'r 180ms ease' }}
                  />

                  {/* Number outside the ring */}
                  <text x={numX} y={numY}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={col} fontSize={8}
                    fontFamily="'JetBrains Mono', 'Fira Mono', monospace"
                    fontWeight={800} opacity={0.65}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {pos.num}
                  </text>

                  {/* Pill — inward side */}
                  {isAct && (
                    <rect x={px - nW / 2 - 5} y={py - nH / 2 - 5}
                      width={nW + 10} height={nH + 10} rx={19}
                      fill={col} opacity={0.18} filter="url(#oa-glow-sm)" />
                  )}
                  <rect x={px - nW / 2} y={py - nH / 2}
                    width={nW} height={nH} rx={14}
                    fill={isAct ? 'rgba(10,24,48,0.95)' : 'rgba(18,34,60,0.88)'}
                    stroke={isAct ? '#FFFFFF' : col}
                    strokeWidth={isAct ? 2 : 1.5}
                  />
                  <text x={px} y={py}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={isAct ? '#FFFFFF' : '#BFDBFE'}
                    fontSize={10.5} fontFamily="Inter, ui-sans-serif, sans-serif" fontWeight={600}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {station.name}
                  </text>
                </g>
              )
            })}
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
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block', background: BG }}>
              {outerStations.map((s) => {
                const p = outerPosMap.get(String(s.id))
                return p ? <circle key={`mo-${s.id}`} cx={p.x} cy={p.y} r="16" fill={COLOR_REGIONAL} /> : null
              })}
              {innerGrided.map((s) => (
                <circle key={`mi-${s.id}`} cx={s.gx} cy={s.gy} r="16" fill={COLOR_SERVICE} />
              ))}
            </svg>
          </MiniMap>
        </div>
      </TransformWrapper>
    </div>
  )
}
