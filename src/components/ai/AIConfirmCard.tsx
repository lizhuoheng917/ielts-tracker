import { Check, X, Lightbulb, Calendar, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface AIAction {
  id: string
  type: 'create_plan' | 'add_exam' | 'suggestion'
  title: string
  description: string
  details?: Record<string, string>
}

interface AIConfirmCardProps {
  action: AIAction
  onConfirm: () => void
  onReject: () => void
  confirmed?: boolean
}

const typeConfig = {
  create_plan: { icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  add_exam: { icon: FileText, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
  suggestion: { icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
}

export function AIConfirmCard({ action, onConfirm, onReject, confirmed }: AIConfirmCardProps) {
  const config = typeConfig[action.type]
  const Icon = config.icon

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2 transition-all',
      confirmed
        ? 'border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-900/10'
        : 'border-border bg-card'
    )}>
      <div className="flex items-start gap-2">
        <div className={cn('rounded-md p-1.5', config.bg)}>
          <Icon className={cn('h-4 w-4', config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{action.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
          {action.details && (
            <div className="mt-1.5 space-y-0.5">
              {Object.entries(action.details).map(([k, v]) => (
                <div key={k} className="flex gap-1.5 text-xs">
                  <span className="text-muted-foreground shrink-0">{k}:</span>
                  <span className="truncate">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!confirmed && (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onReject} className="h-7 text-xs">
            <X className="h-3 w-3 mr-1" />
            忽略
          </Button>
          <Button size="sm" onClick={onConfirm} className="h-7 text-xs">
            <Check className="h-3 w-3 mr-1" />
            确认执行
          </Button>
        </div>
      )}
      {confirmed && (
        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
          <Check className="h-3 w-3" />
          已执行
        </p>
      )}
    </div>
  )
}
