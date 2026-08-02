export const SUBJECT_KEYS = [
  "reading",
  "listening",
  "writing",
  "speaking",
  "general",
] as const

export type SubjectKey = (typeof SUBJECT_KEYS)[number]

export type SubjectVisual = {
  label: string
  chartColor: string
  textClass: string
  surfaceClass: string
  borderClass: string
  badgeClass: string
}

export const SUBJECT_VISUALS: Record<SubjectKey, SubjectVisual> = {
  reading: {
    label: "阅读",
    chartColor: "var(--subject-reading)",
    textClass: "text-subject-reading",
    surfaceClass: "bg-subject-reading-soft",
    borderClass: "border-subject-reading-border",
    badgeClass:
      "border-subject-reading-border bg-subject-reading-soft text-subject-reading",
  },
  listening: {
    label: "听力",
    chartColor: "var(--subject-listening)",
    textClass: "text-subject-listening",
    surfaceClass: "bg-subject-listening-soft",
    borderClass: "border-subject-listening-border",
    badgeClass:
      "border-subject-listening-border bg-subject-listening-soft text-subject-listening",
  },
  writing: {
    label: "写作",
    chartColor: "var(--subject-writing)",
    textClass: "text-subject-writing",
    surfaceClass: "bg-subject-writing-soft",
    borderClass: "border-subject-writing-border",
    badgeClass:
      "border-subject-writing-border bg-subject-writing-soft text-subject-writing",
  },
  speaking: {
    label: "口语",
    chartColor: "var(--subject-speaking)",
    textClass: "text-subject-speaking",
    surfaceClass: "bg-subject-speaking-soft",
    borderClass: "border-subject-speaking-border",
    badgeClass:
      "border-subject-speaking-border bg-subject-speaking-soft text-subject-speaking",
  },
  general: {
    label: "综合",
    chartColor: "var(--subject-general)",
    textClass: "text-subject-general",
    surfaceClass: "bg-subject-general-soft",
    borderClass: "border-subject-general-border",
    badgeClass:
      "border-subject-general-border bg-subject-general-soft text-subject-general",
  },
}

export function isSubjectKey(value: string): value is SubjectKey {
  return SUBJECT_KEYS.some((subject) => subject === value)
}

export function getSubjectVisual(value: string): SubjectVisual {
  return SUBJECT_VISUALS[isSubjectKey(value) ? value : "general"]
}
