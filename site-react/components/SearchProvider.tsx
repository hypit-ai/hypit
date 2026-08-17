'use client'

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import type { SearchEntry } from '@/lib/search-index'
import { SearchDialog } from './SearchDialog'

type SearchState = {
  open: () => void
}

const Ctx = createContext<SearchState | null>(null)

/**
 * Holds the search dialog and its open state. The index is built on the server
 * and handed down as a prop, so the client never reads the content directory.
 */
export function SearchProvider({
  index,
  children,
}: {
  index: { en: SearchEntry[]; zh: SearchEntry[] }
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  // ⌘K / Ctrl-K anywhere on the site, and "/" when not already typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setIsOpen((v) => !v)
        return
      }
      if (event.key !== '/') return
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      if (typing) return
      event.preventDefault()
      setIsOpen(true)
    }

    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <SearchDialog open={isOpen} onClose={close} index={index} />
    </Ctx.Provider>
  )
}

/** Null when rendered outside the provider, so the header can hide its button. */
export function useSearch() {
  return useContext(Ctx)
}
