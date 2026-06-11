import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import ELK from 'elkjs/lib/elk.bundled.js'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
} from 'reactflow'

import './App.css'
import MetroMap from './components/MetroMap/MetroMap'
import OrbitMap from './components/OrbitMap/OrbitMap'

const strengthStyles = {
  low: {
    strokeWidth: 1.5,
    opacity: 0.35,
  },
  medium: {
    strokeWidth: 2.5,
    opacity: 0.55,
  },
  high: {
    strokeWidth: 4,
    opacity: 0.9,
  },
}

const elk = new ELK()

async function buildElkLayout(lines, relations) {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '90',
      'elk.layered.spacing.nodeNodeBetweenLayers': '180',
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.padding': '[top=80,left=80,bottom=80,right=80]',
    },

    children: [],
    edges: [],
  }

  lines.forEach((line, lineIndex) => {
    line.stations.forEach((station, stationIndex) => {
      elkGraph.children.push({
        id: String(station.id),
        width: 190,
        height: 72,

        layoutOptions: {
          'elk.partitioning.partition': String(lineIndex + 1),
        },
      })

      const nextStation = line.stations[stationIndex + 1]

      if (nextStation) {
        elkGraph.edges.push({
          id: `metro-${station.id}-${nextStation.id}`,
          sources: [String(station.id)],
          targets: [String(nextStation.id)],
        })
      }
    })
  })

  relations.forEach((relation) => {
    elkGraph.edges.push({
      id: `relation-${relation.id}`,
      sources: [String(relation.source)],
      targets: [String(relation.target)],
    })
  })

  const layout = await elk.layout(elkGraph)

  const positions = new Map()

  layout.children?.forEach((node) => {
    positions.set(node.id, {
      x: node.x,
      y: node.y,
    })
  })

  return positions
}

function buildVisualMetroLines(lines) {
  const palette = {
    regional: ['#60A5FA', '#22C55E', '#FACC15', '#A855F7', '#EC4899', '#14B8A6', '#F97316', '#38BDF8'],
    service: ['#EF4444', '#F97316', '#EAB308', '#06B6D4', '#A855F7', '#84CC16', '#3B82F6'],
    other: ['#94A3B8', '#C084FC', '#FB7185'],
  }

  const regionalStations = []
  const serviceStations = []
  const otherStations = []

  lines.forEach((line) => {
    line.stations.forEach((station) => {
      const item = { ...station, originalLine: line }

      if (isServiceLine(line)) {
        serviceStations.push(item)
      } else if (isRegionalLine(line)) {
        regionalStations.push(item)
      } else {
        otherStations.push(item)
      }
    })
  })

  const chunkStations = (stations, lineCount) => {
    const chunks = Array.from({ length: lineCount }, () => [])

    stations.forEach((station, index) => {
      chunks[index % lineCount].push(station)
    })

    return chunks.filter((chunk) => chunk.length > 0)
  }

  const regionalLineCount = Math.min(8, Math.max(3, Math.ceil(regionalStations.length / 4)))
  const serviceLineCount = Math.min(7, Math.max(2, Math.ceil(serviceStations.length / 4)))
  const otherLineCount = Math.min(3, Math.max(1, Math.ceil(otherStations.length / 5)))

  const regionalChunks = chunkStations(regionalStations, regionalLineCount)
  const serviceChunks = chunkStations(serviceStations, serviceLineCount)
  const otherChunks = chunkStations(otherStations, otherLineCount)

  return [
    ...regionalChunks.map((stations, index) => ({
      id: `visual-regional-${index}`,
      name: `Regional Line ${index + 1}`,
      type: 'regional',
      color: palette.regional[index % palette.regional.length],
      stations,
    })),
    ...serviceChunks.map((stations, index) => ({
      id: `visual-service-${index}`,
      name: `Service Line ${index + 1}`,
      type: 'service',
      color: palette.service[index % palette.service.length],
      stations,
    })),
    ...otherChunks.map((stations, index) => ({
      id: `visual-other-${index}`,
      name: `Other Line ${index + 1}`,
      type: 'other',
      color: palette.other[index % palette.other.length],
      stations,
    })),
  ]
}

function buildMetroNodes(lines, positions, selectedDepartmentId, hoveredDepartmentId, connectedDepartmentIds, hubDepartmentIds) {
  const nodes = []
  const positionMap = new Map()
  const visualLines = buildVisualMetroLines(lines)

  const centerX = 1100
  const centerY = 560

  const branchRoutes = [
    { startX: centerX - 260, startY: centerY - 80, stepX: -150, stepY: -85, labelSide: 'left' },
    { startX: centerX + 260, startY: centerY - 80, stepX: 150, stepY: -85, labelSide: 'right' },
    { startX: centerX + 320, startY: centerY + 35, stepX: 170, stepY: 0, labelSide: 'right' },
    { startX: centerX + 220, startY: centerY + 150, stepX: 120, stepY: 105, labelSide: 'right' },
    { startX: centerX - 220, startY: centerY + 150, stepX: -120, stepY: 105, labelSide: 'left' },
    { startX: centerX - 320, startY: centerY + 35, stepX: -170, stepY: 0, labelSide: 'left' },
    { startX: centerX - 120, startY: centerY - 190, stepX: -65, stepY: -125, labelSide: 'left' },
    { startX: centerX + 120, startY: centerY - 190, stepX: 65, stepY: -125, labelSide: 'right' },
  ]

  const regionalVisualLines = visualLines.filter((line) => line.type === 'regional')
  const serviceVisualLines = visualLines.filter((line) => line.type === 'service')
  const otherVisualLines = visualLines.filter((line) => line.type === 'other')

  const setStationPosition = (station, line, x, y, labelSide = 'right') => {
    positionMap.set(String(station.id), { x, y, labelSide, visualLine: line })
  }

  serviceVisualLines.forEach((line, lineIndex) => {
    const y = centerY + (lineIndex - (serviceVisualLines.length - 1) / 2) * 78
    const total = Math.max(1, line.stations.length)
    const gap = total > 4 ? 145 : 170

    line.stations.forEach((station, stationIndex) => {
      const x = centerX + (stationIndex - (total - 1) / 2) * gap
      const labelSide = stationIndex % 2 === 0 ? 'top' : 'bottom'

      setStationPosition(station, line, x, y, labelSide)
    })
  })

  regionalVisualLines.forEach((line, lineIndex) => {
    const route = branchRoutes[lineIndex % branchRoutes.length]
    const routeRound = Math.floor(lineIndex / branchRoutes.length)
    const roundOffset = routeRound * 75

    line.stations.forEach((station, stationIndex) => {
      const bendOffset = stationIndex > 0 && stationIndex % 2 === 0 ? 28 : 0
      const x = route.startX + stationIndex * route.stepX + Math.sign(route.stepX || 1) * roundOffset
      const y = route.startY + stationIndex * route.stepY + bendOffset + Math.sign(route.stepY || 1) * roundOffset

      setStationPosition(station, line, x, y, route.labelSide)
    })
  })

  otherVisualLines.forEach((line, lineIndex) => {
    const y = centerY + 350 + lineIndex * 82
    const total = Math.max(1, line.stations.length)

    line.stations.forEach((station, stationIndex) => {
      const x = centerX + (stationIndex - (total - 1) / 2) * 160
      const labelSide = stationIndex % 2 === 0 ? 'top' : 'bottom'

      setStationPosition(station, line, x, y, labelSide)
    })
  })

  visualLines.forEach((visualLine) => {
    visualLine.stations.forEach((station) => {
      const stationId = String(station.id)
      const isSelected = selectedDepartmentId === stationId
      const isHovered = hoveredDepartmentId === stationId
      const hasActiveFocus = Boolean(selectedDepartmentId || hoveredDepartmentId)
      const isConnected = connectedDepartmentIds.has(stationId)
      const isHub = hubDepartmentIds.has(stationId)
      const isDimmed = hasActiveFocus && !isSelected && !isHovered && !isConnected
      const isService = visualLine.type === 'service'
      const isRegional = visualLine.type === 'regional'
      const stationPosition = positionMap.get(stationId) || positions.get(stationId) || { x: 0, y: 0, labelSide: 'right', visualLine }
      const labelSide = stationPosition.labelSide || 'right'
      const dotSize = isHub ? 30 : isService ? 19 : 15
      const lineColor = stationPosition.visualLine?.color || visualLine.color
      const labelTransform = labelSide === 'left'
        ? 'translate(-100%, -50%)'
        : labelSide === 'top'
          ? 'translate(-50%, -100%)'
          : labelSide === 'bottom'
            ? 'translate(-50%, 0)'
            : 'translate(0, -50%)'
      const labelLeft = labelSide === 'left' ? -18 : labelSide === 'right' ? dotSize + 18 : dotSize / 2
      const labelTop = labelSide === 'top' ? -14 : labelSide === 'bottom' ? dotSize + 14 : dotSize / 2
      const labelAlign = labelSide === 'left' ? 'right' : labelSide === 'top' || labelSide === 'bottom' ? 'center' : 'left'

      nodes.push({
        id: stationId,
        type: 'default',
        position: {
          x: stationPosition.x,
          y: stationPosition.y,
        },
        style: {
          width: dotSize,
          height: dotSize,
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          padding: 0,
        },
        data: {
          station,
          line: {
            ...(station.originalLine || visualLine),
            color: lineColor,
            name: station.originalLine?.name || visualLine.name,
          },
          label: (
            <div
              style={{
                position: 'relative',
                width: dotSize,
                height: dotSize,
                opacity: isDimmed ? 0.22 : 1,
                transform: isSelected ? 'scale(1.16)' : isHovered ? 'scale(1.08)' : 'scale(1)',
                transition: 'all 180ms ease',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 999,
                  background: isSelected ? '#FFFFFF' : '#020617',
                  border: `${isHub ? 5 : 4}px solid ${lineColor}`,
                  boxShadow: isSelected
                    ? `0 0 0 4px rgba(255,255,255,.18), 0 0 34px ${lineColor}`
                    : isHovered
                      ? `0 0 0 3px rgba(255,255,255,.14), 0 0 28px ${lineColor}`
                      : isHub
                        ? `0 0 0 3px rgba(255,255,255,.10), 0 0 24px ${lineColor}`
                        : `0 0 0 2px rgba(2,6,23,.8), 0 0 14px ${lineColor}66`,
                }}
              />

              {isHub && (
                <div
                  style={{
                    position: 'absolute',
                    inset: -7,
                    borderRadius: 999,
                    border: `2px solid ${lineColor}`,
                    opacity: 0.65,
                  }}
                />
              )}

              <div
                style={{
                  position: 'absolute',
                  left: labelLeft,
                  top: labelTop,
                  transform: labelTransform,
                  minWidth: isHub ? 170 : 132,
                  maxWidth: 220,
                  textAlign: labelAlign,
                  pointerEvents: 'none',
                  filter: 'drop-shadow(0 6px 12px rgba(0,0,0,.55))',
                }}
              >
                <div
                  style={{
                    color: '#F8FAFC',
                    fontSize: isHub ? 13 : 12,
                    lineHeight: '15px',
                    fontWeight: isHub ? 900 : 800,
                    letterSpacing: '-0.02em',
                    whiteSpace: 'normal',
                  }}
                >
                  {station.name}
                </div>
                <div
                  style={{
                    color: isService ? '#67E8F9' : isRegional ? '#CBD5E1' : '#C4B5FD',
                    fontSize: 10,
                    lineHeight: '12px',
                    fontWeight: 700,
                    marginTop: 3,
                    opacity: 0.72,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {isService ? 'Service' : isRegional ? 'Regional' : 'Department'}
                </div>
              </div>
            </div>
          ),
        },
        draggable: true,
      })
    })
  })

  return nodes
}

function buildMetroEdges(lines, relations, selectedDepartmentId, hoveredDepartmentId) {
  const edges = []
  const activeDepartmentId = selectedDepartmentId || hoveredDepartmentId
  const hasSelection = Boolean(activeDepartmentId)
  const visualLines = buildVisualMetroLines(lines)

  visualLines.forEach((line) => {
    const isService = line.type === 'service'
    const isRegional = line.type === 'regional'

    line.stations.forEach((station, index) => {
      const nextStation = line.stations[index + 1]

      if (!nextStation) return

      edges.push({
        id: `visual-line-${line.id}-${station.id}-${nextStation.id}`,
        source: String(station.id),
        target: String(nextStation.id),
        type: isService ? 'straight' : 'smoothstep',
        animated: false,
        style: {
          stroke: line.color,
          strokeWidth: isService ? 9 : isRegional ? 7 : 5,
          opacity: hasSelection ? 0.2 : isService ? 0.95 : 0.78,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        zIndex: isService ? 8 : 5,
      })
    })
  })

  relations.forEach((relation) => {
    const style = strengthStyles[relation.strength] || strengthStyles.medium
    const sourceId = String(relation.source)
    const targetId = String(relation.target)
    const isRelatedToSelection = activeDepartmentId === sourceId || activeDepartmentId === targetId

    edges.push({
      id: `relation-${relation.id}`,
      source: sourceId,
      target: targetId,
      type: 'bezier',
      animated: relation.is_critical,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
      style: {
        stroke: relation.is_critical ? '#F97316' : '#94A3B8',
        strokeWidth: relation.is_critical ? Math.max(style.strokeWidth, 3) : style.strokeWidth,
        opacity: hasSelection ? (isRelatedToSelection ? 1 : 0.05) : relation.is_critical ? 0.75 : 0.22,
        strokeDasharray: relation.is_critical ? '0' : '8 10',
      },
      zIndex: isRelatedToSelection ? 50 : 20,
    })
  })

  return edges
}

function isRegionalLine(line) {
  const name = (line.name || '').toLowerCase()
  return name.includes('regional') || name.includes('регион')
}

function isServiceLine(line) {
  const name = (line.name || '').toLowerCase()
  return name.includes('service') || name.includes('сервис')
}

function buildOrbitNodes(lines, selectedDepartmentId, hoveredDepartmentId, connectedDepartmentIds, hubDepartmentIds) {
  const nodes = []
  const ringEdges = []
  const centerX = 720
  const centerY = 420
  // Outer ellipse for regional departments
  const outerRx = 560
  const outerRy = 260
  // Inner ellipse for service departments
  const innerRx = 210
  const innerRy = 125

  const serviceItems = []
  const regionalItems = []

  lines.forEach((line) => {
    line.stations.forEach((station) => {
      // Skip child departments — show only root-level on the map
      const parentId = station.parent_id ?? station.parentId ?? station.parent_department_id ?? null
      if (parentId) return

      const item = { station, line }
      if (isServiceLine(line)) {
        serviceItems.push(item)
      } else if (isRegionalLine(line)) {
        regionalItems.push(item)
      } else {
        serviceItems.push(item)
      }
    })
  })

  const outerIds = []
  const innerIds = []

  const addEllipseNode = (item, index, total, rx, ry, ringType, stationNum) => {
    const { station, line } = item
    const stationId = String(station.id)
    const angle = total > 0 ? (2 * Math.PI * index) / total - Math.PI / 2 : 0
    const isSelected = selectedDepartmentId === stationId
    const isHovered = hoveredDepartmentId === stationId
    const hasActiveFocus = Boolean(selectedDepartmentId || hoveredDepartmentId)
    const isConnected = connectedDepartmentIds.has(stationId)
    const isHub = hubDepartmentIds.has(stationId)
    const isDimmed = hasActiveFocus && !isSelected && !isHovered && !isConnected
    const isOuter = ringType === 'outer'

    const x = centerX + rx * Math.cos(angle)
    const y = centerY + ry * Math.sin(angle)

    nodes.push({
      id: stationId,
      type: 'default',
      position: { x, y },
      data: {
        station,
        line,
        label: (
          <div style={{ position: 'relative', paddingTop: isOuter ? 18 : 0 }}>
            {isOuter && stationNum && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 9,
                color: line.color,
                fontWeight: 800,
                fontFamily: 'monospace',
                letterSpacing: '0.06em',
                opacity: 0.8,
                whiteSpace: 'nowrap',
              }}>
                {stationNum}
              </div>
            )}
            <div
              style={{
                padding: isHub ? '13px 22px' : isOuter ? '9px 14px' : '11px 18px',
                borderRadius: '999px',
                border: `${isSelected || isHub ? 5 : 4}px solid ${isSelected ? '#FFFFFF' : line.color}`,
                background: isOuter
                  ? 'linear-gradient(180deg, #1E293B 0%, #020617 100%)'
                  : 'linear-gradient(180deg, #10233F 0%, #020617 100%)',
                color: 'white',
                minWidth: isHub ? '172px' : isOuter ? '118px' : '150px',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: isHub ? '14px' : isOuter ? '12px' : '13px',
                lineHeight: '16px',
                boxShadow: isSelected
                  ? `0 0 0 2px ${line.color}, 0 0 42px ${line.color}`
                  : isHovered
                    ? `0 0 0 1px rgba(255,255,255,0.14), 0 0 30px ${line.color}88`
                    : isHub
                      ? `0 0 0 1px rgba(255,255,255,0.10), 0 0 34px ${line.color}88`
                      : `0 0 0 1px rgba(255,255,255,0.06), 0 0 22px ${line.color}55`,
                cursor: 'pointer',
                opacity: isDimmed ? 0.25 : 1,
                transform: isSelected ? 'scale(1.07)' : isHovered ? 'scale(1.04)' : 'scale(1)',
                transition: 'all 180ms ease',
              }}
            >
              {station.name}
            </div>
          </div>
        ),
      },
      draggable: true,
    })
  }

  regionalItems.forEach((item, index) => {
    const stationNum = String(index + 1).padStart(2, '0')
    addEllipseNode(item, index, regionalItems.length, outerRx, outerRy, 'outer', stationNum)
    outerIds.push(String(item.station.id))
  })

  serviceItems.forEach((item, index) => {
    addEllipseNode(item, index, serviceItems.length, innerRx, innerRy, 'inner', null)
    innerIds.push(String(item.station.id))
  })

  // Outer oval ring connections (close the loop)
  if (outerIds.length >= 3) {
    outerIds.forEach((id, index) => {
      const nextId = outerIds[(index + 1) % outerIds.length]
      ringEdges.push({
        id: `orbit-outer-ring-${id}-${nextId}`,
        source: id,
        target: nextId,
        type: 'straight',
        animated: false,
        style: { stroke: 'rgba(96,165,250,0.2)', strokeWidth: 1.5 },
        zIndex: 1,
      })
    })
  }

  // Inner oval ring connections (close the loop)
  if (innerIds.length >= 3) {
    innerIds.forEach((id, index) => {
      const nextId = innerIds[(index + 1) % innerIds.length]
      ringEdges.push({
        id: `orbit-inner-ring-${id}-${nextId}`,
        source: id,
        target: nextId,
        type: 'straight',
        animated: false,
        style: { stroke: 'rgba(148,163,184,0.15)', strokeWidth: 1.5 },
        zIndex: 1,
      })
    })
  }

  return { nodes, ringEdges }
}

function buildOrbitRelationEdges(relations, selectedDepartmentId, hoveredDepartmentId) {
  const edges = []
  const activeDepartmentId = selectedDepartmentId || hoveredDepartmentId
  const hasSelection = Boolean(activeDepartmentId)

  relations.forEach((relation) => {
    const style = strengthStyles[relation.strength] || strengthStyles.medium
    const sourceId = String(relation.source)
    const targetId = String(relation.target)
    const isRelatedToSelection = activeDepartmentId === sourceId || activeDepartmentId === targetId

    edges.push({
      id: `orbit-relation-${relation.id}`,
      source: sourceId,
      target: targetId,
      type: 'bezier',
      animated: relation.is_critical,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
      style: {
        stroke: relation.is_critical ? '#F97316' : '#94A3B8',
        strokeWidth: style.strokeWidth,
        opacity: hasSelection ? (isRelatedToSelection ? 1 : 0.06) : style.opacity,
        strokeDasharray: relation.is_critical ? '0' : '8 8',
      },
      zIndex: isRelatedToSelection ? 40 : 20,
    })
  })

  return edges
}

const STRENGTH_CFG = {
  low:    { dots: 1, color: '#64748B', bg: 'rgba(100,116,139,0.16)', label: 'Слабкий' },
  medium: { dots: 2, color: '#3B82F6', bg: 'rgba(59,130,246,0.18)',  label: 'Середній' },
  high:   { dots: 3, color: '#22C55E', bg: 'rgba(34,197,94,0.22)',   label: 'Сильний' },
}

function StrengthDots({ strength }) {
  const cfg = STRENGTH_CFG[strength] || STRENGTH_CFG.medium
  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: i <= cfg.dots ? cfg.color : 'rgba(255,255,255,0.1)',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

function MatrixView({ payload, selectedDepartmentId, onSelectDepartment }) {
  const [hoveredCell, setHoveredCell] = useState(null)
  const [hoveredRowId, setHoveredRowId] = useState(null)
  const [hoveredColId, setHoveredColId] = useState(null)

  const isRegional = (dept) => {
    const t = String(dept.department_type_name || dept.line?.name || '').toLowerCase()
    return t.includes('регіон') || t.includes('regional')
  }
  const isService = (dept) => {
    const t = String(dept.department_type_name || dept.line?.name || '').toLowerCase()
    return t.includes('сервіс') || t.includes('service')
  }

  const allDepartments = useMemo(() => {
    if (!payload) return []
    return payload.lines.flatMap((line) =>
      line.stations.map((station) => ({ ...station, line })),
    )
  }, [payload])

  // Rows = Regional, Columns = Service
  const rowDepts = useMemo(() => allDepartments.filter(isRegional), [allDepartments])
  const colDepts = useMemo(() => allDepartments.filter(isService), [allDepartments])

  // Fallback: if no split possible — show all vs all
  const rowDepartments = rowDepts.length && colDepts.length ? rowDepts : allDepartments
  const colDepartments = rowDepts.length && colDepts.length ? colDepts : allDepartments

  const relationMap = useMemo(() => {
    const map = new Map()
    payload.relations.forEach((rel) => {
      map.set(`${rel.source}-${rel.target}`, rel)
      if (rel.is_bidirectional) map.set(`${rel.target}-${rel.source}`, rel)
    })
    return map
  }, [payload])

  // Keep for colSpan usage
  const sortedDepartments = colDepartments

  const onCellEnter = (e, rowDept, colDept, relation) => {
    setHoveredRowId(String(rowDept.id))
    setHoveredColId(String(colDept.id))
    if (relation) {
      setHoveredCell({ relation, rowId: String(rowDept.id), colId: String(colDept.id), x: e.clientX, y: e.clientY })
    }
  }
  const onCellMove = (e) => {
    if (hoveredCell) setHoveredCell((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
  }
  const onCellLeave = () => {
    setHoveredRowId(null)
    setHoveredColId(null)
    setHoveredCell(null)
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '16px 20px', overflow: 'auto', position: 'relative' }}>

      {/* Hover tooltip */}
      {hoveredCell && (
        <div style={{
          position: 'fixed',
          left: hoveredCell.x + 14,
          top: hoveredCell.y - 10,
          zIndex: 200,
          background: 'rgba(2,6,23,0.97)',
          border: '1px solid rgba(148,163,184,0.22)',
          borderRadius: 14,
          padding: '12px 16px',
          maxWidth: 270,
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {hoveredCell.relation.is_critical && (
              <span style={{ fontSize: 11, background: 'rgba(249,115,22,0.15)', color: '#F97316', borderRadius: 6, padding: '2px 8px', fontWeight: 800 }}>
                ⚡ Критична
              </span>
            )}
            <span style={{
              fontSize: 11,
              color: (STRENGTH_CFG[hoveredCell.relation.strength] || STRENGTH_CFG.medium).color,
              fontWeight: 700,
            }}>
              {(STRENGTH_CFG[hoveredCell.relation.strength] || STRENGTH_CFG.medium).label}
            </span>
            <span style={{ fontSize: 11, color: '#475569' }}>
              {hoveredCell.relation.is_bidirectional ? '↔ Двостороннє' : '→ Одностороннє'}
            </span>
          </div>
          {hoveredCell.relation.short_description && (
            <div style={{ color: '#CBD5E1', fontSize: 12, lineHeight: 1.55 }}>
              {hoveredCell.relation.short_description}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{
        display: 'inline-block',
        minWidth: '100%',
        borderRadius: 18,
        overflow: 'hidden',
        border: '1px solid rgba(148,163,184,0.12)',
        background: '#070E1C',
      }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr>
              {/* Corner */}
              <th style={{
                position: 'sticky', left: 0, zIndex: 4,
                width: 80, minWidth: 80,
                background: '#070E1C',
                borderBottom: '1px solid rgba(148,163,184,0.12)',
                borderRight: '1px solid rgba(148,163,184,0.12)',
                padding: '14px 16px',
                textAlign: 'left',
              }}>
                <span style={{ color: '#334155', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Відділ
                </span>
              </th>

              {sortedDepartments.map((dept) => {
                const isHov = hoveredColId === String(dept.id)
                const isSel = selectedDepartmentId === String(dept.id)
                return (
                  <th
                    key={dept.id}
                    onClick={() => onSelectDepartment?.(String(dept.id))}
                    style={{
                      width: 48, minWidth: 48, maxWidth: 48,
                      background: isSel
                        ? `${dept.line?.color || '#3B82F6'}18`
                        : isHov ? 'rgba(255,255,255,0.04)' : '#070E1C',
                      borderBottom: isSel
                        ? `2px solid ${dept.line?.color || '#3B82F6'}`
                        : '1px solid rgba(148,163,184,0.12)',
                      borderRight: '1px solid rgba(148,163,184,0.05)',
                      padding: '14px 6px 10px',
                      verticalAlign: 'bottom',
                      transition: 'background 100ms',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: dept.line?.color || '#64748B',
                        flexShrink: 0,
                      }} />
                      <span style={{
                        writingMode: 'vertical-rl',
                        transform: 'rotate(180deg)',
                        whiteSpace: 'nowrap',
                        fontSize: 11,
                        fontWeight: isSel ? 800 : 600,
                        color: isSel ? (dept.line?.color || '#60A5FA') : isHov ? '#E2E8F0' : '#64748B',
                        transition: 'color 100ms',
                        letterSpacing: '0.02em',
                      }}>
                        {dept.name}
                      </span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {rowDepartments.map((rowDept) => {
                  const isHovRow = hoveredRowId === String(rowDept.id)
                  const isSelRow = selectedDepartmentId === String(rowDept.id)
                  return (
                    <tr key={rowDept.id}>
                      {/* Row label */}
                      <td
                        onClick={() => onSelectDepartment?.(String(rowDept.id))}
                        style={{
                          position: 'sticky', left: 0, zIndex: 2,
                          background: isSelRow
                            ? `${rowDept.line?.color || '#3B82F6'}12`
                            : isHovRow ? '#0C1828' : '#070E1C',
                          borderBottom: '1px solid rgba(148,163,184,0.06)',
                          borderRight: `3px solid ${isSelRow ? (rowDept.line?.color || '#3B82F6') : (rowDept.line?.color || '#1E293B')}`,
                          padding: '0 14px',
                          height: 50,
                          transition: 'background 100ms',
                          maxWidth: 80,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{
                          color: isSelRow ? (rowDept.line?.color || '#60A5FA') : isHovRow ? '#F1F5F9' : '#94A3B8',
                          fontSize: 12,
                          fontWeight: isSelRow ? 800 : 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'block',
                          maxWidth: 65,
                          transition: 'color 100ms',
                        }}>
                          {rowDept.name}
                        </span>
                      </td>

                      {/* Matrix cells */}
                      {colDepartments.map((colDept) => {
                        const rel = relationMap.get(`${rowDept.id}-${colDept.id}`)
                        const cfg = rel ? (STRENGTH_CFG[rel.strength] || STRENGTH_CFG.medium) : null
                        const isHovCol = hoveredColId === String(colDept.id)
                        const isHighlit = isHovRow || isHovCol

                        const bg = rel
                          ? isHighlit ? cfg.bg.replace('0.', '0.') : cfg.bg
                          : isHighlit ? 'rgba(255,255,255,0.022)' : 'transparent'

                        return (
                          <td
                            key={`${rowDept.id}-${colDept.id}`}
                            style={{
                              width: 52, height: 50,
                              textAlign: 'center',
                              verticalAlign: 'middle',
                              background: bg,
                              borderBottom: '1px solid rgba(148,163,184,0.06)',
                              borderRight: '1px solid rgba(148,163,184,0.05)',
                              cursor: rel ? 'pointer' : 'default',
                              transition: 'background 100ms',
                            }}
                            onMouseEnter={(e) => onCellEnter(e, rowDept, colDept, rel)}
                            onMouseMove={onCellMove}
                            onMouseLeave={onCellLeave}
                          >
                            {rel ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <StrengthDots strength={rel.strength} />
                                {rel.is_critical && (
                                  <span style={{ fontSize: 10, lineHeight: 1 }}>⚡</span>
                                )}
                                {!rel.is_critical && rel.is_bidirectional && (
                                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', lineHeight: 1 }}>↔</span>
                                )}
                              </div>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 14, paddingLeft: 2, flexWrap: 'wrap' }}>
        {Object.entries(STRENGTH_CFG).map(([key, cfg]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: i <= cfg.dots ? cfg.color : 'rgba(255,255,255,0.1)',
                }} />
              ))}
            </div>
            <span style={{ color: '#475569', fontSize: 11 }}>{cfg.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11 }}>⚡</span>
          <span style={{ color: '#475569', fontSize: 11 }}>Критична</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#475569', fontSize: 11 }}>↔</span>
          <span style={{ color: '#475569', fontSize: 11 }}>Двостороннє</span>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null)
  const [hoveredDepartmentId, setHoveredDepartmentId] = useState(null)
  const [hoveredRelationId, setHoveredRelationId] = useState(null)
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [selectedGeoId, setSelectedGeoId] = useState('')
  const [viewMode, setViewMode] = useState('metro')
  const [layoutPositions, setLayoutPositions] = useState(new Map())
  const [searchQuery, setSearchQuery] = useState('')
  const [isFullCardOpen, setIsFullCardOpen] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [isDepartmentInfoExpanded, setIsDepartmentInfoExpanded] = useState(false)
  const [isRelationsPanelOpen, setIsRelationsPanelOpen] = useState(false)
  const [expandedRelationGroups, setExpandedRelationGroups] = useState({})
  const [isCompactView, setIsCompactView] = useState(() => window.innerWidth < 1180)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [showLegendPopover, setShowLegendPopover] = useState(false)
  const [mapResetKey, setMapResetKey] = useState(0)
  const [typeFilter, setTypeFilter] = useState({ regional: true, service: true })
  const isPublicView = payload?.mode === 'public'
  const currentVisualizationUser = payload?.user || null

  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const handleVisualizationLogin = async () => {
    setLoginError('')

    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError('Введіть логін і пароль')
      return
    }

    try {
      setLoginLoading(true)

      await axios.post('/api/visualization-login', {
        username: loginUsername,
        password: loginPassword,
      })

      window.location.reload()
    } catch (error) {
      setLoginError(
        error?.response?.data?.message || 'Помилка авторизації',
      )
    } finally {
      setLoginLoading(false)
    }
  }

  const handleVisualizationLogout = async () => {
    try {
      await axios.post('/api/visualization-logout')
    } catch (error) {
      console.error(error)
    } finally {
      window.location.href = '/visualization/'
    }
  }

  useEffect(() => {
    const handleResize = () => setIsCompactView(window.innerWidth < 1180)

    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const params = {}

    if (selectedBrandId) params.brand_id = selectedBrandId
    if (selectedGeoId) params.geo_id = selectedGeoId

    setLoading(true)
    setSelectedDepartmentId(null)
    setHoveredDepartmentId(null)
    setIsFullCardOpen(false)
    setSelectedPerson(null)
    setIsDepartmentInfoExpanded(false)
    setIsRelationsPanelOpen(false)
    setHoveredRelationId(null)

    axios
      .get('/visualization/api/map', { params })
      .then((response) => {
        setPayload(response.data)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [selectedBrandId, selectedGeoId])

  const selectedDepartment = useMemo(() => {
    if (!payload || !selectedDepartmentId) return null

    return payload.lines
      .flatMap((line) => line.stations.map((station) => ({ ...station, line })))
      .find((station) => String(station.id) === selectedDepartmentId)
  }, [payload, selectedDepartmentId])

  const activeDepartmentId = selectedDepartmentId || hoveredDepartmentId

  const connectedDepartmentIds = useMemo(() => {
    const connected = new Set()

    if (!payload || !activeDepartmentId) return connected

    payload.relations.forEach((relation) => {
      const sourceId = String(relation.source)
      const targetId = String(relation.target)

      if (sourceId === activeDepartmentId) connected.add(targetId)
      if (targetId === activeDepartmentId) connected.add(sourceId)
    })

    return connected
  }, [payload, activeDepartmentId])

  const hubDepartmentIds = useMemo(() => {
    const relationCounts = new Map()

    if (!payload) return new Set()

    payload.relations.forEach((relation) => {
      const sourceId = String(relation.source)
      const targetId = String(relation.target)

      relationCounts.set(sourceId, (relationCounts.get(sourceId) || 0) + 1)
      relationCounts.set(targetId, (relationCounts.get(targetId) || 0) + 1)
    })

    return new Set(
      Array.from(relationCounts.entries())
        .filter(([, count]) => count >= 3)
        .map(([departmentId]) => departmentId),
    )
  }, [payload])

  const nodes = useMemo(() => {
    if (!payload) return []
    return buildMetroNodes(
      payload.lines,
      layoutPositions,
      selectedDepartmentId,
      hoveredDepartmentId,
      connectedDepartmentIds,
      hubDepartmentIds,
    )
  }, [payload, layoutPositions, selectedDepartmentId, hoveredDepartmentId, connectedDepartmentIds, hubDepartmentIds])

  const orbitLayout = useMemo(() => {
    if (!payload) return { nodes: [], ringEdges: [] }

    return buildOrbitNodes(
      payload.lines,
      selectedDepartmentId,
      hoveredDepartmentId,
      connectedDepartmentIds,
      hubDepartmentIds,
    )
  }, [payload, selectedDepartmentId, hoveredDepartmentId, connectedDepartmentIds, hubDepartmentIds])

  const orbitNodes = orbitLayout.nodes

  useEffect(() => {
    if (!payload) return

    buildElkLayout(payload.lines, payload.relations).then((positions) => {
      setLayoutPositions(positions)
    })
  }, [payload])

  const edges = useMemo(() => {
    if (!payload) return []
    return buildMetroEdges(payload.lines, payload.relations, selectedDepartmentId, hoveredDepartmentId)
  }, [payload, selectedDepartmentId, hoveredDepartmentId])

  const orbitEdges = useMemo(() => {
    if (!payload) return []
    const relationEdges = buildOrbitRelationEdges(payload.relations, selectedDepartmentId, hoveredDepartmentId)
    return [...orbitLayout.ringEdges, ...relationEdges]
  }, [payload, orbitLayout, selectedDepartmentId, hoveredDepartmentId])

  const departments = useMemo(() => {
    if (!payload) return []

    return payload.lines.flatMap((line) =>
      line.stations.map((station) => ({ ...station, line })),
    )
  }, [payload])

  const selectedRelations = useMemo(() => {
    if (!payload || !selectedDepartmentId) return []

    const selectedFromDepartmentPayload = selectedDepartment?.relations || []

    if (selectedFromDepartmentPayload.length > 0) {
      return selectedFromDepartmentPayload
    }

    return payload.relations.filter((relation) => {
      const sourceId = String(relation.source)
      const targetId = String(relation.target)

      return sourceId === selectedDepartmentId || targetId === selectedDepartmentId
    })
  }, [payload, selectedDepartmentId, selectedDepartment])

  const selectedRelationCards = useMemo(() => {
    if (!selectedDepartmentId) return []

    return selectedRelations.map((relation) => {
      const sourceId = String(relation.source_department_id || relation.source)
      const targetId = String(relation.target_department_id || relation.target)
      const connectedDepartmentId = String(
        relation.connected_department_id || (sourceId === selectedDepartmentId ? targetId : sourceId),
      )
      const connectedDepartment = departments.find((department) => String(department.id) === connectedDepartmentId)
      const selectedIsSource = sourceId === selectedDepartmentId
      const directionLabel = relation.is_bidirectional
        ? 'Двостороння'
        : selectedIsSource
          ? 'Вихідна'
          : 'Вхідна'

      return {
        ...relation,
        connectedDepartmentId,
        connectedDepartment,
        connectedDepartmentName:
          relation.connected_department_name ||
          connectedDepartment?.name ||
          relation.target_department_name ||
          relation.source_department_name ||
          `Department #${connectedDepartmentId}`,
        directionLabel,
      }
    })
  }, [selectedRelations, selectedDepartmentId, departments])

  const groupedRelationCards = useMemo(() => {
    const priorityOrder = {
      high: 0,
      middle: 1,
      mid: 1,
      low: 2,
    }

    const groups = new Map()

    selectedRelationCards.forEach((relation) => {
      const groupId = String(relation.connectedDepartmentId)
      const groupName = relation.connectedDepartmentName || `Department #${groupId}`
      const groupDepartment = relation.connectedDepartment || null
      const groupColor = groupDepartment?.line?.color || '#60A5FA'

      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          name: groupName,
          department: groupDepartment,
          color: groupColor,
          relations: [],
          highestPriority: 'low',
        })
      }

      const group = groups.get(groupId)
      group.relations.push(relation)

      const currentPriority = String(group.highestPriority || 'low').toLowerCase()
      const nextPriority = String(relation.strength || relation.priority || 'middle').toLowerCase()

      if ((priorityOrder[nextPriority] ?? 1) < (priorityOrder[currentPriority] ?? 1)) {
        group.highestPriority = nextPriority
      }
    })

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        relationCount: group.relations.length,
        criticalCount: group.relations.filter((relation) => relation.is_critical).length,
      }))
      .sort((firstGroup, secondGroup) => {
        const firstPriority = priorityOrder[String(firstGroup.highestPriority || 'middle').toLowerCase()] ?? 1
        const secondPriority = priorityOrder[String(secondGroup.highestPriority || 'middle').toLowerCase()] ?? 1

        if (firstPriority !== secondPriority) return firstPriority - secondPriority

        return firstGroup.name.localeCompare(secondGroup.name)
      })
  }, [selectedRelationCards])

  const selectedConnectedDepartments = useMemo(() => {
    if (!selectedDepartmentId) return []

    return Array.from(connectedDepartmentIds)
      .map((departmentId) => departments.find((department) => String(department.id) === departmentId))
      .filter(Boolean)
  }, [selectedDepartmentId, connectedDepartmentIds, departments])

  const totalDepartments = departments.length
  const totalRelations = payload?.relations?.length || 0
  const criticalRelations = payload?.relations?.filter((relation) => relation.is_critical).length || 0
  const selectedCriticalRelations = selectedRelations.filter((relation) => relation.is_critical).length

  const relationStrengthCounts = useMemo(() => {
    if (!payload) return { high: 0, medium: 0, low: 0 }
    const c = { high: 0, medium: 0, low: 0 }
    payload.relations.forEach((r) => {
      const s = String(r.strength || 'medium').toLowerCase()
      if (c[s] !== undefined) c[s]++
      else c.medium++
    })
    return c
  }, [payload])

  const metroPayload = useMemo(() => {
    if (!payload) return null
    if (typeFilter.regional && typeFilter.service) return payload
    return {
      ...payload,
      lines: payload.lines.filter((line) => {
        const t = (line.name || '').toLowerCase()
        const isReg = t.includes('регіон') || t.includes('regional')
        const isSvc = t.includes('сервіс') || t.includes('service')
        if (isReg) return typeFilter.regional
        if (isSvc) return typeFilter.service
        return true
      }),
    }
  }, [payload, typeFilter])

  const selectedDepartmentName = useMemo(() => {
    if (!selectedDepartmentId || !payload) return null
    for (const line of payload.lines) {
      const s = line.stations.find((st) => String(st.id) === selectedDepartmentId)
      if (s) return s.name
    }
    return null
  }, [selectedDepartmentId, payload])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'm' || e.key === 'M') setViewMode('metro')
      else if (e.key === 'o' || e.key === 'O') setViewMode('orbit')
      else if (e.key === 'x' || e.key === 'X') setViewMode('matrix')
      else if (e.key === 'r' || e.key === 'R') setMapResetKey((k) => k + 1)
      else if (e.key === 'Escape') {
        setSelectedDepartmentId(null)
        setIsFullCardOpen(false)
        setSelectedPerson(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    if (!normalizedQuery) return []

    return departments
      .filter((department) =>
        department.name.toLowerCase().includes(normalizedQuery) ||
        department.department_type_name?.toLowerCase().includes(normalizedQuery) ||
        department.brand_names?.some((brand) => brand.toLowerCase().includes(normalizedQuery)) ||
        department.geo_names?.some((geo) => geo.toLowerCase().includes(normalizedQuery)),
      )
      .slice(0, 8)
  }, [searchQuery, departments])

  const selectDepartmentFromSearch = (department) => {
    setSelectedDepartmentId(String(department.id))
    setHoveredDepartmentId(null)
    setIsFullCardOpen(false)
    setSelectedPerson(null)
    setSearchQuery('')

    if (viewMode === 'matrix') {
      setViewMode('orbit')
    }
  }

  if (loading) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', background: '#020817' }}>
        Loading Metro Visualization...
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
        background: '#020817',
        color: '#F8FAFC',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <aside
        style={{
          width: isSidebarCollapsed ? 56 : 290,
          minWidth: isSidebarCollapsed ? 56 : 290,
          height: '100%',
          borderRight: '1px solid rgba(30, 41, 59, 0.9)',
          background: '#06101F',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 220ms ease, min-width 220ms ease',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: isSidebarCollapsed ? '16px 10px' : '18px 20px', borderBottom: '1px solid rgba(30, 41, 59, 0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          {!isSidebarCollapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, lineHeight: '13px', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#64748B', marginBottom: 6 }}>
                CRM Visualization
              </div>
              <h1 style={{ margin: 0, fontSize: 22, lineHeight: '28px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                Company Map
              </h1>
              <p style={{ margin: '8px 0 0', color: '#64748B', fontSize: 12, lineHeight: '18px' }}>
                Структура компанії, зв'язки, GEO.
              </p>
            </div>
          )}
          {isSidebarCollapsed && (
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#60A5FA' }}>
              C
            </div>
          )}
          <button
            onClick={() => setIsSidebarCollapsed((v) => !v)}
            title={isSidebarCollapsed ? 'Розгорнути (Tab)' : 'Згорнути (Tab)'}
            style={{
              flexShrink: 0,
              width: 28, height: 28,
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.14)',
              background: 'rgba(15,23,42,0.6)',
              color: '#64748B',
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            {isSidebarCollapsed ? '›' : '‹'}
          </button>
        </div>

        {isPublicView && (
          <div
            style={{
              padding: 20,
              borderBottom: '1px solid rgba(30, 41, 59, 0.8)',
              background: 'rgba(2, 6, 23, 0.42)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#64748B',
                marginBottom: 12,
                fontWeight: 800,
              }}
            >
              Private Access
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <input
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                type="text"
                placeholder="Login"
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,.18)',
                  background: '#020617',
                  color: '#E2E8F0',
                  fontSize: 13,
                  padding: '10px 12px',
                  outline: 'none',
                }}
              />

              <input
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                type="password"
                placeholder="Password"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleVisualizationLogin()
                  }
                }}
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,.18)',
                  background: '#020617',
                  color: '#E2E8F0',
                  fontSize: 13,
                  padding: '10px 12px',
                  outline: 'none',
                }}
              />

              <button
                onClick={handleVisualizationLogin}
                disabled={loginLoading}
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(59,130,246,.35)',
                  background: 'rgba(37,99,235,.18)',
                  color: '#DBEAFE',
                  fontSize: 13,
                  fontWeight: 800,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  opacity: loginLoading ? 0.6 : 1,
                }}
              >
                {loginLoading ? 'Loading...' : 'Sign In'}
              </button>

              {loginError && (
                <div
                  style={{
                    color: '#FCA5A5',
                    fontSize: 12,
                    lineHeight: '18px',
                  }}
                >
                  {loginError}
                </div>
              )}
            </div>
          </div>
        )}


        <div style={{ flex: 1, overflowY: 'auto', padding: isSidebarCollapsed ? '12px 8px' : 20 }}>

          {/* Overview */}
          {!isSidebarCollapsed && (
            <section style={{ border: '1px solid rgba(30, 41, 59, 0.95)', background: 'rgba(15, 23, 42, 0.62)', borderRadius: 18, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748B', marginBottom: 14, fontWeight: 700 }}>
                Overview
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ border: '1px solid rgba(30, 41, 59, 0.95)', background: 'rgba(2, 6, 23, 0.82)', borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Відділів</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#60A5FA' }}>{totalDepartments}</div>
                </div>
                <div style={{ border: '1px solid rgba(30, 41, 59, 0.95)', background: 'rgba(2, 6, 23, 0.82)', borderRadius: 14, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Зв'язків</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#34D399' }}>{totalRelations}</div>
                </div>
              </div>
              {/* Strength breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { key: 'high',   label: 'Сильні',   color: '#22C55E', bg: 'rgba(34,197,94,0.18)' },
                  { key: 'medium', label: 'Середні',  color: '#3B82F6', bg: 'rgba(59,130,246,0.18)' },
                  { key: 'low',    label: 'Слабкі',   color: '#64748B', bg: 'rgba(100,116,139,0.18)' },
                ].map(({ key, label, color, bg }) => {
                  const count = relationStrengthCounts[key]
                  const pct = totalRelations > 0 ? (count / totalRelations) * 100 : 0
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748B', marginBottom: 3 }}>
                        <span>{label}</span>
                        <span style={{ color, fontWeight: 700 }}>{count}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 400ms ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Navigation */}
          <section style={{ marginBottom: 20 }}>
            {!isSidebarCollapsed && (
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748B', marginBottom: 12, fontWeight: 700 }}>
                Navigation
              </div>
            )}
            {[
              { mode: 'metro',  label: 'Metro Map',   shortcut: 'M', icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
                  <circle cx="2.5" cy="4" r="1.3" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="13.5" cy="4" r="1.3" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="2.5" cy="12" r="1.3" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="13.5" cy="12" r="1.3" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="8" cy="2" r="1.3" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="3.6" y1="4.9" x2="6.2" y2="6.9" stroke="currentColor" strokeWidth="1.1"/>
                  <line x1="12.4" y1="4.9" x2="9.8" y2="6.9" stroke="currentColor" strokeWidth="1.1"/>
                  <line x1="3.6" y1="11.1" x2="6.2" y2="9.1" stroke="currentColor" strokeWidth="1.1"/>
                  <line x1="12.4" y1="11.1" x2="9.8" y2="9.1" stroke="currentColor" strokeWidth="1.1"/>
                  <line x1="8" y1="3.3" x2="8" y2="5.8" stroke="currentColor" strokeWidth="1.1"/>
                </svg>
              )},
              { mode: 'orbit',  label: 'Orbit View',  shortcut: 'O', icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <ellipse cx="8" cy="8" rx="6.5" ry="3.2" stroke="currentColor" strokeWidth="1.3"/>
                  <ellipse cx="8" cy="8" rx="3.2" ry="6.5" stroke="currentColor" strokeWidth="1.3"/>
                  <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                </svg>
              )},
              { mode: 'matrix', label: 'Matrix View', shortcut: 'X', icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
                  <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
                  <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
                  <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity="0.35" stroke="currentColor" strokeWidth="1.3"/>
                </svg>
              )},
            ].map(({ mode, label, shortcut, icon }) => {
              const isActive = viewMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  title={`${label} (${shortcut})`}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: isActive ? '1px solid rgba(59,130,246,0.45)' : '1px solid rgba(30,41,59,0.95)',
                    background: isActive ? 'rgba(37,99,235,0.14)' : 'rgba(15,23,42,0.62)',
                    color: isActive ? '#E2E8F0' : '#94A3B8',
                    padding: isSidebarCollapsed ? '11px 0' : '11px 14px',
                    marginBottom: 8,
                    display: 'flex',
                    justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: isActive ? '#93C5FD' : 'currentColor' }}>
                    {icon}
                    {!isSidebarCollapsed && <span>{label}</span>}
                  </div>
                  {!isSidebarCollapsed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isActive && <span style={{ fontSize: 10, color: '#93C5FD' }}>Active</span>}
                      <span style={{ fontSize: 10, color: '#334155', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>
                        {shortcut}
                      </span>
                    </div>
                  )}
                </button>
              )
            })}
          </section>

          <section style={{ border: '1px solid rgba(30, 41, 59, 0.95)', background: 'rgba(15, 23, 42, 0.62)', borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748B', marginBottom: 14, fontWeight: 700 }}>
              Легенда
            </div>

            {/* Metro Map legend */}
            {viewMode === 'metro' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: '#CBD5E1' }}>
                {/* Lines from payload */}
                {payload?.lines?.length > 0 && (
                  <>
                    <div style={{ color: '#64748B', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                      Лінії
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 180, overflowY: 'auto' }}>
                      {payload.lines.map((line) => (
                        <div key={line.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{
                            width: 28, height: 4, borderRadius: 2,
                            background: line.color || '#64748B',
                            flexShrink: 0,
                          }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94A3B8', fontSize: 11 }}>
                            {line.name}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: 'rgba(148,163,184,0.12)', margin: '2px 0' }} />
                  </>
                )}
                {/* Stations */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: '#0D1B2A', border: '2.5px solid #94A3B8', flexShrink: 0 }} />
                  <span>Станція (відділ)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 999, background: '#0D1B2A', border: '3px solid #FFFFFF', flexShrink: 0 }} />
                  <span>Ключовий хаб</span>
                </div>
                <div style={{ height: 1, background: 'rgba(148,163,184,0.12)', margin: '2px 0' }} />
                {/* Relations */}
                <div style={{ color: '#64748B', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                  Зв'язки
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 28, height: 3, background: '#F97316', borderRadius: 2, flexShrink: 0 }} />
                  <span style={{ color: '#F97316' }}>Критичних: {criticalRelations}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 28, height: 0, borderTop: '2px dashed #94A3B8', flexShrink: 0, opacity: 0.5 }} />
                  <span>Звичайний зв'язок</span>
                </div>
                <div style={{ height: 1, background: 'rgba(148,163,184,0.12)', margin: '2px 0' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 28, height: 4, background: '#94A3B8', borderRadius: 2, flexShrink: 0 }} />
                  <span>Сильний</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 28, height: 2.5, background: '#94A3B8', borderRadius: 2, flexShrink: 0 }} />
                  <span>Середній</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 28, height: 1.5, background: '#94A3B8', borderRadius: 2, flexShrink: 0, opacity: 0.5 }} />
                  <span>Слабкий</span>
                </div>
              </div>
            )}

            {/* Orbit View legend */}
            {viewMode === 'orbit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 12, color: '#CBD5E1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, border: '2px solid #3B82F6', background: 'transparent', flexShrink: 0 }} />
                  <span>Регіональний — зовнішнє кільце</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, border: '2px solid #22C55E', background: 'transparent', flexShrink: 0 }} />
                  <span>Сервісний — внутрішня зона</span>
                </div>
                <div style={{ height: 1, background: 'rgba(148,163,184,0.12)', margin: '2px 0' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 32, height: 2, background: '#F97316', borderRadius: 2, flexShrink: 0 }} />
                  <span style={{ color: '#F97316' }}>Критичних: {criticalRelations}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 32, height: 0, borderTop: '2px dashed #94A3B8', flexShrink: 0, opacity: 0.5 }} />
                  <span>Звичайний зв'язок</span>
                </div>
                <div style={{ height: 1, background: 'rgba(148,163,184,0.12)', margin: '2px 0' }} />
                <div style={{ color: '#64748B', fontSize: 11, lineHeight: 1.5 }}>
                  Клік на відділ — відкриває картку з підвідділами та зв'язками
                </div>
              </div>
            )}

            {/* Matrix View legend */}
            {viewMode === 'matrix' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 12, color: '#CBD5E1' }}>
                <div style={{ color: '#64748B', fontSize: 11, marginBottom: 2 }}>
                  Рядки = Регіональні<br />Колонки = Сервісні
                </div>
                <div style={{ height: 1, background: 'rgba(148,163,184,0.12)', margin: '2px 0' }} />
                {[
                  { dots: 3, color: '#22C55E', label: 'Сильний зв\'язок' },
                  { dots: 2, color: '#3B82F6', label: 'Середній зв\'язок' },
                  { dots: 1, color: '#64748B', label: 'Слабкий зв\'язок' },
                ].map(({ dots, color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      {[1, 2, 3].map((i) => (
                        <div key={i} style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: i <= dots ? color : 'rgba(255,255,255,0.1)',
                        }} />
                      ))}
                    </div>
                    <span>{label}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: 'rgba(148,163,184,0.12)', margin: '2px 0' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>⚡</span>
                  <span style={{ color: '#F97316' }}>Критична ({criticalRelations})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, flexShrink: 0, color: '#94A3B8' }}>↔</span>
                  <span>Двосторонній зв'язок</span>
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>

      <section style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', background: '#020817' }}>
        <header
          style={{
            height: 62,
            minHeight: 62,
            borderBottom: '1px solid rgba(30, 41, 59, 0.9)',
            background: 'rgba(6, 16, 31, 0.94)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '0 20px',
            position: 'relative',
          }}
        >
          {/* Left: mode + breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 }}>
            <div style={{ minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#334155', lineHeight: 1 }}>
                Visualization Mode
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: '22px', display: 'flex', alignItems: 'center', gap: 7, marginTop: 1 }}>
                <span style={{ flexShrink: 0 }}>{viewMode === 'metro' ? 'Metro Topology' : viewMode === 'orbit' ? 'Orbit View' : 'Matrix View'}</span>
                {selectedDepartmentName && (
                  <>
                    <span style={{ color: '#334155', fontSize: 14, flexShrink: 0 }}>›</span>
                    <span style={{ color: '#60A5FA', fontSize: 14, fontWeight: 700, maxWidth: 160, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedDepartmentName}
                    </span>
                    <button
                      onClick={() => { setSelectedDepartmentId(null); setIsFullCardOpen(false) }}
                      style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                      title="Закрити (Esc)"
                    >×</button>
                  </>
                )}
              </div>
            </div>

            {/* Reset view button */}
            {viewMode !== 'matrix' && (
              <button
                onClick={() => setMapResetKey((k) => k + 1)}
                title="Скинути вид (R)"
                style={{
                  padding: '5px 9px', borderRadius: 8,
                  border: '1px solid rgba(148,163,184,0.16)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#64748B', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M11 6.5A4.5 4.5 0 1 1 6.5 2a4.5 4.5 0 0 1 3.18 1.32" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M9 2l.68 1.32L8.36 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>R</span>
              </button>
            )}

            {/* Type filter for Metro */}
            {viewMode === 'metro' && (
              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                {[
                  { key: 'regional', label: 'Регіональні', color: '#3B82F6' },
                  { key: 'service',  label: 'Сервісні',    color: '#22C55E' },
                ].map(({ key, label, color }) => (
                  <button
                    key={key}
                    onClick={() => setTypeFilter((f) => ({ ...f, [key]: !f[key] }))}
                    style={{
                      padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      cursor: 'pointer',
                      border: `1px solid ${typeFilter[key] ? color + '55' : 'rgba(148,163,184,0.14)'}`,
                      background: typeFilter[key] ? color + '18' : 'transparent',
                      color: typeFilter[key] ? color : '#475569',
                      transition: 'all 120ms',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: typeFilter[key] ? color : '#334155', flexShrink: 0 }} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <div style={{ position: 'relative' }}>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                type="text"
                placeholder="Пошук відділу..."
                style={{
                  width: 200,
                  borderRadius: 12,
                  border: '1px solid rgba(148, 163, 184, 0.24)',
                  background: '#020617',
                  color: '#E2E8F0',
                  fontSize: 13,
                  padding: '9px 12px',
                  outline: 'none',
                }}
              />

              {searchResults.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    width: 320,
                    maxHeight: 340,
                    overflowY: 'auto',
                    borderRadius: 16,
                    border: '1px solid rgba(148, 163, 184, 0.22)',
                    background: 'rgba(15, 23, 42, 0.98)',
                    boxShadow: '0 20px 70px rgba(0,0,0,0.38)',
                    zIndex: 100,
                    padding: 8,
                  }}
                >
                  {searchResults.map((department) => (
                    <button
                      key={department.id}
                      onClick={() => selectDepartmentFromSearch(department)}
                      style={{
                        width: '100%',
                        border: 'none',
                        borderRadius: 12,
                        background: 'transparent',
                        color: '#E2E8F0',
                        cursor: 'pointer',
                        padding: 10,
                        textAlign: 'left',
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: department.line.color,
                          boxShadow: `0 0 16px ${department.line.color}`,
                          flex: '0 0 auto',
                        }}
                      />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>
                          {department.name}
                        </span>
                        <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: '#94A3B8' }}>
                          {department.department_type_name || 'Department'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <select
              value={selectedBrandId}
              onChange={(event) => setSelectedBrandId(event.target.value)}
              style={{ minWidth: 120, borderRadius: 12, border: '1px solid rgba(148, 163, 184, 0.24)', background: '#020617', color: '#E2E8F0', fontSize: 13, padding: '9px 12px', outline: 'none' }}
            >
              <option value="">All brands</option>
              {payload.filters?.brands?.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>

            {payload.mode !== 'public' && (
              <select
                value={selectedGeoId}
                onChange={(event) => setSelectedGeoId(event.target.value)}
                style={{ minWidth: 120, borderRadius: 12, border: '1px solid rgba(148, 163, 184, 0.24)', background: '#020617', color: '#E2E8F0', fontSize: 13, padding: '9px 12px', outline: 'none' }}
              >
                <option value="">All GEO</option>
                {payload.filters?.geos?.map((geo) => (
                  <option key={geo.id} value={geo.id}>{geo.name}</option>
                ))}
              </select>
            )}

            {(selectedBrandId || selectedGeoId) && (
              <button
                onClick={() => {
                  setSelectedBrandId('')
                  setSelectedGeoId('')
                }}
                style={{ borderRadius: 12, border: '1px solid rgba(148, 163, 184, 0.24)', background: 'rgba(30, 41, 59, 0.9)', color: '#CBD5E1', fontSize: 13, padding: '9px 12px', cursor: 'pointer' }}
              >
                Reset
              </button>
            )}

            {/* Legend popover button */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setShowLegendPopover((v) => !v)}
                title="Легенда"
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: showLegendPopover ? '1px solid rgba(59,130,246,0.45)' : '1px solid rgba(148,163,184,0.16)',
                  background: showLegendPopover ? 'rgba(37,99,235,0.14)' : 'rgba(15,23,42,0.6)',
                  color: showLegendPopover ? '#60A5FA' : '#64748B',
                  fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >?</button>

              {showLegendPopover && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  width: 240, zIndex: 200,
                  background: 'rgba(6,16,31,0.98)', backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(148,163,184,0.18)', borderRadius: 16,
                  padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748B', marginBottom: 12, fontWeight: 700 }}>
                    Легенда — {viewMode === 'metro' ? 'Metro' : viewMode === 'orbit' ? 'Orbit' : 'Matrix'}
                  </div>
                  {viewMode === 'metro' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: '#CBD5E1' }}>
                      {payload?.lines?.map((line) => (
                        <div key={line.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 24, height: 3, borderRadius: 2, background: line.color, flexShrink: 0 }} />
                          <span style={{ color: '#94A3B8' }}>{line.name}</span>
                        </div>
                      ))}
                      <div style={{ height: 1, background: 'rgba(148,163,184,0.1)', margin: '2px 0' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 24, height: 3, background: '#F97316', borderRadius: 2, flexShrink: 0 }} />
                        <span>Критичний зв'язок</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 24, height: 0, borderTop: '2px dashed #94A3B8', flexShrink: 0, opacity: 0.5 }} />
                        <span>Звичайний зв'язок</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#0D1B2A', border: '2px solid #fff', flexShrink: 0 }} />
                        <span>Ключовий хаб</span>
                      </div>
                    </div>
                  )}
                  {viewMode === 'orbit' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: '#CBD5E1' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #3B82F6', background: 'transparent', flexShrink: 0 }} />
                        <span>Регіональний — зовнішнє кільце</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #22C55E', background: 'transparent', flexShrink: 0 }} />
                        <span>Сервісний — внутрішня зона</span>
                      </div>
                      <div style={{ height: 1, background: 'rgba(148,163,184,0.1)', margin: '2px 0' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 24, height: 2, background: '#F97316', borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ color: '#F97316' }}>Критичних: {criticalRelations}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 24, height: 0, borderTop: '2px dashed #94A3B8', flexShrink: 0, opacity: 0.5 }} />
                        <span>Звичайний зв'язок</span>
                      </div>
                    </div>
                  )}
                  {viewMode === 'matrix' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: '#CBD5E1' }}>
                      <div style={{ color: '#64748B', marginBottom: 2 }}>Рядки = Регіональні<br/>Колонки = Сервісні</div>
                      {[
                        { dots: 3, color: '#22C55E', label: 'Сильний' },
                        { dots: 2, color: '#3B82F6', label: 'Середній' },
                        { dots: 1, color: '#64748B', label: 'Слабкий' },
                      ].map(({ dots, color, label }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 2.5, flexShrink: 0 }}>
                            {[1,2,3].map((i) => (
                              <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i <= dots ? color : 'rgba(255,255,255,0.1)' }} />
                            ))}
                          </div>
                          <span>{label} зв'язок</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, flexShrink: 0 }}>⚡</span>
                        <span style={{ color: '#F97316' }}>Критична</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User chip */}
            {!isPublicView && currentVisualizationUser && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 12,
                border: '1px solid rgba(34,197,94,0.22)',
                background: 'rgba(34,197,94,0.07)',
                padding: '6px 10px 6px 6px',
                flexShrink: 0,
              }}>
                {/* Avatar */}
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'linear-gradient(135deg, #059669, #10B981)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, color: '#fff', flexShrink: 0,
                  letterSpacing: '0.02em',
                }}>
                  {(currentVisualizationUser?.display_name || currentVisualizationUser?.username || 'U')
                    .slice(0, 2).toUpperCase()}
                </div>
                {/* Name + role */}
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#86EFAC', whiteSpace: 'nowrap' }}>
                    {currentVisualizationUser?.display_name || currentVisualizationUser?.username}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748B', whiteSpace: 'nowrap' }}>
                    {currentVisualizationUser?.role || 'viewer'}
                  </div>
                </div>
                {/* Logout */}
                <button
                  onClick={handleVisualizationLogout}
                  title="Вийти"
                  style={{
                    marginLeft: 2,
                    padding: '4px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(148,163,184,0.16)',
                    background: 'rgba(15,23,42,0.6)',
                    color: '#94A3B8',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'color 150ms, background 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#F87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = 'rgba(15,23,42,0.6)' }}
                >
                  Вийти
                </button>
              </div>
            )}
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <main style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', background: '#020817' }}>
            {viewMode === 'metro' && (
              <MetroMap
                key={`metro-${mapResetKey}-${typeFilter.regional}-${typeFilter.service}`}
                payload={metroPayload}
                selectedDepartmentId={selectedDepartmentId}
                setSelectedDepartmentId={(departmentId) => {
                  setSelectedDepartmentId(departmentId)
                  setIsFullCardOpen(false)
                  setSelectedPerson(null)
                  setIsDepartmentInfoExpanded(false)
                  setIsRelationsPanelOpen(false)
                  setHoveredRelationId(null)
                }}
                setHoveredDepartmentId={setHoveredDepartmentId}
              />
            )}

            {viewMode === 'orbit' && (
              <>
                <OrbitMap
                  key={mapResetKey}
                  payload={payload}
                  selectedDepartmentId={selectedDepartmentId}
                  setSelectedDepartmentId={(id) => {
                    setSelectedDepartmentId(id)
                    setIsFullCardOpen(false)
                    setSelectedPerson(null)
                    setIsDepartmentInfoExpanded(false)
                    setIsRelationsPanelOpen(false)
                    setHoveredRelationId(null)
                  }}
                  setHoveredDepartmentId={setHoveredDepartmentId}
                />

                {payload && orbitNodes.length === 0 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', pointerEvents: 'none', zIndex: 20 }}>
                    Немає відділів для обраних фільтрів.
                  </div>
                )}
              </>
            )}

            {viewMode === 'matrix' && payload && (
              <MatrixView
                payload={payload}
                selectedDepartmentId={selectedDepartmentId}
                onSelectDepartment={(id) => {
                  setSelectedDepartmentId(id)
                  setIsFullCardOpen(false)
                  setSelectedPerson(null)
                  setIsDepartmentInfoExpanded(false)
                  setIsRelationsPanelOpen(false)
                }}
              />
            )}
          </main>

          <aside
            style={{
              width: selectedDepartment ? 360 : 72,
              minWidth: selectedDepartment ? 360 : 72,
              height: '100%',
              borderLeft: '1px solid rgba(30, 41, 59, 0.9)',
              background: '#06101F',
              display: 'flex',
              flexDirection: 'column',
              transition: 'width 220ms ease, min-width 220ms ease',
              overflow: 'hidden',
            }}
          >
            {!selectedDepartment && (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748B',
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Department Card
              </div>
            )}

            {selectedDepartment && (
              <>
                {/* Sidebar card header */}
                <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(30,41,59,0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#64748B', fontWeight: 700 }}>
                        {selectedDepartment.department_type_name || 'Відділ'}
                      </div>
                      {hubDepartmentIds.has(String(selectedDepartment.id)) && (
                        <span style={{ borderRadius: 6, border: '1px solid rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.13)', color: '#FDBA74', fontSize: 9, fontWeight: 800, padding: '2px 6px' }}>
                          Hub
                        </span>
                      )}
                    </div>
                    <h2 style={{ margin: 0, fontSize: 17, lineHeight: '22px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 270 }}>
                      {selectedDepartment.name}
                    </h2>
                  </div>
                  <button
                    onClick={() => { setSelectedDepartmentId(null); setHoveredDepartmentId(null); setIsFullCardOpen(false); setSelectedPerson(null); setIsDepartmentInfoExpanded(false); setIsRelationsPanelOpen(false); setHoveredRelationId(null) }}
                    style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(148,163,184,.16)', background: 'transparent', color: '#475569', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Закрити (Esc)"
                  >×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Description */}
                  <section style={{ borderRadius: 14, border: '1px solid rgba(30,41,59,0.9)', background: 'rgba(15,23,42,0.6)', padding: 14 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', marginBottom: 8, fontWeight: 700 }}>Опис</div>
                    {selectedDepartment.short_description ? (
                      <div
                        className="rich-text"
                        style={{ margin: 0, color: '#94A3B8', fontSize: 13, lineHeight: '20px' }}
                        dangerouslySetInnerHTML={{ __html: selectedDepartment.short_description }}
                      />
                    ) : (
                      <p style={{ margin: 0, color: '#334155', fontSize: 13, fontStyle: 'italic' }}>Не заповнено</p>
                    )}
                    {!isPublicView && (
                      <button
                        onClick={() => setIsFullCardOpen(true)}
                        style={{ width: '100%', marginTop: 12, borderRadius: 10, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(37,99,235,0.12)', color: '#93C5FD', padding: '9px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                      >
                        Відкрити повну картку →
                      </button>
                    )}
                    {isPublicView && (
                      <div style={{ marginTop: 10, borderRadius: 10, border: '1px solid rgba(148,163,184,0.15)', background: 'rgba(15,23,42,0.6)', color: '#475569', padding: '9px 12px', fontSize: 12 }}>
                        Детальна інформація доступна після входу.
                      </div>
                    )}
                  </section>

                  {/* Relation strength breakdown */}
                  {!isPublicView && selectedRelations.length > 0 && (
                    <section style={{ borderRadius: 14, border: '1px solid rgba(30,41,59,0.9)', background: 'rgba(15,23,42,0.6)', padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', fontWeight: 700 }}>Зв'язки</div>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#60A5FA' }}>{selectedRelations.length}</span>
                      </div>
                      {[
                        { key: 'high',   label: 'Сильні',  color: '#22C55E' },
                        { key: 'medium', label: 'Середні', color: '#3B82F6' },
                        { key: 'low',    label: 'Слабкі',  color: '#64748B' },
                      ].map(({ key, label, color }) => {
                        const cnt = selectedRelations.filter((r) => String(r.strength || 'medium').toLowerCase() === key).length
                        if (!cnt) return null
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <div style={{ display: 'flex', gap: 2.5, flexShrink: 0 }}>
                              {[1,2,3].map((i) => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: i <= (key === 'high' ? 3 : key === 'medium' ? 2 : 1) ? color : 'rgba(255,255,255,0.08)' }} />)}
                            </div>
                            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(cnt / selectedRelations.length) * 100}%`, background: color, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, color, fontWeight: 700, flexShrink: 0, minWidth: 14, textAlign: 'right' }}>{cnt}</span>
                          </div>
                        )
                      })}
                    </section>
                  )}

                  {/* Brands / GEO */}
                  {((selectedDepartment.brand_names?.length > 0) || (selectedDepartment.geo_names?.length > 0)) && (
                    <section style={{ borderRadius: 14, border: '1px solid rgba(30,41,59,0.9)', background: 'rgba(15,23,42,0.6)', padding: 14 }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', marginBottom: 10, fontWeight: 700 }}>Бренди / ГЕО</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {selectedDepartment.brand_names?.map((b) => (
                          <span key={b} style={{ borderRadius: 8, padding: '4px 9px', fontSize: 11, fontWeight: 700, border: '1px solid rgba(59,130,246,.3)', background: 'rgba(59,130,246,.1)', color: '#93C5FD' }}>{b}</span>
                        ))}
                        {selectedDepartment.geo_names?.map((g) => (
                          <span key={g} style={{ borderRadius: 8, padding: '4px 9px', fontSize: 11, fontWeight: 700, border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.1)', color: '#86EFAC' }}>{g}</span>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Connected departments */}
                  {!isPublicView && (
                    <section style={{ borderRadius: 14, border: '1px solid rgba(30,41,59,0.9)', background: 'rgba(15,23,42,0.6)', padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', fontWeight: 700 }}>Пов'язані відділи</div>
                        {selectedRelationCards.length > 0 && (
                          <button onClick={() => setIsRelationsPanelOpen(true)}
                            style={{ borderRadius: 7, border: '1px solid rgba(59,130,246,.3)', background: 'rgba(59,130,246,.1)', color: '#93C5FD', fontSize: 10, fontWeight: 800, padding: '3px 8px', cursor: 'pointer' }}>
                            Всі
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {selectedRelationCards.length > 0 ? selectedRelationCards.slice(0, 5).map((relation) => {
                          const sc = STRENGTH_CFG[relation.strength] || STRENGTH_CFG.medium
                          return (
                            <button key={relation.id}
                              onClick={() => { setSelectedDepartmentId(relation.connectedDepartmentId); setIsFullCardOpen(false); setSelectedPerson(null); setIsDepartmentInfoExpanded(false); setIsRelationsPanelOpen(false); setHoveredRelationId(null) }}
                              style={{ width: '100%', textAlign: 'left', borderRadius: 10, border: '1px solid rgba(30,41,59,0.8)', background: 'rgba(2,6,23,0.5)', color: '#E2E8F0', padding: '9px 11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9 }}
                            >
                              <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: sc.color, flexShrink: 0 }} />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{relation.connectedDepartmentName}</div>
                                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{relation.relation_type_name || relation.directionLabel}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                {[1,2,3].map((i) => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: i <= sc.dots ? sc.color : 'rgba(255,255,255,0.08)' }} />)}
                              </div>
                            </button>
                          )
                        }) : (
                          <span style={{ color: '#334155', fontSize: 12 }}>Немає активних зв'язків.</span>
                        )}
                        {selectedRelationCards.length > 5 && (
                          <button onClick={() => setIsRelationsPanelOpen(true)}
                            style={{ borderRadius: 10, border: '1px solid rgba(148,163,184,.14)', background: 'transparent', color: '#475569', fontSize: 11, fontWeight: 700, padding: '7px 10px', cursor: 'pointer' }}>
                            + Ще {selectedRelationCards.length - 5}
                          </button>
                        )}
                      </div>
                    </section>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </section>

      {!isPublicView && isFullCardOpen && selectedDepartment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(2, 6, 23, 0.78)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}
        >
          <div
            style={{
              width: 'min(1100px, 100%)',
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: 28,
              border: '1px solid rgba(148,163,184,.16)',
              background: 'linear-gradient(180deg, #0F172A 0%, #020617 100%)',
              boxShadow: '0 30px 120px rgba(0,0,0,.55)',
            }}
          >
            <div
              style={{
                padding: '28px 32px',
                borderBottom: '1px solid rgba(30,41,59,.9)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 20,
              }}
            >
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#64748B', marginBottom: 10 }}>
                  Картка відділу
                </div>

                <h2 style={{ margin: 0, fontSize: 34, lineHeight: '40px', fontWeight: 900, color: '#F8FAFC' }}>
                  {selectedDepartment.name}
                </h2>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  {selectedDepartment.size_label && (
                    <span style={{ borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700, border: '1px solid rgba(148,163,184,.25)', background: 'rgba(148,163,184,.12)', color: '#CBD5E1' }}>
                      Size: {selectedDepartment.size_label}
                    </span>
                  )}

                  {selectedDepartment.leaders?.slice(0, 3).map((leader) => (
                    <button
                      key={leader.id || leader.user?.id || leader.user?.email}
                      onClick={() => setSelectedPerson({ ...leader, source: 'leader' })}
                      title={leader.inherited ? `Успадковано від ${leader.inherited_from}` : ''}
                      style={{
                        borderRadius: 999,
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        border: leader.inherited ? '1px solid rgba(148,163,184,.35)' : '1px solid rgba(251,146,60,.35)',
                        background: leader.inherited ? 'rgba(148,163,184,.12)' : 'rgba(251,146,60,.12)',
                        color: leader.inherited ? '#CBD5E1' : '#FDBA74',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {leader.inherited ? '↑' : 'TL:'} {leader.user?.name || leader.user?.full_name || leader.user?.email || 'Без імені'}
                      {leader.user?.telegram ? ` · ${leader.user.telegram}` : ''}
                      {leader.inherited && (
                        <span style={{ fontSize: 10, opacity: 0.7 }}>({leader.inherited_from})</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  setIsFullCardOpen(false)
                  setSelectedPerson(null)
                  setIsRelationsPanelOpen(false)
                }}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(148,163,184,.18)',
                  background: 'rgba(15,23,42,.8)',
                  color: '#CBD5E1',
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Закрити
              </button>
            </div>

            <div
              style={{
                padding: isCompactView ? 18 : 32,
                display: 'grid',
                gridTemplateColumns: isCompactView ? '1fr' : '1.45fr .85fr',
                gap: 24,
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <section
                  style={{
                    borderRadius: 22,
                    border: '1px solid rgba(30,41,59,.9)',
                    background: 'rgba(15,23,42,.62)',
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B', marginBottom: 18, fontWeight: 800 }}>
                    Повна інформація та функціонал
                  </div>

                  {(selectedDepartment.full_description || selectedDepartment.short_description) ? (
                    <div
                      className="rich-text"
                      style={{
                        color: '#CBD5E1',
                        fontSize: 15,
                        lineHeight: '28px',
                        maxHeight: isDepartmentInfoExpanded ? 'none' : 180,
                        overflow: 'hidden',
                      }}
                      dangerouslySetInnerHTML={{ __html: selectedDepartment.full_description || selectedDepartment.short_description }}
                    />
                  ) : (
                    <div style={{ color: '#475569', fontStyle: 'italic', fontSize: 15 }}>Повна інформація ще не заповнена.</div>
                  )}

                  {(selectedDepartment.full_description || selectedDepartment.short_description || '').length > 420 && (
                    <button
                      onClick={() => setIsDepartmentInfoExpanded((value) => !value)}
                      style={{ marginTop: 16, borderRadius: 14, border: '1px solid rgba(59,130,246,.35)', background: 'rgba(59,130,246,.12)', color: '#93C5FD', padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                    >
                      {isDepartmentInfoExpanded ? 'Сховати' : 'Показати більше'}
                    </button>
                  )}
                </section>

                <section
                  style={{
                    borderRadius: 22,
                    border: '1px solid rgba(30,41,59,.9)',
                    background: 'rgba(15,23,42,.62)',
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B', marginBottom: 18, fontWeight: 800 }}>
                    Підвідділи
                  </div>

                  {selectedDepartment.children?.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {selectedDepartment.children.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => { setSelectedDepartmentId(String(child.id)); setSelectedPerson(null); setIsDepartmentInfoExpanded(false) }}
                          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 14, border: '1px solid rgba(30,41,59,.8)', background: 'rgba(2,6,23,.4)', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
                        >
                          <div style={{ width: 3, height: 32, borderRadius: 2, background: child.line?.color || '#64748B', flexShrink: 0 }} />
                          <div>
                            <div style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 800 }}>{child.name}</div>
                            <div style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>{child.department_type_name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#475569', fontSize: 13, fontStyle: 'italic' }}>Підвідділів ще немає.</div>
                  )}
                </section>

                <section
                  style={{
                    borderRadius: 22,
                    border: '1px solid rgba(30,41,59,.9)',
                    background: 'rgba(15,23,42,.62)',
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B', marginBottom: 18, fontWeight: 800 }}>
                    Команда
                  </div>

                  {selectedDepartment.people?.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                      {selectedDepartment.people.map((person) => {
                        const name = person.user?.name || person.user?.full_name || person.user?.username || person.user?.email || '?'
                        const initials = name.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?'
                        const role = person.position || person.user?.position || person.user?.role || null
                        return (
                          <button
                            key={person.id || person.user?.id || person.user?.email}
                            onClick={() => setSelectedPerson({ ...person, source: 'team' })}
                            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid rgba(30,41,59,.8)', borderRadius: 14, background: 'rgba(2,6,23,.4)', padding: 12, display: 'flex', gap: 11, alignItems: 'flex-start' }}
                          >
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #1D4ED8, #0EA5E9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                              {initials}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                              {role && <div style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>{role}</div>}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                                {person.user?.email && (
                                  <a href={`mailto:${person.user.email}`} onClick={(e) => e.stopPropagation()}
                                    style={{ borderRadius: 6, padding: '3px 7px', fontSize: 11, border: '1px solid rgba(59,130,246,.3)', background: 'rgba(59,130,246,.1)', color: '#93C5FD', textDecoration: 'none' }}>
                                    {person.user.email}
                                  </a>
                                )}
                                {person.user?.telegram && (
                                  <span style={{ borderRadius: 6, padding: '3px 7px', fontSize: 11, border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.1)', color: '#86EFAC' }}>
                                    {person.user.telegram}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ color: '#475569', fontSize: 13, fontStyle: 'italic' }}>Команда ще не додана.</div>
                  )}
                </section>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <section
                  style={{
                    borderRadius: 22,
                    border: '1px solid rgba(30,41,59,.9)',
                    background: 'rgba(15,23,42,.62)',
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B', marginBottom: 18, fontWeight: 800 }}>
                    Контакти відділу
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {[
                      { label: 'Email', value: selectedDepartment.contacts?.email || selectedDepartment.email, href: (v) => `mailto:${v}` },
                      { label: 'Telegram', value: selectedDepartment.contacts?.telegram || selectedDepartment.telegram, href: (v) => v.startsWith('@') ? `https://t.me/${v.slice(1)}` : v },
                      { label: 'Чат', value: selectedDepartment.contacts?.chat_link || selectedDepartment.chat_link, href: (v) => v },
                    ].map(({ label, value, href }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: '#475569', flexShrink: 0 }}>{label}</span>
                        {value ? (
                          <a href={href(value)} target="_blank" rel="noreferrer"
                            style={{ fontSize: 13, color: '#93C5FD', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                            {value}
                          </a>
                        ) : (
                          <span style={{ fontSize: 13, color: '#334155', fontStyle: 'italic' }}>Не вказано</span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section
                  style={{
                    borderRadius: 22,
                    border: '1px solid rgba(30,41,59,.9)',
                    background: 'rgba(15,23,42,.62)',
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B', marginBottom: 18, fontWeight: 800 }}>
                    Бренди та ГЕО
                  </div>

                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 7, fontWeight: 600 }}>Бренди</div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {selectedDepartment.brand_names?.length > 0 ? selectedDepartment.brand_names.map((brand) => (
                          <span key={brand} style={{ borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, border: '1px solid rgba(59,130,246,.3)', background: 'rgba(59,130,246,.1)', color: '#93C5FD' }}>
                            {brand}
                          </span>
                        )) : <span style={{ color: '#334155', fontSize: 13, fontStyle: 'italic' }}>Не вказано</span>}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 7, fontWeight: 600 }}>ГЕО</div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {selectedDepartment.geo_names?.length > 0 ? selectedDepartment.geo_names.map((geo) => (
                          <span key={geo} style={{ borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.1)', color: '#86EFAC' }}>
                            {geo}
                          </span>
                        )) : <span style={{ color: '#334155', fontSize: 13, fontStyle: 'italic' }}>Не вказано</span>}
                      </div>
                    </div>
                  </div>
                </section>

                <section
                  style={{
                    borderRadius: 22,
                    border: '1px solid rgba(30,41,59,.9)',
                    background: 'rgba(15,23,42,.62)',
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B', marginBottom: 18, fontWeight: 800 }}>
                    Зв'язки
                  </div>

                  <button
                    onClick={() => setIsRelationsPanelOpen(true)}
                    style={{ width: '100%', textAlign: 'left', border: '1px solid rgba(59,130,246,.22)', background: 'rgba(2,6,23,.38)', borderRadius: 16, padding: 16, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>Всього зв'язків</span>
                      <span style={{ fontSize: 26, fontWeight: 900, color: '#60A5FA' }}>{selectedRelations.length}</span>
                    </div>
                    {[
                      { key: 'high',   label: 'Сильні',  color: '#22C55E', dots: 3 },
                      { key: 'medium', label: 'Середні', color: '#3B82F6', dots: 2 },
                      { key: 'low',    label: 'Слабкі',  color: '#64748B', dots: 1 },
                    ].map(({ key, label, color, dots }) => {
                      const cnt = selectedRelations.filter((r) => String(r.strength || 'medium').toLowerCase() === key).length
                      if (!cnt) return null
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                          <div style={{ display: 'flex', gap: 2.5, flexShrink: 0 }}>
                            {[1,2,3].map((i) => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i <= dots ? color : 'rgba(255,255,255,0.08)' }} />)}
                          </div>
                          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${selectedRelations.length > 0 ? (cnt / selectedRelations.length) * 100 : 0}%`, background: color, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 16, textAlign: 'right' }}>{cnt}</span>
                        </div>
                      )
                    })}
                    <div style={{ marginTop: 10, color: '#475569', fontSize: 11 }}>
                      Натисніть для деталей →
                    </div>
                  </button>
                </section>

                <section
                  style={{
                    borderRadius: 22,
                    border: '1px solid rgba(30,41,59,.9)',
                    background: 'rgba(15,23,42,.62)',
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B', marginBottom: 18, fontWeight: 800 }}>
                    Теги
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {selectedDepartment.tags?.map((tag) => (
                      <span key={tag.id || tag.name} style={{ borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, border: '1px solid rgba(148,163,184,.2)', background: 'rgba(148,163,184,.08)', color: '#94A3B8' }}>
                        {tag.name}
                      </span>
                    ))}
                    {(!selectedDepartment.tags || selectedDepartment.tags.length === 0) && (
                      <span style={{ color: '#334155', fontSize: 13, fontStyle: 'italic' }}>Теги ще не додані.</span>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isPublicView && isRelationsPanelOpen && selectedDepartment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 240,
            background: 'rgba(2, 6, 23, 0.58)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            gridTemplateColumns: isCompactView ? '1fr' : '1fr minmax(400px, 500px)',
          }}
          onClick={() => setIsRelationsPanelOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              minWidth: 0,
              height: '100%',
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 'min(780px, 100%)',
                minHeight: 440,
                borderRadius: 28,
                border: '1px solid rgba(148,163,184,.18)',
                background: 'rgba(15,23,42,.72)',
                boxShadow: '0 30px 120px rgba(0,0,0,.42)',
                padding: 28,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(148,163,184,.18) 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: .35 }} />

              <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'center', paddingTop: 150 }}>
                <div style={{ borderRadius: 999, border: '4px solid #FFFFFF', background: '#020617', color: '#F8FAFC', padding: '13px 24px', fontWeight: 900, boxShadow: '0 0 38px rgba(59,130,246,.35)' }}>
                  {selectedDepartment.name}
                </div>
              </div>

              {groupedRelationCards.map((group, index) => {
                const angle = groupedRelationCards.length > 0 ? (2 * Math.PI * index) / groupedRelationCards.length - Math.PI / 2 : 0
                const x = 50 + 36 * Math.cos(angle)
                const y = 50 + 34 * Math.sin(angle)
                const isActive = group.relations.some((relation) => hoveredRelationId === relation.id)

                return (
                  <button
                    key={group.id}
                    onMouseEnter={() => setHoveredRelationId(group.relations[0]?.id || null)}
                    onMouseLeave={() => setHoveredRelationId(null)}
                    onClick={() => {
                      setExpandedRelationGroups((current) => ({
                        ...current,
                        [group.id]: current[group.id] === false ? true : !current[group.id],
                      }))
                    }}
                    style={{
                      position: 'absolute',
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 3,
                      borderRadius: 999,
                      border: group.criticalCount > 0 ? '3px solid #F97316' : `3px solid ${group.color}`,
                      background: '#020617',
                      color: '#F8FAFC',
                      padding: '10px 16px',
                      fontSize: 13,
                      fontWeight: 900,
                      cursor: 'pointer',
                      boxShadow: isActive ? `0 0 0 4px rgba(255,255,255,.16), 0 0 36px ${group.color}88` : '0 0 18px rgba(0,0,0,.35)',
                      opacity: hoveredRelationId && !isActive ? .35 : 1,
                    }}
                  >
                    {group.name}
                    {group.relationCount > 1 && (
                      <span style={{ marginLeft: 8, color: '#93C5FD', fontSize: 11 }}>
                        ×{group.relationCount}
                      </span>
                    )}
                  </button>
                )
              })}

              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
                {groupedRelationCards.map((group, index) => {
                  const angle = groupedRelationCards.length > 0 ? (2 * Math.PI * index) / groupedRelationCards.length - Math.PI / 2 : 0
                  const x = 50 + 36 * Math.cos(angle)
                  const y = 50 + 34 * Math.sin(angle)
                  const isActive = group.relations.some((relation) => hoveredRelationId === relation.id)

                  return (
                    <line
                      key={group.id}
                      x1="50%"
                      y1="50%"
                      x2={`${x}%`}
                      y2={`${y}%`}
                      stroke={group.criticalCount > 0 ? '#F97316' : group.color}
                      strokeWidth={isActive ? 4 : 2}
                      strokeDasharray={group.criticalCount > 0 ? '0' : '8 8'}
                      opacity={hoveredRelationId ? (isActive ? 1 : .12) : .55}
                    />
                  )
                })}
              </svg>
            </div>
          </div>

          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              background: '#06101F',
              borderLeft: '1px solid rgba(148,163,184,.18)',
              boxShadow: '-30px 0 120px rgba(0,0,0,.5)',
              padding: 24,
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#64748B', marginBottom: 8 }}>
                  Зв'язки відділу
                </div>
                <h3 style={{ margin: 0, fontSize: 24, lineHeight: '30px', fontWeight: 900 }}>
                  {selectedDepartment.name}
                </h3>
                <div style={{ marginTop: 8, color: '#94A3B8', fontSize: 13 }}>
                  {groupedRelationCards.length} пов'язаних відділів · {selectedRelationCards.length} зв'язків
                </div>
              </div>

              <button
                onClick={() => setIsRelationsPanelOpen(false)}
                style={{ borderRadius: 14, border: '1px solid rgba(148,163,184,.18)', background: 'rgba(15,23,42,.8)', color: '#CBD5E1', padding: '9px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Закрити
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {groupedRelationCards.length > 0 ? groupedRelationCards.map((group) => {
                const isExpanded = expandedRelationGroups[group.id] !== false

                return (
                  <section
                    key={group.id}
                    style={{
                      borderRadius: 20,
                      border: '1px solid rgba(148,163,184,.18)',
                      background: 'rgba(15,23,42,.62)',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => {
                        setExpandedRelationGroups((current) => ({
                          ...current,
                          [group.id]: !isExpanded,
                        }))
                      }}
                      onMouseEnter={() => setHoveredRelationId(group.relations[0]?.id || null)}
                      onMouseLeave={() => setHoveredRelationId(null)}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'rgba(2,6,23,.28)',
                        color: '#F8FAFC',
                        padding: 16,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 999, background: group.color, boxShadow: `0 0 16px ${group.color}` }} />
                          <span style={{ fontSize: 15, fontWeight: 900 }}>{group.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ color: '#64748B', fontSize: 12 }}>{group.relationCount} {group.relationCount === 1 ? 'зв\'язок' : 'зв\'язків'}</span>
                          <div style={{ display: 'flex', gap: 2.5 }}>
                            {[1,2,3].map((i) => {
                              const dots = group.highestPriority === 'high' ? 3 : group.highestPriority === 'medium' ? 2 : 1
                              const color = group.highestPriority === 'high' ? '#22C55E' : group.highestPriority === 'medium' ? '#3B82F6' : '#64748B'
                              return <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i <= dots ? color : 'rgba(255,255,255,0.1)' }} />
                            })}
                          </div>
                          {group.criticalCount > 0 && (
                            <span style={{ fontSize: 10, color: '#F97316', fontWeight: 700 }}>⚡ {group.criticalCount}</span>
                          )}
                        </div>
                      </div>
                      <span style={{ color: '#93C5FD', fontSize: 18, fontWeight: 900 }}>
                        {isExpanded ? '−' : '+'}
                      </span>
                    </button>

                    {isExpanded && (
                      <div style={{ display: 'grid', gap: 10, padding: 14 }}>
                        {group.relations.map((relation) => {
                          const sc = STRENGTH_CFG[relation.strength] || STRENGTH_CFG.medium
                          const isHov = hoveredRelationId === relation.id
                          return (
                            <button
                              key={relation.id}
                              onMouseEnter={() => setHoveredRelationId(relation.id)}
                              onMouseLeave={() => setHoveredRelationId(null)}
                              onClick={() => { setSelectedDepartmentId(group.id); setIsRelationsPanelOpen(false); setIsDepartmentInfoExpanded(false) }}
                              style={{
                                width: '100%', textAlign: 'left', cursor: 'pointer',
                                borderRadius: 14,
                                border: isHov ? '1px solid rgba(59,130,246,.6)' : relation.is_critical ? '1px solid rgba(249,115,22,.35)' : '1px solid rgba(148,163,184,.14)',
                                background: isHov ? 'rgba(59,130,246,.12)' : relation.is_critical ? 'rgba(249,115,22,.08)' : 'rgba(2,6,23,.3)',
                                padding: 14, transition: 'all 100ms',
                              }}
                            >
                              {/* Header row */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 3, height: 20, borderRadius: 2, background: sc.color, flexShrink: 0 }} />
                                  <span style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 800 }}>
                                    {relation.relation_type_name || relation.relation_type || 'Зв\'язок'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: 2.5, flexShrink: 0 }}>
                                  {[1,2,3].map((i) => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i <= sc.dots ? sc.color : 'rgba(255,255,255,0.1)' }} />)}
                                </div>
                              </div>
                              {/* Tags row */}
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                <span style={{ borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, border: '1px solid rgba(148,163,184,.15)', background: 'rgba(15,23,42,.6)', color: '#94A3B8' }}>
                                  {relation.directionLabel}
                                </span>
                                {relation.is_critical && (
                                  <span style={{ borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, border: '1px solid rgba(249,115,22,.35)', background: 'rgba(249,115,22,.1)', color: '#FDBA74' }}>
                                    ⚡ Критична
                                  </span>
                                )}
                                {relation.is_bidirectional && !relation.is_critical && (
                                  <span style={{ borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#64748B', border: '1px solid rgba(148,163,184,.12)', background: 'rgba(15,23,42,.5)' }}>
                                    ↔
                                  </span>
                                )}
                              </div>
                              {/* Description */}
                              {(relation.short_description || relation.full_description) ? (
                                <div style={{ color: '#94A3B8', fontSize: 12, lineHeight: '18px' }}>
                                  {relation.short_description || relation.full_description}
                                </div>
                              ) : (
                                <div style={{ color: '#334155', fontSize: 12, fontStyle: 'italic' }}>Опис не заповнено</div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )
              }) : (
                <div style={{ color: '#475569', fontSize: 13, border: '1px dashed rgba(148,163,184,.15)', borderRadius: 16, padding: 18, textAlign: 'center', fontStyle: 'italic' }}>
                  Зв'язки для відділу ще не додані.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedPerson && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 260,
            background: 'rgba(2, 6, 23, 0.62)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}
          onClick={() => setSelectedPerson(null)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              borderRadius: 26,
              border: '1px solid rgba(148,163,184,.18)',
              background: 'linear-gradient(180deg, #0F172A 0%, #020617 100%)',
              boxShadow: '0 30px 120px rgba(0,0,0,.58)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 26, borderBottom: '1px solid rgba(30,41,59,.9)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#64748B', marginBottom: 10 }}>
                  {selectedPerson.source === 'leader' ? 'Картка лідера / TL' : 'Картка людини'}
                </div>
                <h3 style={{ margin: 0, fontSize: 28, lineHeight: '34px', fontWeight: 900, color: '#F8FAFC' }}>
                  {selectedPerson.user?.name || selectedPerson.user?.full_name || selectedPerson.user?.username || selectedPerson.user?.email || 'Без імені'}
                </h3>
                <div style={{ marginTop: 10, color: '#94A3B8', fontSize: 14 }}>
                  {selectedPerson.position || selectedPerson.lead_type || selectedPerson.user?.position || selectedPerson.user?.role || <span style={{ color: '#334155', fontStyle: 'italic' }}>Роль не вказана</span>}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                  {(selectedPerson.user?.department_name || selectedPerson.department_name) && (
                    <span style={{ borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 700, border: '1px solid rgba(168,85,247,.35)', background: 'rgba(168,85,247,.12)', color: '#D8B4FE' }}>
                      Відділ: {selectedPerson.user?.department_name || selectedPerson.department_name}
                    </span>
                  )}

                  {(selectedPerson.user?.manager_name || selectedPerson.manager_name) && (
                    <span style={{ borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 700, border: '1px solid rgba(251,146,60,.35)', background: 'rgba(251,146,60,.12)', color: '#FDBA74' }}>
                      Керівник: {selectedPerson.user?.manager_name || selectedPerson.manager_name}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedPerson(null)}
                style={{
                  height: 38,
                  borderRadius: 14,
                  border: '1px solid rgba(148,163,184,.18)',
                  background: 'rgba(15,23,42,.8)',
                  color: '#CBD5E1',
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Закрити
              </button>
            </div>

            <div style={{ padding: 26, display: 'grid', gap: 18 }}>
              <section style={{ borderRadius: 20, border: '1px solid rgba(30,41,59,.9)', background: 'rgba(15,23,42,.62)', padding: 18 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B', marginBottom: 14, fontWeight: 800 }}>
                  Контакти
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {[
                    { label: 'Email', value: selectedPerson.user?.email, href: (v) => `mailto:${v}` },
                    { label: 'Telegram', value: selectedPerson.user?.telegram, href: (v) => v.startsWith('@') ? `https://t.me/${v.slice(1)}` : v },
                    { label: 'Телефон', value: selectedPerson.user?.phone || selectedPerson.user?.reddy, href: (v) => `tel:${v}` },
                  ].map(({ label, value, href }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: '#475569', flexShrink: 0 }}>{label}</span>
                      {value ? (
                        <a href={href(value)} target="_blank" rel="noreferrer"
                          style={{ fontSize: 13, color: '#93C5FD', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                          {value}
                        </a>
                      ) : (
                        <span style={{ fontSize: 13, color: '#334155', fontStyle: 'italic' }}>Не вказано</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section style={{ borderRadius: 20, border: '1px solid rgba(30,41,59,.9)', background: 'rgba(15,23,42,.62)', padding: 18 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B', marginBottom: 14, fontWeight: 800 }}>
                  Зона відповідальності
                </div>

                {(() => {
                  const ra = selectedPerson.responsibility_area ||
                    selectedPerson.area_of_responsibility ||
                    selectedPerson.responsibility_zone ||
                    selectedPerson.responsibilities ||
                    selectedPerson.functional_responsibilities ||
                    selectedPerson.user?.responsibility_area ||
                    selectedPerson.user?.area_of_responsibility ||
                    selectedPerson.user?.responsibility_zone ||
                    selectedPerson.user?.responsibilities ||
                    selectedPerson.user?.functional_responsibilities ||
                    selectedPerson.notes
                  return ra ? (
                    <div
                      className="rich-text"
                      style={{ color: '#CBD5E1', fontSize: 14, lineHeight: '24px' }}
                      dangerouslySetInnerHTML={{ __html: ra }}
                    />
                  ) : (
                    <div style={{ color: '#475569', fontSize: 14, fontStyle: 'italic' }}>Функціональні обов'язки поки не заповнені.</div>
                  )
                })()}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App