import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'

import { cn } from '@/lib/utils'
import { sanitizeAIExternalUrl } from './safeAIUrl'

export type SafeAIContentVariant = 'compact' | 'report'

export interface SafeAIContentProps {
  content: string
  variant?: SafeAIContentVariant
  className?: string
}

function SafeLink({
  href,
  children,
  ...props
}: ComponentPropsWithoutRef<'a'> & { children?: ReactNode }) {
  const safeHref = sanitizeAIExternalUrl(href)
  if (!safeHref) {
    return <span className="break-words text-current">{children}</span>
  }

  return (
    <a
      {...props}
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words font-medium text-primary underline decoration-primary/35 underline-offset-2 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  )
}

function HiddenImage({ alt }: { alt?: string }) {
  if (!alt) return null
  return (
    <span className="text-xs italic text-muted-foreground" role="note">
      [图片已隐藏：{alt}]
    </span>
  )
}

const sharedComponents: Components = {
  a: ({ node: _node, ...props }) => <SafeLink {...props} />,
  img: ({ node: _node, alt: rawAlt }) => (
    <HiddenImage alt={typeof rawAlt === 'string' ? rawAlt : undefined} />
  ),
  h1: ({ node: _node, ...props }) => (
    <h1 className="mb-3 mt-5 text-xl font-bold first:mt-0" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 className="mb-2.5 mt-5 text-lg font-bold first:mt-0" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0" {...props} />
  ),
  p: ({ node: _node, ...props }) => (
    <p className="my-2 whitespace-pre-wrap leading-7 first:mt-0 last:mb-0" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="my-2 ml-5 list-disc space-y-1 leading-7" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="my-2 ml-5 list-decimal space-y-1 leading-7" {...props} />
  ),
  li: ({ node: _node, ...props }) => <li className="pl-0.5" {...props} />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="my-3 rounded-r-lg border-l-4 border-primary/40 bg-muted/55 px-3 py-2 text-muted-foreground"
      {...props}
    />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="my-3 max-w-full overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[0.85em] leading-relaxed"
      {...props}
    />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn(
        'font-mono text-[0.88em]',
        !className?.startsWith('language-') && 'rounded bg-muted/80 px-1.5 py-0.5 text-primary',
        className,
      )}
      {...props}
    />
  ),
  hr: ({ node: _node, ...props }) => <hr className="my-4 border-border" {...props} />,
  strong: ({ node: _node, ...props }) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
}

function safeUrlTransform(url: string, key: string): string | undefined {
  if (key === 'src') return undefined
  return sanitizeAIExternalUrl(url)
}

/**
 * The only Markdown renderer AI-authored content should use.
 *
 * Security boundaries:
 * - raw HTML is discarded;
 * - images never render or load, including remote/data URLs;
 * - only absolute HTTP(S) links are clickable and always open isolated.
 */
export function SafeAIContent({
  content,
  variant = 'compact',
  className,
}: SafeAIContentProps) {
  return (
    <div
      className={cn(
        'min-w-0 break-words text-foreground',
        variant === 'report' ? 'text-sm leading-[1.8]' : 'text-sm leading-7',
        className,
      )}
      data-ai-content="safe"
    >
      <ReactMarkdown components={sharedComponents} skipHtml urlTransform={safeUrlTransform}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
