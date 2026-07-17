import { Loader2 } from 'lucide-react'

interface AILoadingStateProps {
  text?: string
}

export function AILoadingState({ text = 'AI 正在思考...' }: AILoadingStateProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
      <span>{text}</span>
    </div>
  )
}
