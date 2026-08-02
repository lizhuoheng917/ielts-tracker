import { createContext, useContext } from 'react'

export type AccountDialogContextValue = {
  openAccountDialog: (returnFocus?: HTMLElement | null) => void
}

export const AccountDialogContext = createContext<AccountDialogContextValue | null>(null)

export function useAccountDialog() {
  const value = useContext(AccountDialogContext)
  if (!value) throw new Error('useAccountDialog 必须在 AccountDialogProvider 内使用')
  return value
}
