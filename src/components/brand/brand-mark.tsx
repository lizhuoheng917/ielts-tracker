import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

type BrandMarkProps = Omit<ComponentProps<'span'>, 'children'>

/**
 * Lexi Tracker brand mark: an open book, an I-shaped spine and an upward
 * check trail. The geometry stays legible from a 16px favicon to navigation UI.
 */
export function BrandMark({ className, ...props }: BrandMarkProps) {
  return (
    <span
      {...props}
      aria-hidden="true"
      data-brand-mark="true"
      className={cn(
        'relative isolate grid shrink-0 place-items-center overflow-hidden rounded-[30%] bg-[linear-gradient(145deg,#3730a3_0%,#4f46e5_52%,#7c3aed_100%)] text-white shadow-[0_8px_20px_-10px_oklch(0.45_0.22_275/0.7)] ring-1 ring-inset ring-white/15',
        className,
      )}
    >
      <span className="absolute -right-[35%] -top-[45%] size-full rounded-full bg-white/12" />
      <svg
        viewBox="0 0 32 32"
        fill="none"
        focusable="false"
        className="relative size-[76%]"
      >
        <path
          d="M5.5 8.5c3.8 0 7.2 1.1 10.5 3.5v13.7c-3.3-2.3-6.7-3.4-10.5-3.4V8.5Z"
          stroke="currentColor"
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M26.5 8.5c-3.8 0-7.2 1.1-10.5 3.5v13.7c3.3-2.3 6.7-3.4 10.5-3.4V8.5Z"
          stroke="currentColor"
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m19.3 17.7 2.1 2.1 4.2-5.4"
          stroke="#a5f3fc"
          strokeWidth="2.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
