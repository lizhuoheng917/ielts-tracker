import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORAGE_PREFIX } from '@/lib/constants'

export interface ChatMessageRecord {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface ChatStore {
  /** 按上下文分组存储对话历史，如 { plans: [...], practice: [...] } */
  conversations: Record<string, ChatMessageRecord[]>
  getMessages: (context: string) => ChatMessageRecord[]
  addMessage: (context: string, msg: ChatMessageRecord) => void
  setMessages: (context: string, msgs: ChatMessageRecord[]) => void
  clearMessages: (context: string) => void
}

const MAX_MESSAGES = 10

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: {},
      getMessages: (context) => get().conversations[context] || [],
      addMessage: (context, msg) =>
        set((state) => ({
          conversations: {
            ...state.conversations,
            [context]: [...(state.conversations[context] || []), msg].slice(-MAX_MESSAGES),
          },
        })),
      setMessages: (context, msgs) =>
        set((state) => ({
          conversations: {
            ...state.conversations,
            [context]: msgs.slice(-MAX_MESSAGES),
          },
        })),
      clearMessages: (context) =>
        set((state) => ({
          conversations: {
            ...state.conversations,
            [context]: [],
          },
        })),
    }),
    {
      name: `${STORAGE_PREFIX}:aiChatHistory`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
