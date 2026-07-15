/**
 * 统一的本地存储持久化工具
 * 用于在 store 初始化前恢复数据，避免页面首次加载时的闪烁
 */

export function getLocalStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // 忽略解析错误
  }
  return defaultValue
}

export function setLocalStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 忽略存储错误（如存储空间不足）
  }
}
