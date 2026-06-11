import { useMemo } from 'react'

import {
  LINE_STYLE,
  METRO_VIEWBOX,
  REGIONAL_BRANCH_LAYOUTS,
  SERVICE_COLORS,
} from './metroConstants'

function getDepartmentTypeValue(department) {
  return String(
    department.department_type_name ||
    department.department_type ||
    department.type ||
    department.kind ||
    '',
  ).toLowerCase()
}

function isRegionalDepartment(department) {
  const type = getDepartmentTypeValue(department)

  return type.includes('regional') || type.includes('регион') || type.includes('регіон')
}

function isServiceDepartment(department) {
  const type = getDepartmentTypeValue(department)

  return type.includes('service') || type.includes('сервис') || type.includes('сервіс')
}

function normalizeRegionName(station) {
  const candidates = [
    station.geo_names?.[0],
    station.geo_name,
    station.geo,
    station.region,
    station.name,
    station.department_type_name,
    'Other',
  ]

  const normalized = String(candidates.find(Boolean) || 'Other').trim()

  if (!normalized) return 'Other'

  const lower = normalized.toLowerCase()

  if (lower.includes('europe') || lower.includes('europa') || lower.includes('европ')) return 'Europe'
  if (lower.includes('asia') || lower.includes('азия') || lower.includes('азія')) return 'Asia'
  if (lower.includes('africa') || lower.includes('африк')) return 'Africa'
  if (lower.includes('cis') || lower.includes('снг')) return 'CIS'
  if (lower.includes('latam') || lower.includes('latin')) return 'LATAM'
  if (lower.includes('america') || lower.includes('usa') || lower.includes('canada')) return 'Americas'

  return normalized
}

function createPathFromPoints(points) {
  if (!points.length) return ''

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`

    return `${path} L ${point.x} ${point.y}`
  }, '')
}

function getPointAtDistance(points, distance) {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]

  let remainingDistance = distance

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const dx = next.x - current.x
    const dy = next.y - current.y
    const length = Math.sqrt(dx * dx + dy * dy)

    if (remainingDistance <= length) {
      const ratio = length === 0 ? 0 : remainingDistance / length

      return {
        x: current.x + dx * ratio,
        y: current.y + dy * ratio,
      }
    }

    remainingDistance -= length
  }

  return points[points.length - 1]
}

function getPathLength(points) {
  let length = 0

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const dx = next.x - current.x
    const dy = next.y - current.y

    length += Math.sqrt(dx * dx + dy * dy)
  }

  return length
}

function getLabelOffset(labelSide) {
  if (labelSide === 'left') return { dx: -12, dy: 4, anchor: 'end' }
  if (labelSide === 'top') return { dx: 0, dy: -14, anchor: 'middle' }
  if (labelSide === 'bottom') return { dx: 0, dy: 24, anchor: 'middle' }

  return { dx: 12, dy: 4, anchor: 'start' }
}

function getLayoutCenter(points) {
  if (!points.length) return { x: METRO_VIEWBOX.centerX, y: METRO_VIEWBOX.centerY }

  const sum = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  }
}

function offsetLayoutPoints(points, layerIndex) {
  if (layerIndex === 0) return points

  const center = getLayoutCenter(points)
  const offset = layerIndex * 90
  const dx = center.x - METRO_VIEWBOX.centerX
  const dy = center.y - METRO_VIEWBOX.centerY
  const length = Math.sqrt(dx * dx + dy * dy) || 1
  const normalizedX = dx / length
  const normalizedY = dy / length

  return points.map((point, index) => {
    if (index === 0) return point

    return {
      x: point.x + normalizedX * offset,
      y: point.y + normalizedY * offset,
    }
  })
}

function pickRegionalLayout(region, index, usedLayoutKeys) {
  const preferredLayout = REGIONAL_BRANCH_LAYOUTS[region]
  const allLayouts = Object.values(REGIONAL_BRANCH_LAYOUTS)
  const orderedLayouts = preferredLayout
    ? [preferredLayout, ...allLayouts.filter((layout) => layout.key !== preferredLayout.key)]
    : allLayouts

  const freeLayout = orderedLayouts.find((layout) => !usedLayoutKeys.has(layout.key))

  if (freeLayout) {
    usedLayoutKeys.add(freeLayout.key)

    return {
      ...freeLayout,
      points: freeLayout.points,
      occupiedKey: freeLayout.key,
    }
  }

  const baseLayout = orderedLayouts[index % orderedLayouts.length]
  const layerIndex = Math.floor(index / Math.max(1, orderedLayouts.length))
  const occupiedKey = `${baseLayout.key}-layer-${layerIndex}`

  usedLayoutKeys.add(occupiedKey)

  return {
    ...baseLayout,
    points: offsetLayoutPoints(baseLayout.points, layerIndex + 1),
    occupiedKey,
  }
}

function getChildDepartmentIds(stations) {
  const childIds = new Set()

  stations.forEach((station) => {
    station.children?.forEach((child) => {
      childIds.add(String(child.id))
    })
  })

  return childIds
}

function getRootStations(stations) {
  const childIds = getChildDepartmentIds(stations)

  return stations.filter((station) => {
    const stationId = String(station.id)
    const parentId = station.parent_id || station.parentId || station.parent_department_id || station.parentDepartmentId
    const hasChildren = station.children?.length > 0

    return hasChildren || (!childIds.has(stationId) && !parentId)
  })
}

function getChildrenForStation(parentStation, allStations) {
  const childrenFromStation = parentStation.children || []
  const childIds = new Set(childrenFromStation.map((child) => String(child.id)))

  const linkedChildren = allStations.filter((station) => {
    const parentId = station.parent_id || station.parentId || station.parent_department_id || station.parentDepartmentId

    return parentId && String(parentId) === String(parentStation.id)
  })

  linkedChildren.forEach((child) => childIds.add(String(child.id)))

  return [
    ...childrenFromStation,
    ...linkedChildren.filter((child) => !childrenFromStation.some((item) => String(item.id) === String(child.id))),
  ].map((child) => {
    const fullStation = allStations.find((station) => String(station.id) === String(child.id))

    return {
      ...(fullStation || child),
      sourceLine: fullStation?.sourceLine || parentStation.sourceLine,
      parentStation,
    }
  })
}

function buildServiceHubs(serviceStations, allServiceStations, selectedDepartmentId) {
  const total = Math.max(1, serviceStations.length)
  const radius = total <= 5 ? 125 : total <= 8 ? 150 : 175
  const centerX = METRO_VIEWBOX.centerX
  const centerY = METRO_VIEWBOX.centerY

  return serviceStations.map((station, index) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2
    const point = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    }

    const labelSide = point.y < centerY - 30
      ? 'top'
      : point.y > centerY + 30
        ? 'bottom'
        : point.x < centerX
          ? 'left'
          : 'right'
    const label = getLabelOffset(labelSide)
    const color = SERVICE_COLORS[index % SERVICE_COLORS.length]

    return {
      ...station,
      x: point.x,
      y: point.y,
      labelX: point.x + label.dx,
      labelY: point.y + label.dy,
      textAnchor: label.anchor,
      labelSide,
      color,
      visualType: 'service',
      isHub: true,
      servicePath: createPathFromPoints([
        { x: centerX, y: centerY },
        point,
      ]),
      children: getChildrenForStation(station, allServiceStations),
    }
  })
}

function buildServiceDrilldownLines(serviceHubs, selectedDepartmentId) {
  if (!selectedDepartmentId) return []

  const selectedHub = serviceHubs.find((hub) => String(hub.id) === String(selectedDepartmentId))

  if (!selectedHub || !selectedHub.children?.length) return []

  const directionX = selectedHub.x - METRO_VIEWBOX.centerX
  const directionY = selectedHub.y - METRO_VIEWBOX.centerY
  const length = Math.sqrt(directionX * directionX + directionY * directionY) || 1
  const normalizedX = directionX / length
  const normalizedY = directionY / length
  const perpendicularX = -normalizedY
  const perpendicularY = normalizedX
  const start = { x: selectedHub.x, y: selectedHub.y }
  const end = {
    x: selectedHub.x + normalizedX * 260,
    y: selectedHub.y + normalizedY * 260,
  }
  const elbow = {
    x: selectedHub.x + normalizedX * 120 + perpendicularX * 70,
    y: selectedHub.y + normalizedY * 120 + perpendicularY * 70,
  }
  const points = [start, elbow, end]
  const pathLength = getPathLength(points)
  const stationSpacing = 85
  const startOffset = 80
  const labelSide = selectedHub.labelSide || 'right'
  const label = getLabelOffset(labelSide)
  const stationPoints = selectedHub.children.map((_, childIndex) =>
    getPointAtDistance(
      points,
      Math.min(pathLength, startOffset + childIndex * stationSpacing),
    ),
  )

  return [
    {
      id: `service-drilldown-${selectedHub.id}`,
      name: selectedHub.name,
      type: 'service-drilldown',
      color: selectedHub.color,
      path: createPathFromPoints([start, ...stationPoints]),
      points,
      parentStation: selectedHub,
      stations: selectedHub.children.map((child, childIndex) => {
        const point = stationPoints[childIndex]

        return {
          ...child,
          x: point.x,
          y: point.y,
          labelX: point.x + label.dx,
          labelY: point.y + label.dy,
          textAnchor: label.anchor,
          labelSide,
          color: selectedHub.color,
          visualType: 'service-child',
          isHub: false,
          parentStation: selectedHub,
        }
      }),
    },
  ]
}

function buildRegionalLines(regionalStations) {
  const rootRegionalStations = getRootStations(regionalStations)
  const fallbackStations = rootRegionalStations.length > 0 ? rootRegionalStations : regionalStations
  const usedLayoutKeys = new Set()

  return fallbackStations.map((parentStation, index) => {
    const region = normalizeRegionName(parentStation)
    const layout = pickRegionalLayout(region, index, usedLayoutKeys)
    const points = layout.points
    const pathLength = getPathLength(points)
    const children = getChildrenForStation(parentStation, regionalStations)
    const branchStations = [parentStation, ...children]
    const stationSpacing = 95
    const startOffset = 85
    const label = getLabelOffset(layout.labelSide)
    const stationPoints = branchStations.map((_, stationIndex) =>
      getPointAtDistance(
        points,
        Math.min(pathLength, startOffset + stationIndex * stationSpacing),
      ),
    )

    return {
      id: `region-parent-${parentStation.id}-${index}`,
      name: parentStation.name || region,
      region,
      type: 'regional',
      color: layout.color,
      path: createPathFromPoints([points[0], ...stationPoints]),
      points,
      parentStation,
      stations: branchStations.map((station, stationIndex) => {
        const point = stationPoints[stationIndex]
        const isBranchHub = String(station.id) === String(parentStation.id)

        return {
          ...station,
          x: point.x,
          y: point.y,
          labelX: point.x + label.dx,
          labelY: point.y + label.dy,
          textAnchor: label.anchor,
          labelSide: layout.labelSide,
          color: layout.color,
          visualType: 'regional',
          isHub: isBranchHub,
          metroRegion: region,
        }
      }),
    }
  })
}

function buildRelationConnections(relations, stationMap) {
  return relations
    .map((relation) => {
      const source = stationMap.get(String(relation.source))
      const target = stationMap.get(String(relation.target))

      if (!source || !target) return null

      return {
        id: relation.id,
        source,
        target,
        isCritical: Boolean(relation.is_critical),
        strength: relation.strength || 'medium',
        description: relation.short_description || relation.full_description || '',
      }
    })
    .filter(Boolean)
}

export function useMetroLayout(payload, selectedDepartmentId = null) {
  return useMemo(() => {
    if (!payload) {
      return {
        viewBox: METRO_VIEWBOX,
        center: {
          id: 'company-core',
          name: 'Company Core',
          x: METRO_VIEWBOX.centerX,
          y: METRO_VIEWBOX.centerY,
        },
        serviceStations: [],
        regionalLines: [],
        stations: [],
        relations: [],
      }
    }

    const stations = payload.lines.flatMap((line) =>
      line.stations.map((station) => ({
        ...station,
        sourceLine: line,
      })),
    )

    const serviceStations = stations.filter(isServiceDepartment)
    const regionalStations = stations.filter(isRegionalDepartment)
    const otherStations = stations.filter((station) => !isServiceDepartment(station) && !isRegionalDepartment(station))
    const rootServiceStations = getRootStations(serviceStations)
    const rootOtherStations = getRootStations(otherStations)
    const centralStations = buildServiceHubs([
      ...(rootServiceStations.length > 0 ? rootServiceStations : serviceStations),
      ...(rootOtherStations.length > 0 ? rootOtherStations : []),
    ], serviceStations, selectedDepartmentId)
    const serviceDrilldownLines = buildServiceDrilldownLines(centralStations, selectedDepartmentId)
    const regionalLines = buildRegionalLines(regionalStations)
    const allStations = [
      ...centralStations,
      ...serviceDrilldownLines.flatMap((line) => line.stations),
      ...regionalLines.flatMap((line) => line.stations),
    ]
    const stationMap = new Map(allStations.map((station) => [String(station.id), station]))
    const relations = buildRelationConnections(payload.relations || [], stationMap)

    return {
      viewBox: METRO_VIEWBOX,
      lineStyle: LINE_STYLE,
      center: {
        id: 'company-core',
        name: 'Company Core',
        x: METRO_VIEWBOX.centerX,
        y: METRO_VIEWBOX.centerY,
      },
      serviceStations: centralStations,
      regionalLines: [...serviceDrilldownLines, ...regionalLines],
      stations: allStations,
      relations,
    }
  }, [payload, selectedDepartmentId])
}