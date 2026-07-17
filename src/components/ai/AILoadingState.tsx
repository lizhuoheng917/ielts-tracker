import { cn } from '@/lib/utils'

interface AILoadingStateProps {
  text?: string
  className?: string
}

export function AILoadingState({ text = 'AI 正在思考', className }: AILoadingStateProps) {
  return (
    <div className={cn('flex items-center gap-2.5 text-sm text-muted-foreground py-1', className)}>
      <div className="flex items-center gap-[3px]">
        <span className="inline-block h-[5px] w-[5px] rounded-full bg-indigo-500 animate-[loading-bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }} />
        <span className="inline-block h-[5px] w-[5px] rounded-full bg-indigo-500 animate-[loading-bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: '150ms' }} />
        <span className="inline-block h-[5px] w-[5px] rounded-full bg-indigo-500 animate-[loading-bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs">{text}...</span>
    </div>
  )
}
