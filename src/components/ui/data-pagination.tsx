import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DEFAULT_DATA_PAGE_SIZE } from '@/lib/dataView'

interface DataPaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  onPageChange: (page: number) => void
  pageSize?: number
  itemLabel?: string
  className?: string
  'aria-label'?: string
}

export function DataPagination({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  pageSize = DEFAULT_DATA_PAGE_SIZE,
  itemLabel = '条',
  className,
  'aria-label': ariaLabel = '数据分页',
}: DataPaginationProps) {
  if (totalPages <= 1) return null

  const resolvedPage = Math.min(Math.max(1, currentPage), totalPages)
  const firstItem = totalItems === 0 ? 0 : (resolvedPage - 1) * pageSize + 1
  const lastItem = Math.min(resolvedPage * pageSize, totalItems)

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'flex flex-col items-center justify-between gap-3 sm:flex-row',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        显示第 <span className="tabular-nums">{firstItem}</span>–
        <span className="tabular-nums">{lastItem}</span> {itemLabel}，共{' '}
        <span className="tabular-nums">{totalItems}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(resolvedPage - 1)}
          disabled={resolvedPage === 1}
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          上一页
        </Button>
        <span
          className="min-w-16 text-center text-sm tabular-nums"
          aria-current="page"
        >
          {resolvedPage} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(resolvedPage + 1)}
          disabled={resolvedPage === totalPages}
          aria-label="下一页"
        >
          下一页
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
