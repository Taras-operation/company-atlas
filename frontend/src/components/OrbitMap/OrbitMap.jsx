import { useMemo, useState } from 'react'
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'

const W = 1400
const H = 1000
const CX = W / 2
const CY = H / 2
const BG = '#0A1626'

// Concentric orbits by type (variant A): service inner, Baing mid, regional outer.
const RS = 165  // service ring radius
const RB = 300  // Baing ring radius
const RR = 430  // regional ring radius
const NR = 15   // node radius

const C_SERVICE = '#F5B301'
const C_REGIONAL = '#22C55E'
const C_BAING = '#3B82F6'
const C_REL = '#8595AC'
const C_CRIT = '#F97316'

function parentIdOf(s) {
  return s.parent_id ?? s.parentId ?? s.parent_department_id ?? null
}
function typeStr(s, line) {
  return String(s.department_type_name || s.department_type || s.type || line?.name || '').toLowerCase()
}
function isRegional(s, line) {
  const t = typeStr(s, line)
  return t.includes('регіон') || t.includes('регион') || t.includes('regional')
}
function isBaing(s, line) {
  const t = typeStr(s, line)
  return /ба[иіїы]нг/.test(t) || t.includes('baing') || t.includes('buying')
}
function geoOf(s) {
  return (Array.isArray(s.geo_names) && s.geo_names.length && s.geo_names[0]) || 'яяя'
}

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls()
  const btn = { width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(148,163,184,0.22)', background: 'rgba(15,23,42,0.92)', color: '#E2E8F0', fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', lineHeight: 1 }
  return (
    <div style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button style={btn} onClick={() => zoomIn()} title="Наблизити">+</button>
      <button style={btn} onClick={() => zoomOut()} title="Віддалити">−</button>
      <button style={{ ...btn, fontSize: 13 }} onClick={() => resetTransform()} title="Скинути">⤢</button>
    </div>
  )
}

export default function OrbitMap({ payload, selectedDepartmentId, setSelectedDepartmentId, setHoveredDepartmentId }) {
  const [hoveredId, setHoveredId] = useState(null)
  const [hoveredChildId, setHoveredChildId] = useState(null)
  const [showSub, setShowSub] = useState(true)
  const [showRel, setShowRel] = useState(true)
  const activeId = hoveredId || selectedDepartmentId

  const { nodes, posMap } = useMemo(() => {
    if (!payload) return { nodes: [], posMap: new Map() }
    const all = []
    payload.lines.forEach((line) => line.stations.forEach((s) => all.push({ ...s, _line: line })))
    const kids = new Map() // parentId -> [child stations]
    all.forEach((s) => { const pid = parentIdOf(s); if (pid != null) { const k = String(pid); if (!kids.has(k)) kids.set(k, []); kids.get(k).push(s) } })
    const roots = all.filter((s) => parentIdOf(s) == null)

    const service = [], baing = [], regional = []
    roots.forEach((s) => {
      if (isRegional(s, s._line)) regional.push(s)
      else if (isBaing(s, s._line)) baing.push(s)
      else service.push(s)
    })
    regional.sort((a, b) => geoOf(a).localeCompare(geoOf(b))) // group same GEO together on the ring

    const out = []
    const place = (arr, radius, color, kind) => {
      const n = arr.length
      arr.forEach((s, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI) * (i / Math.max(1, n))
        const r = n === 1 ? 0 : radius
        const childList = kids.get(String(s.id)) || []
        out.push({
          id: String(s.id), name: s.name, color, kind, station: s,
          x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r,
          children: childList.length, childList,
        })
      })
    }
    place(service, RS, C_SERVICE, 'service')
    place(baing, RB, C_BAING, 'baing')
    place(regional, RR, C_REGIONAL, 'regional')
    return { nodes: out, posMap: new Map(out.map((nd) => [nd.id, nd])) }
  }, [payload])

  const connectedIds = useMemo(() => {
    const set = new Set()
    if (!payload || !activeId) return set
    payload.relations.forEach((r) => {
      if (String(r.source) === String(activeId)) set.add(String(r.target))
      if (String(r.target) === String(activeId)) set.add(String(r.source))
    })
    return set
  }, [payload, activeId])

  const visibleRelations = useMemo(() => {
    if (!payload || !showRel) return []
    if (activeId) return payload.relations.filter((r) => String(r.source) === String(activeId) || String(r.target) === String(activeId))
    return payload.relations.filter((r) => r.is_critical || String(r.strength || '').toLowerCase() === 'high')
  }, [payload, activeId, showRel])

  const onHover = (id) => { setHoveredId(id); setHoveredDepartmentId?.(id) }
  const onLeave = () => { setHoveredId(null); setHoveredDepartmentId?.(null) }

  const relStyle = (r, hot) => {
    if (r.is_critical) return { stroke: C_CRIT, width: hot ? 2.4 : 1.6, dash: '', op: hot ? 0.85 : 0.5 }
    const s = String(r.strength || '').toLowerCase()
    if (s === 'high') return { stroke: C_REL, width: hot ? 2 : 1.4, dash: '', op: hot ? 0.7 : 0.4 }
    if (s === 'medium' || s === 'middle') return { stroke: C_REL, width: hot ? 1.8 : 1.2, dash: '7 6', op: hot ? 0.6 : 0.3 }
    return { stroke: C_REL, width: 1.1, dash: '2 6', op: hot ? 0.5 : 0.28 }
  }

  return (
    <div style={{ width: '100%', height: '100%', background: BG }}>
      <TransformWrapper minScale={0.3} maxScale={2.6} initialScale={0.72} wheel={{ smoothStep: 0.07 }} doubleClick={{ disabled: true }} centerOnInit>
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            <defs>
              <filter id="o-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="6" /></filter>
              <radialGradient id="og-service" cx="42%" cy="38%" r="65%"><stop offset="0%" stopColor="#FDE68A" /><stop offset="100%" stopColor="#D97706" /></radialGradient>
              <radialGradient id="og-regional" cx="42%" cy="38%" r="65%"><stop offset="0%" stopColor="#86EFAC" /><stop offset="100%" stopColor="#15803D" /></radialGradient>
              <radialGradient id="og-baing" cx="42%" cy="38%" r="65%"><stop offset="0%" stopColor="#93C5FD" /><stop offset="100%" stopColor="#1D4ED8" /></radialGradient>
            </defs>

            <rect width={W} height={H} fill={BG} onClick={() => setSelectedDepartmentId(null)} />
            <pattern id="o-dots" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="17" cy="17" r="0.8" fill="rgba(148,163,184,0.06)" /></pattern>
            <rect width={W} height={H} fill="url(#o-dots)" style={{ pointerEvents: 'none' }} />

            {/* orbit guide rings */}
            {[[RS, C_SERVICE], [RB, C_BAING], [RR, C_REGIONAL]].map(([r, c]) => (
              <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke={c} strokeWidth={1} opacity={0.12} strokeDasharray="3 7" />
            ))}
            {/* HQ core */}
            <circle cx={CX} cy={CY} r={16} fill="rgba(255,255,255,0.06)" />
            <circle cx={CX} cy={CY} r={7} fill="#FFFFFF" opacity={0.85} />

            {/* connections */}
            {visibleRelations.map((r) => {
              const a = posMap.get(String(r.source)); const b = posMap.get(String(r.target))
              if (!a || !b) return null
              const hot = Boolean(activeId)
              const st = relStyle(r, hot)
              return <line key={`rel-${r.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} opacity={st.op} strokeLinecap="round" />
            })}

            {/* nodes */}
            {nodes.map((nd) => {
              const isSel = String(selectedDepartmentId) === nd.id
              const isHov = hoveredId === nd.id
              const isAct = isSel || isHov
              const isDim = Boolean(activeId) && !isAct && !connectedIds.has(nd.id)
              const nr = isAct ? NR + 3 : NR
              const rx = nr + 26, ry = nr + 15
              return (
                <g key={nd.id} style={{ opacity: isDim ? 0.2 : (isAct ? 1 : 0.8), transition: 'opacity 150ms' }}>
                  {/* sub-departments as orbiting planets — clickable, name on hover */}
                  {showSub && nd.childList.length > 0 && (
                    <g>
                      <ellipse cx={nd.x} cy={nd.y} rx={rx} ry={ry} fill="none" stroke={nd.color} strokeWidth={1} opacity={0.4} />
                      {nd.childList.slice(0, 14).map((kid, k, arr) => {
                        const pa = (2 * Math.PI) * (k / arr.length) - Math.PI / 2
                        const px = nd.x + Math.cos(pa) * rx, py = nd.y + Math.sin(pa) * ry
                        const kid_id = String(kid.id)
                        const kh = hoveredChildId === kid_id
                        return (
                          <g key={kid_id} style={{ cursor: 'pointer' }}
                            onMouseEnter={() => { setHoveredChildId(kid_id); setHoveredDepartmentId?.(kid_id) }}
                            onMouseLeave={() => { setHoveredChildId(null); setHoveredDepartmentId?.(null) }}
                            onClick={(e) => { e.stopPropagation(); setSelectedDepartmentId(kid_id) }}>
                            <circle cx={px} cy={py} r={11} fill="transparent" />
                            <circle cx={px} cy={py} r={kh ? 7 : 5} fill={nd.color} stroke={kh ? '#FFFFFF' : 'rgba(10,22,38,0.6)'} strokeWidth={kh ? 2 : 1} />
                            {kh && (
                              <text x={px} y={py - 13} textAnchor="middle" fill="#FFFFFF" fontSize={11.5} fontWeight={800} fontFamily="Inter, sans-serif"
                                style={{ paintOrder: 'stroke', stroke: BG, strokeWidth: 3.5, strokeLinejoin: 'round', pointerEvents: 'none' }}>{kid.name}</text>
                            )}
                          </g>
                        )
                      })}
                    </g>
                  )}
                  {/* the department orb (separate group so planet clicks aren't captured) */}
                  <g style={{ cursor: 'pointer' }}
                    onMouseEnter={() => onHover(nd.id)} onMouseLeave={onLeave}
                    onClick={(e) => { e.stopPropagation(); setSelectedDepartmentId(nd.id) }}>
                  {/* glow halo */}
                  <circle cx={nd.x} cy={nd.y} r={nr + 12} fill={nd.color} opacity={isAct ? 0.4 : 0.22} filter="url(#o-glow)" />
                  {/* orb body */}
                  <circle cx={nd.x} cy={nd.y} r={nr} fill={`url(#og-${nd.kind})`} stroke={isSel ? '#FFFFFF' : nd.color} strokeWidth={isSel ? 3 : 1.5} />
                  {/* sub-dept count */}
                  {nd.children > 0 && (
                    <text x={nd.x} y={nd.y + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#0A1626" fontSize={13} fontWeight={900} fontFamily="Inter, sans-serif" style={{ pointerEvents: 'none' }}>{nd.children}</text>
                  )}
                  {/* label */}
                  <text x={nd.x} y={nd.y + nr + 22} textAnchor="middle" fill={isAct ? '#FFFFFF' : '#DCE4EE'} fontSize={13} fontWeight={isAct ? 800 : 700} fontFamily="Inter, sans-serif"
                    style={{ paintOrder: 'stroke', stroke: BG, strokeWidth: 3.5, strokeLinejoin: 'round', pointerEvents: 'none' }}>
                    {nd.name}
                  </text>
                  </g>
                </g>
              )
            })}
          </svg>
        </TransformComponent>

        <ZoomControls />

        {/* legend */}
        <div style={{ position: 'absolute', left: 16, top: 16, zIndex: 30, display: 'flex', gap: 14, alignItems: 'center', background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 10, padding: '8px 14px', backdropFilter: 'blur(8px)', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700 }}>
          {[['Сервісні', C_SERVICE], ['Баинг', C_BAING], ['Регіональні', C_REGIONAL]].map(([t, c]) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#CBD5E1' }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}` }} />{t}
            </span>
          ))}
        </div>

        {/* display toggles */}
        <div style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 30, display: 'flex', gap: 6, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 9, padding: 4, backdropFilter: 'blur(8px)' }}>
          {[['Підвідділи', showSub, setShowSub], ["Зв'язки", showRel, setShowRel]].map(([label, val, set]) => (
            <button key={label} onClick={() => set((v) => !v)}
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', borderRadius: 7, background: val ? 'rgba(59,130,246,0.22)' : 'transparent', color: val ? '#93C5FD' : '#64748B' }}>
              {label}
            </button>
          ))}
        </div>
      </TransformWrapper>
    </div>
  )
}
