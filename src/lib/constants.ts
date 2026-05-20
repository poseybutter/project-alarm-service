export const TEAM_ID = 'ud2'

export const MEMBERS = ['TEAM_MEMBER_1', 'TEAM_MEMBER_2', 'TEAM_MEMBER_3', 'TEAM_MEMBER_4']
export const LEADER  = 'TEAM_MEMBER_1'

export const MEMBER_COLORS: Record<string, { bg: string; text: string; bar: string; border: string }> = {
  'TEAM_MEMBER_1': { bg: 'bg-purple-100', text: 'text-purple-700', bar: '#7C3AED', border: 'border-purple-400' },
  'TEAM_MEMBER_2': { bg: 'bg-green-100',  text: 'text-green-700',  bar: '#059669', border: 'border-green-400'  },
  'TEAM_MEMBER_3': { bg: 'bg-amber-100',  text: 'text-amber-700',  bar: '#D97706', border: 'border-amber-400'  },
  'TEAM_MEMBER_4': { bg: 'bg-orange-100', text: 'text-orange-700', bar: '#EA580C', border: 'border-orange-400' },
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
  '이슈 및 대기': 'bg-red-100 text-red-700',
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