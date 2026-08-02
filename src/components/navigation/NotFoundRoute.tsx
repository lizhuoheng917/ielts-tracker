import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export function NotFoundRoute() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-5 text-sm font-medium text-primary">404</p>
        <h1 className="mt-1 text-2xl font-bold">这个页面还没有学习记录</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          地址可能已变更，回到今日学习继续你的计划。
        </p>
        <Link to="/" className={cn(buttonVariants(), 'mt-6 gap-2')}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回今日学习
        </Link>
      </div>
    </section>
  )
}
