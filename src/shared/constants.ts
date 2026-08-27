export const TEAM_ID = 'ud2'

export type MemberColors = {
  bg: string
  text: string
  bar: string
  border: string
}

const MEMBER_COLOR_PALETTE: readonly MemberColors[] = [
  { bg: 'bg-purple-100', text: 'text-purple-700', bar: '#7C3AED', border: 'border-purple-400' },
  { bg: 'bg-green-100', text: 'text-green-700', bar: '#059669', border: 'border-green-400' },
  { bg: 'bg-amber-100', text: 'text-amber-700', bar: '#D97706', border: 'border-amber-400' },
  { bg: 'bg-orange-100', text: 'text-orange-700', bar: '#EA580C', border: 'border-orange-400' },
  { bg: 'bg-sky-100', text: 'text-sky-700', bar: '#0284C7', border: 'border-sky-400' },
  { bg: 'bg-rose-100', text: 'text-rose-700', bar: '#E11D48', border: 'border-rose-400' },
  { bg: 'bg-teal-100', text: 'text-teal-700', bar: '#0F766E', border: 'border-teal-400' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', bar: '#4F46E5', border: 'border-indigo-400' },
]

function stableStringHash(value: string) {
  let hash = 0
  for (const char of value.normalize('NFKC')) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  }
  return hash
}

export function getMemberColors(memberKey: string): MemberColors {
  return MEMBER_COLOR_PALETTE[
    stableStringHash(memberKey) % MEMBER_COLOR_PALETTE.length
  ]
}

export const TYPE_COLORS: Record<string, string> = {
  '프로젝트': 'bg-violet-100 text-violet-700',
  '유지보수': 'bg-red-100 text-red-700',
  '고도화':   'bg-green-100 text-green-700',
  '접근성':   'bg-sky-100 text-sky-700',
  '업무지원': 'bg-blue-100 text-blue-700',
}

export const STATUS_COLORS: Record<string, string> = {
  '완료':         'bg-green-100 text-green-700',
  '진행중':       'bg-blue-100 text-blue-700',
  '대기':         'bg-gray-100 text-gray-600',
  '시작 전':      'bg-gray-100 text-gray-600',
  '지연/보류':    'bg-red-100 text-red-700',
  '이슈 및 대기': 'bg-red-100 text-red-700', // 레거시 값 하위호환 (색상)
}

// 레거시 상태값 하위호환: 예전 '이슈 및 대기'는 '지연/보류'와 동일하게 취급.
// DB에 저장된 옛 값을 그대로 두고도 색상·그룹핑·표시가 정상 동작하도록 정규화한다.
const LEGACY_STATUS_ALIAS: Record<string, string> = {
  '이슈 및 대기': '지연/보류',
}

export function normalizeStatus(status: string): string {
  return LEGACY_STATUS_ALIAS[status] ?? status
}

export const WORKLOAD_PRESETS = [
  { label: '30분', value: 30  },
  { label: '1h',   value: 60  },
  { label: '2h',   value: 120 },
  { label: '4h',   value: 240 },
  { label: '1일',  value: 480 },
  { label: '2일',  value: 960 },
]

export const BAR_COLORS = [
  '#4CAF50','#2196F3','#9C27B0','#FF5722',
  '#FF9800','#F44336','#FFD700','#FF69B4'
]
