'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type Lang = 'en' | 'zh'

type SiteState = {
  lang: Lang
  setLang: (l: Lang) => void
  toggleLang: () => void
  toggleTheme: () => void
  /** 按当前语言取文案 */
  t: (en: string, zh: string) => string
}

const Ctx = createContext<SiteState | null>(null)

export function SiteProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
  }, [lang])

  const toggleLang = () => setLang((l) => (l === 'en' ? 'zh' : 'en'))

  const toggleTheme = () => {
    const root = document.documentElement
    const current =
      root.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark')
  }

  const t = (en: string, zh: string) => (lang === 'en' ? en : zh)

  return (
    <Ctx.Provider value={{ lang, setLang, toggleLang, toggleTheme, t }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSite() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSite must be used inside SiteProvider')
  return ctx
}
