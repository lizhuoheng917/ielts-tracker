import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { MoodType, DiaryEntry } from '@/lib/types'
import { MOOD_OPTIONS } from '@/lib/constants'
import { useDiaryStore } from '@/stores/diaryStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { BookOpen, PenLine, Trash2, Plus } from 'lucide-react'

export default function Diary() {
  const entries = useDiaryStore((s) => s.entries)
  const addEntry = useDiaryStore((s) => s.addEntry)
  const updateEntry = useDiaryStore((s) => s.updateEntry)
  const deleteEntry = useDiaryStore((s) => s.deleteEntry)

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries]
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formDate, setFormDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [formMood, setFormMood] = useState<MoodType>('normal')
  const [formContent, setFormContent] = useState('')

  const [deleteId, setDeleteId] = useState<string | null>(null)

  const openAdd = () => {
    setEditingId(null)
    setFormDate(format(new Date(), 'yyyy-MM-dd'))
    setFormMood('normal')
    setFormContent('')
    setFormOpen(true)
  }

  const openEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id)
    setFormDate(entry.date)
    setFormMood(entry.mood)
    setFormContent(entry.content)
    setFormOpen(true)
  }

  const handleSave = () => {
    if (!formDate || !formContent.trim()) return
    if (editingId) {
      updateEntry(editingId, { date: formDate, mood: formMood, content: formContent.trim() })
    } else {
      addEntry({ date: formDate, mood: formMood, content: formContent.trim() })
    }
    setFormOpen(false)
  }

  const handleDelete = () => {
    if (deleteId) {
      deleteEntry(deleteId)
      setDeleteId(null)
    }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* 标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">学习日记</h1>
          <p className="mt-1 text-sm text-muted-foreground">记录每天的学习心情与感受</p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto">
          <Plus className="mr-1 h-4 w-4" />
          写日记
        </Button>
      </div>

      {/* 空状态 */}
      {sortedEntries.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 md:py-16 text-muted-foreground">
          <BookOpen className="mb-4 size-10 md:size-12 opacity-30" />
          <p className="text-base md:text-lg font-medium">还没有日记</p>
          <p className="mt-1 text-sm px-4 text-center">写下第一篇日记，记录你的学习旅程吧！</p>
        </div>
      )}

      {/* 日记列表 */}
      <div className="flex flex-col gap-3 md:gap-4">
        {sortedEntries.map((entry) => {
          const mood = MOOD_OPTIONS.find((m) => m.value === entry.mood)
          return (
            <Card key={entry.id} className="group/card">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg md:text-xl">{mood?.emoji}</span>
                      <span className="text-xs md:text-sm font-medium text-muted-foreground">
                        {format(parseISO(entry.date), 'yyyy年M月d日 EEEE', { locale: zhCN })}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] md:text-xs bg-muted'
                        )}
                      >
                        {mood?.label}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{entry.content}</p>
                  </div>

                  {/* 移动端始终显示操作按钮，桌面端 hover 显示 */}
                  <div className="flex shrink-0 gap-1 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => openEdit(entry)}
                      className="h-8 w-8"
                    >
                      <PenLine className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setDeleteId(entry.id)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 添加/编辑弹窗 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑日记' : '新学习日记'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改这篇日记的内容' : '记录今天的学习心情与收获'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium shrink-0">日期</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">心情</label>
              <div className="flex flex-wrap gap-2">
                {MOOD_OPTIONS.map((mood) => (
                  <button
                    key={mood.value}
                    onClick={() => setFormMood(mood.value)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm transition-all',
                      formMood === mood.value
                        ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/30'
                        : 'border bg-background hover:bg-accent'
                    )}
                  >
                    <span>{mood.emoji}</span>
                    <span>{mood.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">内容</label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="今天学了什么？遇到了什么困难？有什么收获..."
                rows={6}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formDate || !formContent.trim()}
              className="w-full sm:w-auto"
            >
              {editingId ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除这条学习日记吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="w-full sm:w-auto">
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
