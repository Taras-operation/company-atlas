import { useMemo, useState } from 'react'

import MapCanvas from './MapCanvas'
import { useMetroLayout } from './useMetroLayout'

export default function MetroMap({
  payload,
  selectedDepartmentId,
  setSelectedDepartmentId,
  setHoveredDepartmentId,
}) {
  const layout = useMetroLayout(payload, selectedDepartmentId)
  const [hoveredStationId, setHoveredStationId] = useState(null)
  const [hoveredLineId, setHoveredLineId] = useState(null)

  const activeStationId = hoveredStationId || selectedDepartmentId

  const visibleRelations = useMemo(() => {
    if (!payload?.relations || !Array.isArray(payload.relations)) {
      return []
    }

    const normalizedSelectedId = activeStationId ? String(activeStationId) : null

    // Public map / no selected department:
    // show ONLY HIGH priority relations.
    if (!normalizedSelectedId) {
      return payload.relations.filter((relation) => {
        return String(relation.strength || '').toLowerCase() === 'high'
      })
    }

    // Selected department:
    // show ALL relations connected to this department.
    return payload.relations.filter((relation) => {
      const sourceId = String(relation.source_department_id || relation.source)
      const targetId = String(relation.target_department_id || relation.target)

      return (
        sourceId === normalizedSelectedId ||
        targetId === normalizedSelectedId
      )
    })
  }, [payload, activeStationId])

  const connectedStationIds = useMemo(() => {
    const connected = new Set()

    if (!payload || !activeStationId) return connected

    payload.relations?.forEach((relation) => {
      const sourceId = String(relation.source)
      const targetId = String(relation.target)

      if (sourceId === String(activeStationId)) connected.add(targetId)
      if (targetId === String(activeStationId)) connected.add(sourceId)
    })

    return connected
  }, [payload, activeStationId])

  const dimmedStationIds = useMemo(() => {
    const dimmed = new Set()

    if (!activeStationId) return dimmed

    layout.stations.forEach((station) => {
      const stationId = String(station.id)

      if (stationId !== String(activeStationId) && !connectedStationIds.has(stationId)) {
        dimmed.add(stationId)
      }
    })

    return dimmed
  }, [layout.stations, activeStationId, connectedStationIds])

  const handleStationHover = (stationId) => {
    setHoveredStationId(stationId)
    setHoveredDepartmentId?.(stationId)
  }

  const handleStationLeave = () => {
    setHoveredStationId(null)
    setHoveredDepartmentId?.(null)
  }

  const handleStationClick = (stationId) => {
    setSelectedDepartmentId(String(stationId))
    setHoveredStationId(null)
    setHoveredDepartmentId?.(null)
  }

  return (
    <MapCanvas
      centralStations={layout.serviceStations}
      regionalLines={layout.regionalLines}
      relations={visibleRelations}
      activeStationId={activeStationId}
      hoveredLineId={hoveredLineId}
      dimmedStationIds={dimmedStationIds}
      onStationHover={handleStationHover}
      onStationLeave={handleStationLeave}
      onStationClick={handleStationClick}
      onLineHover={setHoveredLineId}
      onLineLeave={() => setHoveredLineId(null)}
    />
  )
}
