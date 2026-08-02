import type { ComponentType, ReactNode } from 'react'

export type EmptyStateScene =
  | 'tasks'
  | 'words'
  | 'practice'
  | 'timer'
  | 'diary'
  | 'achievements'
  | 'plans'
  | 'generic'
  | 'wordTrend'
  | 'durationChart'
  | 'radarChart'
  | 'pieChart'

interface IllustrationProps {
  className?: string
}

function SceneSvg({ className, children }: IllustrationProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

function AmbientMarks() {
  return (
    <g aria-hidden="true">
      <circle cx="16" cy="24" r="3.5" className="fill-illustration-primary/15" />
      <circle cx="104" cy="22" r="2.5" className="fill-illustration-secondary/30" />
      <path d="M101 72l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z" className="fill-illustration-accent/35" />
    </g>
  )
}

function TasksIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <rect x="27" y="15" width="58" height="70" rx="8" className="fill-illustration-surface stroke-illustration-line/35" strokeWidth="2" />
      <rect x="36" y="28" width="9" height="9" rx="2.5" className="fill-illustration-primary/15 stroke-illustration-line/45" strokeWidth="1.5" />
      <path d="m38.5 32.5 2 2 3.5-4" className="stroke-illustration-primary" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M51 32.5h23M51 48.5h18M51 64.5h21" className="stroke-illustration-line/35" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="36" y="44" width="9" height="9" rx="2.5" className="fill-illustration-surface stroke-illustration-muted" strokeWidth="1.5" />
      <rect x="36" y="60" width="9" height="9" rx="2.5" className="fill-illustration-surface stroke-illustration-muted" strokeWidth="1.5" />
      <path d="M35 15v-3M48 15v-3M61 15v-3M74 15v-3" className="stroke-illustration-primary" strokeWidth="3" strokeLinecap="round" />
      <AmbientMarks />
    </SceneSvg>
  )
}

function WordsIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <path d="M21 27c0-4 3-7 7-7h30v61H28c-4 0-7-3-7-7V27Z" className="fill-illustration-surface stroke-illustration-line/35" strokeWidth="2" />
      <path d="M58 20h34c4 0 7 3 7 7v47c0 4-3 7-7 7H58V20Z" className="fill-illustration-primary/10 stroke-illustration-line/35" strokeWidth="2" />
      <path d="M58 20v61" className="stroke-illustration-line/45" strokeWidth="2" />
      <path d="M31 36h17M31 47h14M31 58h19M69 36h19M69 47h16M69 58h18" className="stroke-illustration-line/35" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M76 20v16l7-4 7 4V20" className="fill-illustration-primary stroke-illustration-primary" strokeLinejoin="round" />
      <AmbientMarks />
    </SceneSvg>
  )
}

function PracticeIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <rect x="27" y="14" width="66" height="72" rx="9" className="fill-illustration-surface stroke-illustration-line/35" strokeWidth="2" />
      <rect x="39" y="23" width="42" height="8" rx="4" className="fill-illustration-primary/15" />
      <g className="stroke-illustration-primary" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="38" y="41" width="17" height="14" rx="4" className="fill-illustration-primary/10" />
        <path d="M43 46h7M43 50h5" />
        <rect x="65" y="41" width="17" height="14" rx="4" className="fill-illustration-primary/10" />
        <path d="M70 50v-4M74 52v-8M78 49v-2" />
        <rect x="38" y="63" width="17" height="14" rx="4" className="fill-illustration-primary/10" />
        <path d="m43 72 7-7M47 65l3 3" />
        <rect x="65" y="63" width="17" height="14" rx="4" className="fill-illustration-primary/10" />
        <path d="M70 68h7M70 72h5" />
      </g>
      <AmbientMarks />
    </SceneSvg>
  )
}

function TimerIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <circle cx="60" cy="55" r="31" className="fill-illustration-surface stroke-illustration-line/35" strokeWidth="3" />
      <path d="M51 17h18M60 17v7M82 29l5-5" className="stroke-illustration-primary" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 34v22l14 8" className="stroke-illustration-primary" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60 27a28 28 0 0 1 27 22" className="stroke-illustration-line/25" strokeWidth="5" strokeLinecap="round" />
      <circle cx="60" cy="55" r="4" className="fill-illustration-primary" />
      <path d="M34 79h52" className="stroke-illustration-line/20" strokeWidth="3" strokeLinecap="round" />
      <AmbientMarks />
    </SceneSvg>
  )
}

function DiaryIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <rect x="22" y="16" width="61" height="70" rx="8" className="fill-illustration-surface stroke-illustration-line/35" strokeWidth="2" />
      <path d="M33 32h37M33 43h31M33 54h35M33 65h20" className="stroke-illustration-line/25" strokeWidth="2.5" strokeLinecap="round" />
      <path d="m70 72 20-35 8 5-20 35-11 6 3-11Z" className="fill-illustration-primary/15 stroke-illustration-primary" strokeWidth="2" strokeLinejoin="round" />
      <path d="m70 72 8 5M90 37l8 5" className="stroke-illustration-primary" strokeWidth="2" />
      <AmbientMarks />
    </SceneSvg>
  )
}

function AchievementsIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <path d="M39 24h42v22c0 13-9 22-21 22S39 59 39 46V24Z" className="fill-illustration-primary/15 stroke-illustration-primary" strokeWidth="2.5" />
      <path d="M39 31H26v8c0 10 6 17 16 17M81 31h13v8c0 10-6 17-16 17" className="stroke-illustration-line/55" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 68v9M47 82h26" className="stroke-illustration-primary" strokeWidth="4" strokeLinecap="round" />
      <path d="m60 33 3.3 6.7 7.4 1.1-5.4 5.2 1.3 7.4-6.6-3.5-6.6 3.5 1.3-7.4-5.4-5.2 7.4-1.1L60 33Z" className="fill-illustration-primary" />
      <AmbientMarks />
    </SceneSvg>
  )
}

function PlansIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <rect x="21" y="23" width="72" height="61" rx="9" className="fill-illustration-surface stroke-illustration-line/35" strokeWidth="2" />
      <path d="M21 40h72" className="stroke-illustration-line/35" strokeWidth="2" />
      <path d="M38 17v12M76 17v12" className="stroke-illustration-primary" strokeWidth="4" strokeLinecap="round" />
      <g className="fill-illustration-primary/15">
        <rect x="33" y="50" width="10" height="10" rx="3" />
        <rect x="50" y="50" width="10" height="10" rx="3" />
        <rect x="67" y="50" width="10" height="10" rx="3" />
        <rect x="33" y="67" width="10" height="10" rx="3" />
      </g>
      <circle cx="72" cy="70" r="15" className="fill-illustration-primary stroke-illustration-surface" strokeWidth="3" />
      <path d="m65.5 70 4 4 8-9" className="stroke-primary-foreground" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <AmbientMarks />
    </SceneSvg>
  )
}

function GenericIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <path d="M24 33h29l8 9h35v34c0 5-4 9-9 9H33c-5 0-9-4-9-9V33Z" className="fill-illustration-primary/10 stroke-illustration-line/35" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 44h72" className="stroke-illustration-line/25" strokeWidth="2" />
      <circle cx="60" cy="63" r="12" className="fill-illustration-surface stroke-illustration-line/45" strokeWidth="2" />
      <path d="M60 56v8M60 70h.01" className="stroke-illustration-primary" strokeWidth="3" strokeLinecap="round" />
      <AmbientMarks />
    </SceneSvg>
  )
}

function ChartFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <path d="M25 18v62h78" className="stroke-illustration-line/30" strokeWidth="2" strokeLinecap="round" />
      <path d="M25 39h78M25 59h78" className="stroke-illustration-muted" strokeWidth="1.5" strokeDasharray="4 4" />
      {children}
    </>
  )
}

function WordTrendIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <ChartFrame>
        <path d="m33 70 16-14 14 5 16-22 17-11" className="stroke-illustration-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {[['33', '70'], ['49', '56'], ['63', '61'], ['79', '39'], ['96', '28']].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" className="fill-illustration-surface stroke-illustration-primary" strokeWidth="2" />
        ))}
      </ChartFrame>
      <AmbientMarks />
    </SceneSvg>
  )
}

function DurationChartIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <ChartFrame>
        <rect x="35" y="57" width="11" height="23" rx="3" className="fill-illustration-primary/20" />
        <rect x="53" y="43" width="11" height="37" rx="3" className="fill-illustration-primary/35" />
        <rect x="71" y="51" width="11" height="29" rx="3" className="fill-illustration-primary/55" />
        <rect x="89" y="29" width="11" height="51" rx="3" className="fill-illustration-primary" />
      </ChartFrame>
      <AmbientMarks />
    </SceneSvg>
  )
}

function RadarChartIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <path d="m60 14 42 36-42 36-42-36 42-36Z" className="fill-illustration-primary/5 stroke-illustration-line/30" strokeWidth="1.5" />
      <path d="m60 31 23 19-23 19-23-19 23-19Z" className="stroke-illustration-muted" strokeWidth="1.5" />
      <path d="M60 14v72M18 50h84" className="stroke-illustration-muted" strokeWidth="1.5" />
      <path d="m60 25 29 25-29 24-25-24 25-25Z" className="fill-illustration-primary/20 stroke-illustration-primary" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="60" cy="25" r="3.5" className="fill-illustration-primary" />
      <circle cx="89" cy="50" r="3.5" className="fill-illustration-primary" />
      <circle cx="60" cy="74" r="3.5" className="fill-illustration-primary" />
      <circle cx="35" cy="50" r="3.5" className="fill-illustration-primary" />
    </SceneSvg>
  )
}

function PieChartIllustration({ className }: IllustrationProps) {
  return (
    <SceneSvg className={className}>
      <circle cx="53" cy="50" r="28" className="fill-none stroke-illustration-line/15" strokeWidth="16" />
      <circle cx="53" cy="50" r="28" className="fill-none stroke-illustration-primary" strokeWidth="16" strokeDasharray="65 111" transform="rotate(-90 53 50)" />
      <circle cx="53" cy="50" r="28" className="fill-none stroke-illustration-line/55" strokeWidth="16" strokeDasharray="45 131" strokeDashoffset="-65" transform="rotate(-90 53 50)" />
      <circle cx="53" cy="50" r="12" className="fill-illustration-surface" />
      <path d="M91 35h13M91 50h13M91 65h13" className="stroke-illustration-line/45" strokeWidth="4" strokeLinecap="round" />
      <AmbientMarks />
    </SceneSvg>
  )
}

const sceneIllustrations: Record<EmptyStateScene, ComponentType<IllustrationProps>> = {
  tasks: TasksIllustration,
  words: WordsIllustration,
  practice: PracticeIllustration,
  timer: TimerIllustration,
  diary: DiaryIllustration,
  achievements: AchievementsIllustration,
  plans: PlansIllustration,
  generic: GenericIllustration,
  wordTrend: WordTrendIllustration,
  durationChart: DurationChartIllustration,
  radarChart: RadarChartIllustration,
  pieChart: PieChartIllustration,
}

export function EmptyStateIllustration({ scene, className }: IllustrationProps & { scene: EmptyStateScene }) {
  const Illustration = sceneIllustrations[scene]
  return <Illustration className={className} />
}
