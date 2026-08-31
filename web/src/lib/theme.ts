const STORAGE_KEY = 'yy-theme'
const query = '(prefers-color-scheme: dark)'

export type Theme = 'light' | 'dark' | 'system'

export function readTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

function apply(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia(query).matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(theme: Theme): void {
  if (theme === 'system') {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, theme)
  }
  apply(theme)
}

/** 默认跟随系统；用户手动选过之后以选择为准 */
export function initTheme(): void {
  apply(readTheme())
  window.matchMedia(query).addEventListener('change', () => {
    if (readTheme() === 'system') apply('system')
  })
}
