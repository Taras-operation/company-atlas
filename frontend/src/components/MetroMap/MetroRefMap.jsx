import { useMemo, useRef, useState } from 'react'
import { MiniMap, TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'

const BG = '#0B1524'
const W = 1900
const H = 1300
const CX = W / 2
const CY = H / 2

const LINE_COLORS = [
  '#4FA8F7', '#34D399', '#F59E0B', '#A855F7', '#F472B6', '#22D3EE',
  '#EF4444', '#F97316', '#84CC16', '#8B5CF6', '#EAB308', '#FB7185',
]

// 8 octolinear unit directions (N, NE, E, SE, S, SW, W, NW)
const S2 = Math.SQRT1_2
const DIRS8 = [
  [0, -1], [S2, -S2], [1, 0], [S2, S2],
  [0, 1], [-S2, S2], [-1, 0], [-S2, -S2],
]


function getType(station, line) {
  return String(station.department_type_name || station.department_type || line?.name || '').toLowerCase()
}
function isRegional(station, line) {
  const t = getType(station, line)
  return t.includes('регіон') || t.includes('регион') || t.includes('regional')
}
function parentIdOf(s) {
  return s.parent_id ?? s.parentId ?? s.parent_department_id ?? null
}
function geoKeyOf(s) {
  if (Array.isArray(s.geo_names) && s.geo_names.length) return s.geo_names[0]
  return null
}

// SVG path through points with rounded corners (metro-style)
function roundedPath(points, radius) {
  if (!points.length) return ''
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const p0 = points[i - 1], p1 = points[i], p2 = points[i + 1]
    const v1x = p1.x - p0.x, v1y = p1.y - p0.y
    const v2x = p2.x - p1.x, v2y = p2.y - p1.y
    const l1 = Math.hypot(v1x, v1y) || 1
    const l2 = Math.hypot(v2x, v2y) || 1
    const r = Math.min(radius, l1 / 2, l2 / 2)
    const ax = p1.x - (v1x / l1) * r, ay = p1.y - (v1y / l1) * r
    const bx = p1.x + (v2x / l2) * r, by = p1.y + (v2y / l2) * r
    d += ` L ${ax} ${ay} Q ${p1.x} ${p1.y} ${bx} ${by}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy || 1
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx, cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

// Insert waypoints into a base polyline at their nearest segment (ordered).
function withWaypoints(base, wps) {
  if (!base || base.length < 2 || !wps || !wps.length) return base
  const grouped = {}
  wps.forEach((w) => {
    let bestI = 0, bestD = Infinity
    for (let i = 0; i < base.length - 1; i += 1) {
      const d = distToSeg(w, base[i], base[i + 1])
      if (d < bestD) { bestD = d; bestI = i }
    }
    ;(grouped[bestI] = grouped[bestI] || []).push(w)
  })
  const res = []
  for (let i = 0; i < base.length; i += 1) {
    res.push(base[i])
    if (grouped[i]) {
      grouped[i].sort((u, v) => Math.hypot(u.x - base[i].x, u.y - base[i].y) - Math.hypot(v.x - base[i].x, v.y - base[i].y))
      grouped[i].forEach((w) => res.push(w))
    }
  }
  return res
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

export default function MetroRefMap({ payload, selectedDepartmentId, setSelectedDepartmentId, setHoveredDepartmentId, layoutMode = 'geo', constructorMode = false, constructorTool = 'move', geometry = {}, onSaveGeometry, onSavePosition, onResetPosition, selectedConstructorElement, onSelectConstructorElement }) {
  const [hoveredId, setHoveredId] = useState(null)
  const [overrides, setOverrides] = useState({}) // live drag positions {id:{x,y}}
  const [expandedId, setExpandedId] = useState(null) // ring station whose sub-departments are popped out
  const [hoveredRelId, setHoveredRelId] = useState(null) // relation hovered directly
  const svgRef = useRef(null)
  const dragRef = useRef(null) // {id}
  const activeId = hoveredId || selectedDepartmentId

  // Manual station positions are stored per-layout inside the geometry JSON.
  const manualPos = geometry?.positions || {}

  // Effective position: live drag override → branch slot → saved manual →
  // follow parent's movement (carry sub-departments) → computed.
  const effPos = (id, cx, cy) => {
    const key = String(id)
    if (overrides[key]) return overrides[key]
    const sb = stationBranchMap[key]
    if (sb) return branchStationPos(sb.branch, sb.idx, sb.total)
    if (manualPos[key]) return manualPos[key]
    // Move a station and its whole subtree moves with it: walk up the parent chain
    // accumulating the offset until we reach an ancestor with an explicit position.
    // Iterative + visited-guard so a malformed (cyclic) parent chain can't loop forever.
    const self = positions.get(key)
    if (!self) return { x: cx, y: cy }
    let dx = 0, dy = 0
    let cur = self
    const seen = new Set([key])
    while (true) {
      const pid = parentIdOf(cur.station)
      if (pid == null) break
      const pk = String(pid)
      if (seen.has(pk)) break
      const par = positions.get(pk)
      if (!par) break
      dx += cur.x - par.x
      dy += cur.y - par.y
      if (overrides[pk]) return { x: overrides[pk].x + dx, y: overrides[pk].y + dy }
      const psb = stationBranchMap[pk]
      if (psb) { const bp = branchStationPos(psb.branch, psb.idx, psb.total); return { x: bp.x + dx, y: bp.y + dy } }
      if (manualPos[pk]) return { x: manualPos[pk].x + dx, y: manualPos[pk].y + dy }
      seen.add(pk)
      cur = par
    }
    return { x: cx, y: cy }
  }

  const clientToSvg = (clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const m = svg.getScreenCTM()
    if (!m) return null
    const p = pt.matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  const waypoints = geometry?.waypoints || {}
  const branches = geometry?.branches || [] // [{id, color, anchor:{x,y}, end:{x,y}, lineId, stationIds:[]}]

  // Map station -> branch (if attached to one)
  const stationBranchMap = useMemo(() => {
    const m = {}
    branches.forEach((b) => (b.stationIds || []).forEach((sid, idx) => {
      m[String(sid)] = { branch: b, idx, total: b.stationIds.length }
    }))
    return m
  }, [branches])

  // Get current effective end-point for a branch (with live drag override)
  const branchEnd = (b) => overrides[`bend:${b.id}`] || b.end

  // Compute station position along a branch (evenly spaced from anchor to end)
  const branchStationPos = (b, idx, total) => {
    const e = branchEnd(b)
    const t = total === 1 ? 1 : (idx + 1) / (total + 1) * 0.7 + 0.3 // 30%..100%
    return { x: b.anchor.x + (e.x - b.anchor.x) * t, y: b.anchor.y + (e.y - b.anchor.y) * t }
  }

  const onStationPointerDown = (e, id) => {
    if (!constructorMode || constructorTool !== 'move') return
    e.stopPropagation()
    dragRef.current = { type: 'station', key: String(id) }
  }
  const onWpPointerDown = (e, lineId, idx) => {
    if (!constructorMode || constructorTool !== 'turn') return
    e.stopPropagation()
    dragRef.current = { type: 'wp', key: `wp:${lineId}:${idx}`, lineId, idx }
  }
  const onSvgPointerMove = (e) => {
    if (!dragRef.current) return
    const key = dragRef.current.key // capture now — dragRef.current may be null by the time the updater runs
    const p = clientToSvg(e.clientX, e.clientY)
    if (p && key) setOverrides((o) => ({ ...o, [key]: p }))
  }
  const onSvgPointerUp = () => {
    const d = dragRef.current
    if (d) {
      const pos = overrides[d.key]
      if (pos) {
        if (d.type === 'station') {
          // try to attach to a branch first
          const attached = tryAttachStationToBranch(d.key, pos.x, pos.y)
          if (!attached && onSaveGeometry) {
            onSaveGeometry({ ...geometry, positions: { ...manualPos, [d.key]: { x: pos.x, y: pos.y } } })
          }
          setOverrides((o) => { const n = { ...o }; delete n[d.key]; return n })
        } else if (d.type === 'wp' && onSaveGeometry) {
          const arr = [...(waypoints[d.lineId] || [])]
          arr[d.idx] = { x: pos.x, y: pos.y }
          onSaveGeometry({ ...geometry, waypoints: { ...waypoints, [d.lineId]: arr } })
          setOverrides((o) => { const n = { ...o }; delete n[d.key]; return n })
        } else if (d.type === 'bend' && onSaveGeometry) {
          const next = branches.map((b) => b.id === d.branchId ? { ...b, end: { x: pos.x, y: pos.y } } : b)
          onSaveGeometry({ ...geometry, branches: next })
          setOverrides((o) => { const n = { ...o }; delete n[d.key]; return n })
        }
      }
    }
    dragRef.current = null
  }

  const addWaypoint = (e, lineId) => {
    if (!(constructorMode && constructorTool === 'turn') || !onSaveGeometry) return
    e.stopPropagation()
    const p = clientToSvg(e.clientX, e.clientY)
    if (!p) return
    onSaveGeometry({ ...geometry, waypoints: { ...waypoints, [lineId]: [...(waypoints[lineId] || []), { x: p.x, y: p.y }] } })
  }
  const deleteWaypoint = (lineId, idx) => {
    if (!onSaveGeometry) return
    const arr = [...(waypoints[lineId] || [])]
    arr.splice(idx, 1)
    onSaveGeometry({ ...geometry, waypoints: { ...waypoints, [lineId]: arr } })
  }
  const wpEff = (lineId, idx, w) => overrides[`wp:${lineId}:${idx}`] || w

  const onBranchEndPointerDown = (e, branchId) => {
    if (!constructorMode || constructorTool !== 'branch') return
    e.stopPropagation()
    dragRef.current = { type: 'bend', key: `bend:${branchId}`, branchId }
  }

  const addBranch = (e, lineId, color) => {
    if (!(constructorMode && constructorTool === 'branch') || !onSaveGeometry) return
    e.stopPropagation()
    const p = clientToSvg(e.clientX, e.clientY)
    if (!p) return
    // end point: offset 160 perpendicular-ish (just down-right by default — user will drag)
    const end = { x: p.x + 180, y: p.y + 120 }
    const newBranch = {
      id: `br_${Date.now()}`,
      lineId,
      color: color || '#94A3B8',
      anchor: { x: p.x, y: p.y },
      end,
      stationIds: [],
    }
    onSaveGeometry({ ...geometry, branches: [...branches, newBranch] })
  }

  const deleteBranch = (branchId) => {
    if (!onSaveGeometry) return
    onSaveGeometry({ ...geometry, branches: branches.filter((b) => b.id !== branchId) })
  }

  // When dragging a station in move-mode, check if dropped near a branch — attach.
  const tryAttachStationToBranch = (stationId, dropX, dropY) => {
    // find nearest branch within threshold
    let best = null, bestD = Infinity
    branches.forEach((b) => {
      const e = branchEnd(b)
      // dist to segment anchor→end
      const d = distToSeg({ x: dropX, y: dropY }, b.anchor, e)
      if (d < bestD) { bestD = d; best = b }
    })
    if (!best || bestD > 60) return false
    // remove from any branch first
    const next = branches.map((b) => ({ ...b, stationIds: (b.stationIds || []).filter((sid) => String(sid) !== String(stationId)) }))
    const target = next.find((b) => b.id === best.id)
    target.stationIds = [...(target.stationIds || []), String(stationId)]
    onSaveGeometry({ ...geometry, branches: next })
    return true
  }

  const detachStationFromBranch = (stationId) => {
    if (!onSaveGeometry) return
    const next = branches.map((b) => ({ ...b, stationIds: (b.stationIds || []).filter((sid) => String(sid) !== String(stationId)) }))
    onSaveGeometry({ ...geometry, branches: next })
  }

  const childrenByParent = useMemo(() => {
    const byParent = new Map()
    if (payload) {
      payload.lines.forEach((line) => {
        line.stations.forEach((s) => {
          const pid = parentIdOf(s)
          if (pid != null) {
            const k = String(pid)
            if (!byParent.has(k)) byParent.set(k, [])
            byParent.get(k).push(s)
          }
        })
      })
    }
    return byParent
  }, [payload])
  const childrenOf = (id) => childrenByParent.get(String(id)) || []

  // Gather a station + every descendant (for "delete station incl. sub-departments").
  const gatherSubtree = (id) => {
    const out = [String(id)]
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()
      childrenOf(cur).forEach((k) => { out.push(String(k.id)); stack.push(k.id) })
    }
    return out
  }
  const eraseLine = (lineId) => {
    if (!onSaveGeometry) return
    const ids = []
    positions.forEach((p) => { if (p.lineId === lineId) ids.push(...gatherSubtree(p.station.id)) })
    const hidden = Array.from(new Set([...(geometry.hidden || []).map(String), ...ids]))
    onSaveGeometry({ ...geometry, hidden })
  }

  // Build line groups depending on mode
  const lineGroups = useMemo(() => {
    if (!payload) return []

    if (layoutMode === 'type') {
      // each payload line (type) = one line; stations = roots; children branch off
      return payload.lines
        .map((line, i) => ({
          id: line.id ?? `t-${i}`,
          name: line.name,
          color: line.color || LINE_COLORS[i % LINE_COLORS.length],
          roots: line.stations.filter((s) => parentIdOf(s) == null),
          withBranches: true,
        }))
        .filter((g) => g.roots.length > 0)
    }

    // GEO mode: group REGIONAL roots by their GEO; each GEO = a line.
    const geoMap = new Map()
    const otherByType = new Map()
    payload.lines.forEach((line) => {
      line.stations.forEach((s) => {
        if (parentIdOf(s) != null) return
        if (isRegional(s, line)) {
          const gk = geoKeyOf(s) || 'Без GEO'
          if (!geoMap.has(gk)) geoMap.set(gk, [])
          geoMap.get(gk).push(s)
        } else {
          const key = line.name || 'Інші'
          if (!otherByType.has(key)) otherByType.set(key, { name: key, color: line.color, roots: [] })
          otherByType.get(key).roots.push(s)
        }
      })
    })

    const groups = []
    let ci = 0
    Array.from(geoMap.entries()).forEach(([geoName, roots]) => {
      groups.push({ id: `geo-${geoName}`, name: geoName, color: LINE_COLORS[ci % LINE_COLORS.length], roots, chainChildren: true })
      ci += 1
    })
    Array.from(otherByType.values()).forEach((g) => {
      groups.push({ id: `svc-${g.name}`, name: g.name, color: g.color || LINE_COLORS[ci % LINE_COLORS.length], roots: g.roots, isService: true })
      ci += 1
    })
    return groups
  }, [payload, layoutMode])

  const { positions, rays } = useMemo(() => {
    const pos = new Map()
    const rayPaths = []
    const N = Math.max(1, lineGroups.length)
    const hidden = new Set((geometry?.hidden || []).map(String))

    // The line name is anchored to the LAST station of the line (its outward direction),
    // so it sits at that station's edge and follows it when moved in the constructor.
    const makeNameAnchor = (sIds, fdrs) => {
      let aid = sIds && sIds.length ? sIds[sIds.length - 1] : null
      if (aid == null && fdrs && fdrs.length) {
        const last = fdrs[fdrs.length - 1]
        aid = last && last.ids && last.ids.length ? last.ids[last.ids.length - 1] : null
      }
      const ap = aid != null ? pos.get(String(aid)) : null
      return ap ? { id: String(aid), dx: ap.dx || 0, dy: ap.dy || 0 } : null
    }

    // ===== TYPE MODE: each type = one line to its own side (comb / vertical) =====
    if (layoutMode === 'type') {
      const SIDES = [
        { k: 'up' }, { k: 'right' }, { k: 'left' }, { k: 'down' },
        { k: 'ne' }, { k: 'nw' }, { k: 'se' }, { k: 'sw' },
      ]
      const VSTEP = 86
      const HSTEP = 96
      const SPINE_X = 600
      const SPINE_Y = 480
      const BRANCH = 64

      lineGroups.forEach((g, gi) => {
        const side = SIDES[gi % SIDES.length].k
        const roots = g.roots.filter((s) => !hidden.has(String(s.id)))
        const n = roots.length
        if (!n) return // whole line deleted
        const trunk = []     // thick main line segments
        const feeders = []   // diagonal feeder segments {attach, ids} drawn through live positions
        const spineIds = []  // ordered station ids that form the straight spine (up/down/diagonal)
        let pts = []         // computed straight spine (fallback / minimap)
        let nameAt = null

        const placeChildren = (root, x, y, perp) => {
          childrenOf(root.id).filter((k) => !hidden.has(String(k.id))).forEach((kid, ki) => {
            const bx = x + perp[0] * BRANCH * (ki + 1)
            const by = y + perp[1] * BRANCH * (ki + 1)
            pos.set(String(kid.id), { x: bx, y: by, color: g.color, station: kid, dx: perp[0], dy: perp[1], isRoot: false, branchFrom: { x, y } })
          })
        }

        if (side === 'up' || side === 'down') {
          const sgn = side === 'up' ? -1 : 1
          pts = [{ x: CX, y: CY }]
          roots.forEach((s, i) => {
            const x = CX
            const y = CY + sgn * (150 + i * HSTEP)
            pos.set(String(s.id), { x, y, color: g.color, station: s, dx: 1, dy: 0, isRoot: true, lineId: g.id })
            pts.push({ x, y })
            spineIds.push(String(s.id))
            placeChildren(s, x, y, [1, 0])
          })
          if (pts.length) nameAt = { x: CX, y: pts[pts.length - 1].y + sgn * 34 }
        } else if (side === 'left' || side === 'right') {
          // Short trunk from hub, then diagonal branches (≈35°) alternating up/down,
          // each branch carrying up to 4 stations.
          const sgn = side === 'right' ? 1 : -1
          const ANG = 32 * Math.PI / 180
          const dCos = Math.cos(ANG)
          const dSin = Math.sin(ANG)
          const SSTEP = 92          // spacing between stations along a branch
          const ATTACH0 = 150       // first branch attaches this far from hub
          const ATTACH_GAP = 150    // gap between successive attach points along trunk
          const chunks = []
          for (let k = 0; k < n; k += 4) chunks.push(roots.slice(k, k + 4))

          let lastAttachX = CX
          chunks.forEach((chunk, cj) => {
            const attachX = CX + sgn * (ATTACH0 + cj * ATTACH_GAP)
            lastAttachX = attachX
            const goUp = cj % 2 === 0
            const dir = [sgn * dCos, goUp ? -dSin : dSin]
            const attach = { x: attachX, y: CY }
            const feederIds = []
            chunk.forEach((s, i) => {
              const x = attachX + dir[0] * (40 + i * SSTEP)
              const y = CY + dir[1] * (40 + i * SSTEP)
              pos.set(String(s.id), { x, y, color: g.color, station: s, dx: dir[0], dy: dir[1], isRoot: true, lineId: g.id })
              feederIds.push(String(s.id))
              // children fan OUTWARD (away from centre) + outward horizontally, so they never overlap other branches
              const away = goUp ? -1 : 1
              placeChildren(s, x, y, [sgn * 0.5, away])
            })
            feeders.push({ attach, ids: feederIds }) // diagonal branch, drawn live through stations
          })
          // thick horizontal trunk hub -> last attach point
          trunk.push([{ x: CX, y: CY }, { x: lastAttachX, y: CY }])
          // line name sits below the trunk, near the outer end (cleaner than floating mid-air)
          nameAt = { x: lastAttachX + sgn * 30, y: CY + 70 }
        } else {
          const dmap = { ne: [S2, -S2], nw: [-S2, -S2], se: [S2, S2], sw: [-S2, S2] }
          const d = dmap[side]
          pts = [{ x: CX, y: CY }]
          roots.forEach((s, i) => {
            const x = CX + d[0] * (150 + i * HSTEP)
            const y = CY + d[1] * (150 + i * HSTEP)
            pos.set(String(s.id), { x, y, color: g.color, station: s, dx: d[0], dy: d[1], isRoot: true, lineId: g.id })
            pts.push({ x, y })
            spineIds.push(String(s.id))
            placeChildren(s, x, y, [-d[1], d[0]])
          })
          if (pts.length) nameAt = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y - 22 }
        }

        rayPaths.push({ id: g.id, name: g.name, color: g.color, points: pts, trunk, feeders, spineIds, nameAt, nameAnchor: makeNameAnchor(spineIds, feeders) })
      })

      return { positions: pos, rays: rayPaths }
    }

    // ===== GEO MODE: radial zig-zag lines from HQ; sub-departments hang off as small branches =====
    const STEP = 92
    const START = 150
    const GEO_BRANCH = 54 // sub-department branch step (smaller than the main spine)

    // Regional lines: sub-departments as a small branch off the root (always visible).
    // faint=true renders the branch at 50% opacity until the parent/child is active.
    const placeGeoChildren = (root, x, y, perp, color, faint = false) => {
      childrenOf(root.id).filter((k) => !hidden.has(String(k.id))).forEach((kid, ki) => {
        const bx = x + perp[0] * GEO_BRANCH * (ki + 1)
        const by = y + perp[1] * GEO_BRANCH * (ki + 1)
        pos.set(String(kid.id), { x: bx, y: by, color, station: kid, dx: perp[0], dy: perp[1], isRoot: false, branchFrom: { x, y }, faint })
      })
    }

    // Ring lines (Сервісний / Баинг): sub-departments are hidden until the parent is
    // clicked, then they pop out in a small circle around it.
    const placeRingChildren = (root, x, y, color) => {
      const kids = childrenOf(root.id).filter((k) => !hidden.has(String(k.id)))
      if (String(root.id) !== String(expandedId) || !kids.length) return
      const rr = 46 + Math.min(28, kids.length * 3)
      const stepA = (2 * Math.PI) / kids.length
      kids.forEach((kid, ki) => {
        const a = ki * stepA - Math.PI / 2
        const ux = Math.cos(a), uy = Math.sin(a)
        pos.set(String(kid.id), { x: x + ux * rr, y: y + uy * rr, color, station: kid, dx: ux, dy: uy, isRoot: false, branchFrom: { x, y } })
      })
    }

    // Functional (non-regional) lines wrap around HQ as full concentric rings. Each ring is
    // placed on a radius slot HALFWAY BETWEEN regional station rings (so ring stations never
    // share a radius with spoke stations), and gets its own angular phase (so its stations
    // don't sit on the spokes and don't line up radially with the other rings). Fixed order:
    // Баинг innermost, Сервісний next, then the rest. As stations grow, a ring jumps to the
    // next free slot — rings never overlap and stay grabbable in the constructor.
    const ringInfoById = {}
    {
      const MIN_SPACING = 58
      const slotR = (k) => START + STEP * (k + 0.5) // between the regional station rings
      const ringOrder = (name) => {
        const t = (name || '').toLowerCase()
        if (/ба[иіїы]нг/.test(t) || t.includes('baing') || t.includes('buying')) return 0
        if (t.includes('сервіс') || t.includes('сервис') || t.includes('service')) return 1
        return 2
      }
      const svc = lineGroups
        .filter((g) => g.isService)
        .map((g) => ({ id: g.id, n: g.roots.filter((s) => !hidden.has(String(s.id))).length, ord: ringOrder(g.name), name: g.name || '' }))
        .filter((x) => x.n > 0)
        .sort((a, b) => (a.ord - b.ord) || (a.n - b.n) || a.name.localeCompare(b.name))
      let slot = 0
      svc.forEach(({ id, n }, ringIdx) => {
        while ((2 * Math.PI * slotR(slot)) / n < MIN_SPACING) slot += 1 // enough room for this ring's stations
        ringInfoById[id] = { R: slotR(slot), startA: -Math.PI / 2 + 0.22 + ringIdx * 0.5 }
        slot += 1
      })
    }

    lineGroups.forEach((g, gi) => {
      const baseDir = Math.round((gi * 8) / N) % 8
      // Only ROOT departments form the main spine; their sub-departments branch off.
      const roots = g.roots.filter((s) => !hidden.has(String(s.id)))
      const count = roots.length
      if (!count) return // whole line deleted
      const isBaing = /ба[иіїы]нг|baing|buying/.test((g.name || '').toLowerCase())
      const isRing = Boolean(g.isService) && !isBaing
      let pts = isRing ? [] : [{ x: CX, y: CY }]
      const spineIds = roots.map((s) => String(s.id))

      if (isBaing) {
        // Баинг: L-shaped line — up to 3 stations LEFT from HQ, then 90° UP for the rest.
        const LEFT_N = Math.min(3, count)
        const cornerX = CX - (START + (LEFT_N - 1) * STEP)
        roots.forEach((s, i) => {
          let x, y, dx, dy
          if (i < LEFT_N) { x = CX - (START + i * STEP); y = CY; dx = 0; dy = -1 } // left arm
          else { x = cornerX; y = CY - STEP * (i - LEFT_N + 1); dx = -1; dy = 0 }  // up arm
          pos.set(String(s.id), { x, y, color: g.color, station: s, dx, dy, isRoot: true, lineId: g.id })
          pts.push({ x, y })
          // sub-departments as a faint branch (full opacity on hover/select), same as service
          placeGeoChildren(s, x, y, [dx, dy], g.color, true)
        })
      } else if (g.isService) {
        // Big ring => "stadium" (racetrack): straight top & bottom, rounded ends with 3
        // stations each. Small ring => oval. Both centred on HQ; sub-depts branch outward.
        const info = ringInfoById[g.id] || { R: 200, startA: -Math.PI / 2 }
        const ASPECT = 0.42 // vertical extent relative to horizontal (flatter than circle)
        const slots = []
        if (count >= 8) {
          const perTurn = 3
          const straight = Math.max(0, count - 2 * perTurn)
          const topN = Math.ceil(straight / 2)
          const botN = straight - topN
          const H = info.R * ASPECT       // turn radius / vertical half-height
          // widen the straights so labels along the top/bottom don't collide
          const W = Math.max(info.R * 0.92, 80 * Math.max(topN, botN, 1))
          for (let i = 0; i < topN; i += 1) { const x = CX - W + 2 * W * ((i + 0.5) / topN); slots.push({ x, y: CY - H, dx: 0, dy: -1 }) }
          for (let j = 0; j < perTurn; j += 1) { const a = -Math.PI / 2 + Math.PI * ((j + 0.5) / perTurn); slots.push({ x: CX + W + H * Math.cos(a), y: CY + H * Math.sin(a), dx: Math.cos(a), dy: Math.sin(a) }) }
          for (let i = 0; i < botN; i += 1) { const x = CX + W - 2 * W * ((i + 0.5) / botN); slots.push({ x, y: CY + H, dx: 0, dy: 1 }) }
          for (let j = 0; j < perTurn; j += 1) { const a = Math.PI / 2 + Math.PI * ((j + 0.5) / perTurn); slots.push({ x: CX - W + H * Math.cos(a), y: CY + H * Math.sin(a), dx: Math.cos(a), dy: Math.sin(a) }) }
        } else {
          const rx = info.R, ry = info.R * ASPECT
          const step = (2 * Math.PI) / count
          for (let i = 0; i < count; i += 1) {
            const a = info.startA + i * step
            const nx = Math.cos(a) / rx, ny = Math.sin(a) / ry, nl = Math.hypot(nx, ny) || 1
            slots.push({ x: CX + Math.cos(a) * rx, y: CY + Math.sin(a) * ry, dx: nx / nl, dy: ny / nl })
          }
        }
        roots.forEach((s, i) => {
          const sl = slots[i] || slots[slots.length - 1] || { x: CX, y: CY, dx: 0, dy: -1 }
          pos.set(String(s.id), { x: sl.x, y: sl.y, color: g.color, station: s, dx: sl.dx, dy: sl.dy, isRoot: true, lineId: g.id })
          pts.push({ x: sl.x, y: sl.y })
          // sub-departments as a faint branch radiating outward (full opacity on hover/select)
          placeGeoChildren(s, sl.x, sl.y, [sl.dx, sl.dy], g.color, true)
        })
      } else {
        const BEND_EVERY = 3
        let di = baseDir
        let turnSign = 1
        let x = CX + DIRS8[di][0] * START
        let y = CY + DIRS8[di][1] * START
        roots.forEach((s, i) => {
          const dirVec = DIRS8[di]
          pos.set(String(s.id), { x, y, color: g.color, station: s, dx: dirVec[0], dy: dirVec[1], isRoot: true, lineId: g.id })
          pts.push({ x, y })
          placeGeoChildren(s, x, y, [-dirVec[1], dirVec[0]], g.color)
          const isLast = i === count - 1
          if (!isLast && count > BEND_EVERY && (i + 1) % BEND_EVERY === 0) {
            const cx = x + DIRS8[di][0] * STEP * 0.55
            const cy = y + DIRS8[di][1] * STEP * 0.55
            pts.push({ x: cx, y: cy })
            di = (di + turnSign * 1 + 8) % 8
            turnSign *= -1
            x = cx + DIRS8[di][0] * STEP * 0.55
            y = cy + DIRS8[di][1] * STEP * 0.55
          } else {
            x += DIRS8[di][0] * STEP
            y += DIRS8[di][1] * STEP
          }
        })
      }

      const lastP = pts[pts.length - 1]
      // Regional GEO spokes AND Baing get an angled label near HQ (which line goes where); rings keep the end-anchored label.
      const nameAngled = isBaing || !g.isService
      rayPaths.push({ id: g.id, name: g.name, color: g.color, points: pts, trunk: [], feeders: [], spineIds, ring: isRing, nameAngled, nameAt: lastP ? { x: lastP.x, y: lastP.y - 22 } : null, nameAnchor: makeNameAnchor(spineIds, null) })
    })

    return { positions: pos, rays: rayPaths }
  }, [lineGroups, layoutMode, childrenByParent, geometry, expandedId])

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
    if (!payload) return []
    // A department in focus: show all its relations. Otherwise: show only STRONG relations
    // (faintly) — the rest stay hidden until a department is selected.
    if (activeId) return payload.relations.filter((r) => String(r.source) === String(activeId) || String(r.target) === String(activeId))
    return payload.relations.filter((r) => r.strength === 'high')
  }, [payload, activeId])

  const onHover = (id) => { setHoveredId(id); setHoveredDepartmentId?.(id) }
  const onLeave = () => { setHoveredId(null); setHoveredDepartmentId?.(null) }
  const poly = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  // Effective position of a station by id (live drag / saved / parent-follow / computed).
  const eff = (id) => { const p = positions.get(String(id)); return p ? effPos(String(id), p.x, p.y) : null }

  return (
    <div style={{ width: '100%', height: '100%', background: BG }}>
      <TransformWrapper minScale={0.18} maxScale={2.6} initialScale={0.92} wheel={{ smoothStep: 0.07 }} doubleClick={{ disabled: true }} panning={{ disabled: constructorMode }} centerOnInit>
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
            onPointerMove={onSvgPointerMove} onPointerUp={onSvgPointerUp} onPointerLeave={onSvgPointerUp}>
            <defs>
              <filter id="mr-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>

            <rect width={W} height={H} fill={BG} onClick={() => { if (constructorMode) onSelectConstructorElement?.(null); setExpandedId(null); setSelectedDepartmentId(null) }} />
            <pattern id="mr-dots" x="0" y="0" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="17" cy="17" r="0.8" fill="rgba(148,163,184,0.06)" /></pattern>
            <rect width={W} height={H} fill="url(#mr-dots)" style={{ pointerEvents: 'none' }} />

            {/* Ray tracks */}
            {rays.map((ray) => (
              <g key={`ray-${ray.id}`}>
                {/* diagonal branches (medium weight) — drawn through live station positions */}
                {(ray.feeders || []).map((seg, si) => {
                  const fpts = seg.ids
                    ? [seg.attach, ...seg.ids.map((id) => eff(id)).filter(Boolean)]
                    : seg
                  if (!fpts || fpts.length < 2) return null
                  return <path key={`fd-${ray.id}-${si}`} d={roundedPath(fpts, 20)} fill="none" stroke={ray.color} strokeWidth={5} opacity={0.85} strokeLinecap="round" strokeLinejoin="round" />
                })}
                {/* thick main trunk */}
                {(ray.trunk || []).map((seg, si) => (
                  <g key={`tk-${ray.id}-${si}`}>
                    <path d={roundedPath(seg, 26)} fill="none" stroke={ray.color} strokeWidth={15} opacity={0.16} strokeLinecap="round" strokeLinejoin="round" />
                    <path d={roundedPath(seg, 26)} fill="none" stroke={ray.color} strokeWidth={7.5} opacity={0.9} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                ))}
                {/* straight spine (up/down/diagonal/geo) — drawn through live stations, with waypoints */}
                {(() => {
                  const stationPts = (ray.spineIds || []).map((id) => eff(id)).filter(Boolean)
                  // Rings close the loop (full circle); radial lines start at HQ.
                  const base = (ray.spineIds && ray.spineIds.length)
                    ? (ray.ring
                        ? (stationPts.length > 2 ? [...stationPts, stationPts[0]] : stationPts)
                        : [{ x: CX, y: CY }, ...stationPts])
                    : ray.points
                  const dispPts = withWaypoints(base, (waypoints[ray.id] || []).map((w, i) => wpEff(ray.id, i, w)))
                  if (dispPts.length < 2) return null
                  const d = roundedPath(dispPts, 30)
                  return (
                    <>
                      <path d={d} fill="none" stroke={ray.color} strokeWidth={15} opacity={0.16} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={d} fill="none" stroke={ray.color} strokeWidth={7.5} opacity={0.9} strokeLinecap="round" strokeLinejoin="round" />
                      {/* click hit-area for adding turns */}
                      {constructorMode && constructorTool === 'turn' && (
                        <path d={d} fill="none" stroke="transparent" strokeWidth={22} style={{ cursor: 'copy' }} onClick={(e) => addWaypoint(e, ray.id)} />
                      )}
                      {/* click hit-area for adding a branch */}
                      {constructorMode && constructorTool === 'branch' && (
                        <path d={d} fill="none" stroke="transparent" strokeWidth={22} style={{ cursor: 'crosshair' }} onClick={(e) => addBranch(e, ray.id, ray.color)} />
                      )}
                    </>
                  )
                })()}
                {/* line name */}
                {(() => {
                  // Regional GEO line: label near HQ, above the line, rotated to the line's angle.
                  if (ray.nameAngled && ray.spineIds && ray.spineIds.length) {
                    const p1 = eff(ray.spineIds[0])
                    if (p1) {
                      const dxv = p1.x - CX, dyv = p1.y - CY, len = Math.hypot(dxv, dyv) || 1
                      const ux = dxv / len, uy = dyv / len
                      const bx0 = CX + ux * len * 0.55, by0 = CY + uy * len * 0.55
                      let px = -uy, py = ux
                      if (py > 0) { px = -px; py = -py } // perpendicular pointing "up"
                      const bx = bx0 + px * 20, by = by0 + py * 20
                      let ang = Math.atan2(uy, ux) * 180 / Math.PI
                      if (ang > 90 || ang < -90) ang += 180 // keep text upright
                      return (
                        <text x={bx} y={by} transform={`rotate(${ang} ${bx} ${by})`} textAnchor="middle" fill={ray.color} fontSize={14} fontWeight={800} fontFamily="Inter, sans-serif"
                          onClick={(e) => { if (constructorMode && constructorTool === 'erase') { e.stopPropagation(); eraseLine(ray.id) } }}
                          style={{ textTransform: 'uppercase', letterSpacing: '0.04em', paintOrder: 'stroke', stroke: BG, strokeWidth: 3.5, cursor: (constructorMode && constructorTool === 'erase') ? 'pointer' : 'default' }}>
                          {ray.name}
                        </text>
                      )
                    }
                  }
                  let nx, ny, ndx = 0, ndy = 0
                  if (ray.nameAnchor) {
                    const ap = eff(ray.nameAnchor.id)
                    if (ap) { nx = ap.x; ny = ap.y; ndx = ray.nameAnchor.dx; ndy = ray.nameAnchor.dy }
                  }
                  if (nx == null && ray.nameAt) { nx = ray.nameAt.x; ny = ray.nameAt.y }
                  if (nx == null) return null
                  const off = 30
                  const lx = nx + ndx * off
                  const ly = ny + ndy * off + (Math.abs(ndy) < 0.3 ? -14 : (ndy < 0 ? -6 : 14))
                  return (
                    <text x={lx} y={ly} textAnchor="middle" fill={ray.color} fontSize={15} fontWeight={800} fontFamily="Inter, sans-serif"
                      onClick={(e) => { if (constructorMode && constructorTool === 'erase') { e.stopPropagation(); eraseLine(ray.id) } }}
                      style={{ textTransform: 'uppercase', letterSpacing: '0.04em', paintOrder: 'stroke', stroke: BG, strokeWidth: 3.5, cursor: (constructorMode && constructorTool === 'erase') ? 'pointer' : 'default' }}>
                      {ray.name}
                    </text>
                  )
                })()}
              </g>
            ))}

            {/* Branch stubs (sub-departments) — follow both parent and child live positions */}
            {Array.from(positions.values()).filter((p) => p.branchFrom).map((p) => {
              const cid = String(p.station.id)
              const ce = eff(cid) || { x: p.x, y: p.y }
              const pid = parentIdOf(p.station)
              const pe = (pid != null && eff(pid)) || p.branchFrom
              // faint branches (service sub-departments) dim to 50% until the parent or child is active
              const kActive = String(activeId) === cid || (activeId != null && String(pid) === String(activeId))
              const op = p.faint ? (kActive ? 0.9 : 0.5) : 0.5
              return <line key={`b-${cid}`} x1={pe.x} y1={pe.y} x2={ce.x} y2={ce.y} stroke={p.color} strokeWidth={3} opacity={op} strokeLinecap="round" />
            })}

            {/* Relations — line + directional arrows along its length */}
            {visibleRelations.map((rel, ri) => {
              const sp0 = positions.get(String(rel.source)); const tp0 = positions.get(String(rel.target))
              if (!sp0 || !tp0) return null
              const sp = effPos(String(rel.source), sp0.x, sp0.y)
              const tp = effPos(String(rel.target), tp0.x, tp0.y)
              const isCrit = Boolean(rel.is_critical)
              const isBi = Boolean(rel.is_bidirectional || rel.direction === 'bidirectional')
              const srcColor = isCrit ? '#F97316' : (sp0.color || '#94A3B8')
              const tgtColor = isCrit ? '#F97316' : (tp0.color || '#94A3B8')
              const dx = tp.x - sp.x, dy = tp.y - sp.y; const dist = Math.sqrt(dx * dx + dy * dy) || 1
              const off = 26 + (ri % 4) * 16
              const qx = (sp.x + tp.x) / 2 + (-dy / dist) * off, qy = (sp.y + tp.y) / 2 + (dx / dist) * off
              // quadratic helpers
              const quad = (t) => ({
                x: (1 - t) * (1 - t) * sp.x + 2 * (1 - t) * t * qx + t * t * tp.x,
                y: (1 - t) * (1 - t) * sp.y + 2 * (1 - t) * t * qy + t * t * tp.y,
              })
              const tangent = (t) => {
                const ax = 2 * (1 - t) * (qx - sp.x) + 2 * t * (tp.x - qx)
                const ay = 2 * (1 - t) * (qy - sp.y) + 2 * t * (tp.y - qy)
                return Math.atan2(ay, ax) * 180 / Math.PI
              }
              // Highlighted when a department is focused, or the relation itself is hovered.
              const hot = Boolean(activeId) || String(hoveredRelId) === String(rel.id)
              const arrows = []
              if (hot) {
                const nArrows = Math.max(2, Math.min(12, Math.round(dist / 75)))
                for (let k = 0; k < nArrows; k += 1) {
                  const t = (k + 0.5) / nArrows
                  const p = quad(t)
                  let ang = tangent(t)
                  let col = srcColor
                  if (isBi && t >= 0.5) { ang += 180; col = tgtColor } // second half points back
                  arrows.push(
                    <path key={`ar-${rel.id}-${k}`} d="M -5 -4 L 4 0 L -5 4 Z" fill={col}
                      transform={`translate(${p.x} ${p.y}) rotate(${ang})`} opacity={0.95} />,
                  )
                }
              }
              const d = `M ${sp.x} ${sp.y} Q ${qx} ${qy} ${tp.x} ${tp.y}`
              return (
                <g key={`r-${rel.id}`} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredRelId(rel.id)} onMouseLeave={() => setHoveredRelId((v) => (v === rel.id ? null : v))}>
                  {/* wide invisible hit area so a faint line is easy to hover */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                  <path d={d} fill="none"
                    stroke={isCrit ? '#F97316' : srcColor} strokeWidth={hot ? (isCrit ? 2.6 : 2.2) : 1.4}
                    strokeLinecap="round" opacity={hot ? (isCrit ? 0.7 : 0.6) : 0.14} />
                  {arrows}
                </g>
              )
            })}

            {/* Head Office hub */}
            <circle cx={CX} cy={CY} r={34} fill="rgba(255,255,255,0.08)" />
            <circle cx={CX} cy={CY} r={22} fill={BG} stroke="#FFFFFF" strokeWidth={4} />
            <circle cx={CX} cy={CY} r={7} fill="#FFFFFF" />
            <text x={CX} y={CY + 2} textAnchor="middle" dominantBaseline="middle" fill="#FFFFFF" fontSize={11} fontWeight={900} fontFamily="Inter, sans-serif" style={{ paintOrder: 'stroke', stroke: BG, strokeWidth: 3, pointerEvents: 'none' }}>HQ</text>

            {/* Branches (custom) */}
            {branches.map((b) => {
              const e = branchEnd(b)
              const showHandle = constructorMode && constructorTool === 'branch'
              const eraseMode = constructorMode && constructorTool === 'erase'
              const isSel = selectedConstructorElement?.type === 'branch' && selectedConstructorElement.branchId === b.id
              return (
                <g key={`br-${b.id}`}
                  onClick={(ev) => { if (eraseMode) { ev.stopPropagation(); deleteBranch(b.id) } }}
                  style={{ cursor: eraseMode ? 'pointer' : 'default' }}>
                  {eraseMode && (
                    <line x1={b.anchor.x} y1={b.anchor.y} x2={e.x} y2={e.y} stroke="transparent" strokeWidth={22} strokeLinecap="round" />
                  )}
                  <line x1={b.anchor.x} y1={b.anchor.y} x2={e.x} y2={e.y} stroke={b.color} strokeWidth={14} opacity={isSel ? 0.3 : 0.16} strokeLinecap="round" />
                  <line x1={b.anchor.x} y1={b.anchor.y} x2={e.x} y2={e.y} stroke={b.color} strokeWidth={6} opacity={0.85} strokeLinecap="round" />
                  {isSel && (
                    <line x1={b.anchor.x} y1={b.anchor.y} x2={e.x} y2={e.y} stroke="#F87171" strokeWidth={2} strokeDasharray="5 4" opacity={0.9} />
                  )}
                  <circle cx={b.anchor.x} cy={b.anchor.y} r={5} fill={b.color} stroke={BG} strokeWidth={2} />
                  {showHandle && (
                    <g
                      style={{ cursor: 'grab' }}
                      onPointerDown={(ev) => onBranchEndPointerDown(ev, b.id)}
                      onClick={(ev) => { ev.stopPropagation(); onSelectConstructorElement?.({ type: 'branch', branchId: b.id }) }}
                      onDoubleClick={(ev) => { ev.stopPropagation(); deleteBranch(b.id) }}
                    >
                      {isSel && <rect x={e.x - 14} y={e.y - 14} width={28} height={28} rx={5} fill="none" stroke="#F87171" strokeWidth={2.5} strokeDasharray="4 3" />}
                      <rect x={e.x - 9} y={e.y - 9} width={18} height={18} rx={3} fill="#FFFFFF" stroke={isSel ? '#EF4444' : b.color} strokeWidth={3} />
                    </g>
                  )}
                </g>
              )
            })}

            {Array.from(positions.values()).map((posItem) => {
              const { station, dx, dy, isRoot, color } = posItem
              const id = String(station.id)
              const ep = effPos(id, posItem.x, posItem.y)
              const x = ep.x, y = ep.y
              const onBranch = Boolean(stationBranchMap[id])
              const moved = Boolean(overrides[id] || manualPos[id] || onBranch)
              const refStyle = true // both GEO and type use clean reference station style
              const nodeColor = color
              const isSel = String(selectedDepartmentId) === id
              const isHov = hoveredId === id
              const isAct = isSel || isHov
              const isDim = Boolean(activeId) && !isAct && !connectedIds.has(id)
              const expandable = Boolean(posItem.expandable && posItem.childCount > 0)
              const isExpanded = expandable && String(expandedId) === id
              // faint sub-departments (service branches): 50% until this node or its parent is active
              const parentActive = posItem.faint && activeId != null && String(parentIdOf(station)) === String(activeId)
              const faintOp = posItem.faint && !isAct && !parentActive ? 0.5 : 1
              const r = isAct ? 13 : (expandable ? 12 : (isRoot ? 11 : 7))
              const lx = x + (dx || 0) * 17
              const ly = y + (dy || 0) * 17 - (Math.abs(dy || 0) < 0.3 ? 15 : 0)
              const anchor = (dx || 0) > 0.3 ? 'start' : (dx || 0) < -0.3 ? 'end' : 'middle'
              return (
                <g key={id}
                  style={{ cursor: constructorMode ? 'grab' : 'pointer', opacity: isDim ? 0.16 : faintOp, transition: 'opacity 150ms' }}
                  onMouseEnter={() => onHover(id)} onMouseLeave={onLeave}
                  onPointerDown={(e) => onStationPointerDown(e, id)}
                  onClick={(e) => {
                    if (constructorMode && constructorTool === 'erase') { e.stopPropagation(); return } // stations are not deletable
                    if (constructorMode) return
                    // Expandable ring station: toggle its sub-departments; otherwise collapse any open one.
                    setExpandedId((cur) => (expandable ? (String(cur) === id ? null : id) : null))
                    setSelectedDepartmentId(id)
                  }}
                  onDoubleClick={(e) => {
                    if (!(constructorMode && constructorTool === 'move')) return
                    e.stopPropagation()
                    if (!moved) return
                    if (onBranch) { detachStationFromBranch(id); return }
                    if (onSaveGeometry && manualPos[id]) {
                      const nextPos = { ...manualPos }; delete nextPos[id]
                      onSaveGeometry({ ...geometry, positions: nextPos })
                    }
                  }}>
                  {isAct && <circle cx={x} cy={y} r={r + 7} fill={nodeColor} opacity={0.3} filter="url(#mr-glow)" />}
                  {refStyle ? (
                    <>
                      {/* expandable (has sub-departments): brighter outer ring as an affordance */}
                      {expandable && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={nodeColor} strokeWidth={2} opacity={isExpanded ? 0.95 : 0.5} />}
                      <circle cx={x} cy={y} r={r} fill="#FFFFFF" stroke={nodeColor} strokeWidth={isAct ? 5 : 4} />
                      {/* sub-department count inside the station */}
                      {expandable && (
                        <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="middle" fill={nodeColor} fontSize={11} fontWeight={900} fontFamily="Inter, sans-serif" style={{ pointerEvents: 'none' }}>
                          {posItem.childCount}
                        </text>
                      )}
                    </>
                  ) : (
                    <>
                      <circle cx={x} cy={y} r={r} fill={nodeColor} stroke={isSel ? '#FFFFFF' : '#0B1524'} strokeWidth={isAct ? 4 : 3} />
                      <circle cx={x} cy={y} r={Math.max(2.5, r - 5)} fill="#0B1524" />
                      <circle cx={x} cy={y} r={Math.max(1.5, r - 7)} fill={nodeColor} />
                    </>
                  )}
                  <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle"
                    fill={isAct ? '#FFFFFF' : (isRoot ? '#F1F5F9' : '#CBD5E1')} fontSize={isRoot ? 12.5 : 11} fontWeight={isAct || isRoot ? 800 : 600} fontFamily="Inter, sans-serif"
                    style={{ paintOrder: 'stroke', stroke: BG, strokeWidth: 3.5, strokeLinejoin: 'round', pointerEvents: 'none' }}>
                    {station.name}
                  </text>
                </g>
              )
            })}

            {/* Waypoint handles (turn tool = drag/select; erase tool = click to delete) */}
            {constructorMode && (constructorTool === 'turn' || constructorTool === 'erase') && rays.map((ray) => (
              (waypoints[ray.id] || []).map((w0, idx) => {
                const w = wpEff(ray.id, idx, w0)
                const eraseMode = constructorTool === 'erase'
                const isSel = selectedConstructorElement?.type === 'wp' && selectedConstructorElement.lineId === ray.id && selectedConstructorElement.idx === idx
                return (
                  <g key={`wph-${ray.id}-${idx}`}
                    style={{ cursor: eraseMode ? 'pointer' : 'grab' }}
                    onPointerDown={(e) => { if (!eraseMode) onWpPointerDown(e, ray.id, idx) }}
                    onClick={(e) => { e.stopPropagation(); if (eraseMode) { deleteWaypoint(ray.id, idx) } else { onSelectConstructorElement?.({ type: 'wp', lineId: ray.id, idx }) } }}
                    onDoubleClick={(e) => { e.stopPropagation(); deleteWaypoint(ray.id, idx) }}>
                    {isSel && <rect x={w.x - 13} y={w.y - 13} width={26} height={26} transform={`rotate(45 ${w.x} ${w.y})`} fill="none" stroke="#F87171" strokeWidth={2.5} strokeDasharray="4 3" />}
                    <rect x={w.x - 7} y={w.y - 7} width={14} height={14} transform={`rotate(45 ${w.x} ${w.y})`} fill="#FFFFFF" stroke={eraseMode ? '#F87171' : (isSel ? '#EF4444' : ray.color)} strokeWidth={3} />
                  </g>
                )
              })
            ))}
          </svg>
        </TransformComponent>

        <ZoomControls />

        <div style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 30, border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, overflow: 'hidden', background: 'rgba(13,27,42,0.9)', backdropFilter: 'blur(8px)' }}>
          <MiniMap width={180} height={130} borderColor="rgba(96,165,250,0.8)">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block', background: BG }}>
              {rays.map((ray) => (
                <g key={`mm-${ray.id}`}>
                  <path d={roundedPath(ray.points, 30)} fill="none" stroke={ray.color} strokeWidth={22} opacity={0.8} />
                  {(ray.trunk || []).map((seg, si) => <path key={si} d={roundedPath(seg, 26)} fill="none" stroke={ray.color} strokeWidth={22} opacity={0.8} />)}
                </g>
              ))}
            </svg>
          </MiniMap>
        </div>
      </TransformWrapper>
    </div>
  )
}
