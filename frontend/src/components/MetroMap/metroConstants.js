export const METRO_VIEWBOX = {
  width: 1400,
  height: 900,
  centerX: 700,
  centerY: 450,
}

export const METRO_THEME = {
  background: '#0D1B2A',
  grid: 'rgba(148, 163, 184, 0.08)',
  text: '#F8FAFC',
  mutedText: '#94A3B8',
  stationFill: '#0D1B2A',
  stationStroke: '#FFFFFF',
  panel: 'rgba(15, 23, 42, 0.92)',
  panelBorder: 'rgba(148, 163, 184, 0.22)',
}

export const REGION_COLORS = {
  Europe: '#4FC3F7',
  Asia: '#81C784',
  Americas: '#FFB74D',
  Africa: '#F06292',
  CIS: '#CE93D8',
  LATAM: '#F06292',
  NorthAmerica: '#FFB74D',
  SouthAmerica: '#EC4899',
  Other: '#94A3B8',
}

export const SERVICE_COLORS = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#06B6D4',
  '#A855F7',
  '#84CC16',
  '#3B82F6',
]

export const REGIONAL_BRANCH_LAYOUTS = {
  Europe: {
    key: 'Europe',
    color: REGION_COLORS.Europe,
    labelSide: 'top',
    points: [
      { x: 700, y: 450 },
      { x: 620, y: 380 },
      { x: 500, y: 380 },
      { x: 400, y: 300 },
      { x: 250, y: 300 },
      { x: 170, y: 230 },
    ],
  },
  Asia: {
    key: 'Asia',
    color: REGION_COLORS.Asia,
    labelSide: 'top',
    points: [
      { x: 700, y: 450 },
      { x: 800, y: 360 },
      { x: 960, y: 360 },
      { x: 1080, y: 270 },
      { x: 1230, y: 270 },
      { x: 1290, y: 330 },
      { x: 1290, y: 520 },
      { x: 1210, y: 590 },
      { x: 1060, y: 590 },
    ],
  },
  Africa: {
    key: 'Africa',
    color: REGION_COLORS.Africa,
    labelSide: 'right',
    points: [
      { x: 700, y: 450 },
      { x: 820, y: 520 },
      { x: 980, y: 520 },
      { x: 1090, y: 610 },
      { x: 1220, y: 610 },
      { x: 1280, y: 680 },
      { x: 1280, y: 780 },
    ],
  },
  CIS: {
    key: 'CIS',
    color: REGION_COLORS.CIS,
    labelSide: 'bottom',
    points: [
      { x: 700, y: 450 },
      { x: 650, y: 560 },
      { x: 560, y: 650 },
      { x: 430, y: 650 },
      { x: 330, y: 740 },
      { x: 180, y: 740 },
    ],
  },
  Americas: {
    key: 'Americas',
    color: REGION_COLORS.Americas,
    labelSide: 'top',
    points: [
      { x: 700, y: 450 },
      { x: 570, y: 450 },
      { x: 470, y: 540 },
      { x: 320, y: 540 },
      { x: 220, y: 620 },
      { x: 120, y: 620 },
    ],
  },
  LATAM: {
    key: 'LATAM',
    color: REGION_COLORS.LATAM,
    labelSide: 'left',
    points: [
      { x: 700, y: 450 },
      { x: 590, y: 520 },
      { x: 470, y: 520 },
      { x: 370, y: 610 },
      { x: 250, y: 610 },
      { x: 170, y: 700 },
    ],
  },
  Other: {
    key: 'Other',
    color: REGION_COLORS.Other,
    labelSide: 'bottom',
    points: [
      { x: 700, y: 450 },
      { x: 700, y: 560 },
      { x: 700, y: 720 },
    ],
  },
}

export const SERVICE_HUB_LAYOUTS = [
  {
    key: 'top',
    points: [
      { x: 700, y: 450 },
      { x: 700, y: 340 },
    ],
    labelSide: 'top',
  },
  {
    key: 'top-right',
    points: [
      { x: 700, y: 450 },
      { x: 800, y: 365 },
    ],
    labelSide: 'right',
  },
  {
    key: 'right',
    points: [
      { x: 700, y: 450 },
      { x: 825, y: 450 },
    ],
    labelSide: 'right',
  },
  {
    key: 'bottom-right',
    points: [
      { x: 700, y: 450 },
      { x: 800, y: 535 },
    ],
    labelSide: 'bottom',
  },
  {
    key: 'bottom',
    points: [
      { x: 700, y: 450 },
      { x: 700, y: 565 },
    ],
    labelSide: 'bottom',
  },
  {
    key: 'left',
    points: [
      { x: 700, y: 450 },
      { x: 575, y: 450 },
    ],
    labelSide: 'left',
  },
]

export const STATION_SIZES = {
  defaultRadius: 6,
  serviceRadius: 7,
  hubRadius: 11,
  headRadius: 20,
}

export const LINE_STYLE = {
  width: 4,
  serviceWidth: 5,
  connectionWidth: 2,
  dash: '5 7',
}