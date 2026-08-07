import { useId, type ComponentProps } from 'react'

import { cn } from '@/lib/utils'

type LexiAccountMarkProps = Omit<ComponentProps<'span'>, 'children'>

/**
 * Shared Lexi Account mark.
 *
 * This is intentionally different from Tracker's book-and-progress mark: it
 * identifies the parent Lexi account layer without making Tracker's learning
 * surfaces look like a different product. The vector mirrors the approved
 * Lexi Control master mark, but lives in this repository so production builds
 * never depend on a file from another project checkout.
 */
export function LexiAccountMark({ className, ...props }: LexiAccountMarkProps) {
  const markerId = useId().replace(/:/g, '')
  const leftGradientId = `lexi-account-left-${markerId}`
  const rightGradientId = `lexi-account-right-${markerId}`

  return (
    <span
      {...props}
      aria-hidden="true"
      data-lexi-account-mark="true"
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-[28%] bg-[#17281f] shadow-[0_8px_20px_-10px_rgb(23_40_31/0.66)] ring-1 ring-inset ring-white/10',
        className,
      )}
    >
      <svg viewBox="0 0 64 64" fill="none" focusable="false" className="size-full">
        <defs>
          <linearGradient id={leftGradientId} x1="13" y1="17" x2="36" y2="47" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D9F29B" />
            <stop offset="1" stopColor="#8EC65D" />
          </linearGradient>
          <linearGradient id={rightGradientId} x1="51" y1="17" x2="28" y2="47" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D8D2FF" />
            <stop offset="1" stopColor="#9789ED" />
          </linearGradient>
        </defs>
        <path
          d="M14 22.5c0-4.7 3.8-8.5 8.5-8.5h7.1c1.8 0 3.5.7 4.8 2l5.2 5.2-7.1 7.1-4.3-4.3h-5.7a1.7 1.7 0 0 0 0 3.4h6.7v9.2h-6.7A10.5 10.5 0 0 1 12 26.1v-3.6Z"
          fill={`url(#${leftGradientId})`}
        />
        <path
          d="M50 41.5c0 4.7-3.8 8.5-8.5 8.5h-7.1c-1.8 0-3.5-.7-4.8-2l-5.2-5.2 7.1-7.1 4.3 4.3h5.7a1.7 1.7 0 0 0 0-3.4h-6.7v-9.2h6.7A10.5 10.5 0 0 1 52 37.9v3.6Z"
          fill={`url(#${rightGradientId})`}
        />
        <path d="m32 26.2 5.8 5.8-5.8 5.8-5.8-5.8z" fill="#FCFDF9" />
        <circle cx="32" cy="32" r="2.1" fill="#22382A" />
      </svg>
    </span>
  )
}
