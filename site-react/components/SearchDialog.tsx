'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SearchEntry } from '@/lib/search-index'
import { useSite } from './SiteContext'
import styles from './SearchDialog.module.css'

const MAX_RESULTS = 12
const SNIPPET_RADIUS = 68

type Hit = SearchEntry & {
  score: number
  /** Offset of the first match inside `text`, or -1 when only the title matched. */
  at: number
}

/**
 * Scores one entry against a lowercased query. Heading and page-title matches
 * outrank body matches, so searching "captions" surfaces the Captions page
 * before the pages that merely mention captions in passing.
 */
function scoreEntry(entry: SearchEntry, query: string): Hit | null {
  const heading = entry.heading.toLowerCase()
  const page = entry.page.toLowerCase()
  const text = entry.text.toLowerCase()

  const inHeading = heading.indexOf(query)
  const inPage = page.indexOf(query)
  const inText = text.indexOf(query)

  if (inHeading < 0 && inPage < 0 && inText < 0) return null

  let score = 0
  if (inPage === 0) score += 100
  else if (inPage > 0) score += 55
  if (inHeading === 0) score += 80
  else if (inHeading > 0) score += 45
  if (inText >= 0) score += Math.max(1, 30 - Math.floor(inText / 90))

  return { ...entry, score, at: inText }
}

/** A window of body text around the match, with ellipses where it was cut. */
function snippet(text: string, at: number) {
  if (!text) return ''
  if (at < 0) return text.slice(0, SNIPPET_RADIUS * 2).trim()

  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(text.length, at + SNIPPET_RADIUS)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/** Splits a string on the query so the matched run can be wrapped in <mark>. */
function highlight(value: string, query: string) {
  if (!query) return [value]
  const parts: React.ReactNode[] = []
  const lower = value.toLowerCase()
  let cursor = 0

  for (;;) {
    const at = lower.indexOf(query, cursor)
    if (at < 0) break
    if (at > cursor) parts.push(value.slice(cursor, at))
    parts.push(
      <mark key={`${at}-${parts.length}`} className={styles.mark}>
        {value.slice(at, at + query.length)}
      </mark>,
    )
    cursor = at + query.length
  }

  if (cursor < value.length) parts.push(value.slice(cursor))
  return parts
}

export function SearchDialog({
  open,
  onClose,
  index,
}: {
  open: boolean
  onClose: () => void
  index: { en: SearchEntry[]; zh: SearchEntry[] }
}) {
  const { t, lang } = useSite()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const entries = lang === 'en' ? index.en : index.zh
  const trimmed = query.trim().toLowerCase()

  const hits = useMemo(() => {
    if (trimmed.length < 2) return []
    const scored: Hit[] = []
    for (const entry of entries) {
      const hit = scoreEntry(entry, trimmed)
      if (hit) scored.push(hit)
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS)
  }, [entries, trimmed])

  // A fresh query starts from the top of the list.
  useEffect(() => {
    setActive(0)
  }, [trimmed])

  // Opening clears the previous session and puts the caret in the field.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  // The page behind must not scroll while the dialog covers it.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const go = useCallback(
    (hit: Hit) => {
      onClose()
      router.push(hit.anchor ? `/guide/${hit.slug}#${hit.anchor}` : `/guide/${hit.slug}`)
    },
    [onClose, router],
  )

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (!hits.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((n) => (n + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((n) => (n - 1 + hits.length) % hits.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[active]
      if (hit) go(hit)
    }
  }

  // Keeps the keyboard selection inside the scrolling list.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const option = list.children[active] as HTMLElement | undefined
    option?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('Search docs', '搜索文档')}
        onKeyDown={onKeyDown}
      >
        <div className={styles.field}>
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search the docs…', '搜索文档…')}
            aria-label={t('Search the docs', '搜索文档')}
            autoComplete="off"
            spellCheck={false}
          />
          <button className={styles.esc} onClick={onClose} type="button">
            ESC
          </button>
        </div>

        {trimmed.length >= 2 && (
          <div className={styles.results}>
            {hits.length ? (
              <ul className={styles.list} ref={listRef} role="listbox">
                {hits.map((hit, n) => (
                  <li key={`${hit.slug}-${hit.anchor}-${n}`} role="option" aria-selected={n === active}>
                    <button
                      type="button"
                      className={`${styles.hit} ${n === active ? styles.hitActive : ''}`}
                      onMouseMove={() => setActive(n)}
                      onClick={() => go(hit)}
                    >
                      <span className={styles.crumb}>
                        {highlight(hit.page, trimmed)}
                        {hit.heading && (
                          <>
                            <span className={styles.sep}>›</span>
                            {highlight(hit.heading, trimmed)}
                          </>
                        )}
                      </span>
                      {hit.text && (
                        <span className={styles.snippet}>
                          {highlight(snippet(hit.text, hit.at), trimmed)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                {t('No matches for ', '没有匹配 ')}
                <strong>{query.trim()}</strong>
              </p>
            )}
          </div>
        )}

        <div className={styles.foot}>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t('to navigate', '选择')}
          </span>
          <span>
            <kbd>↵</kbd> {t('to open', '打开')}
          </span>
          <span>
            <kbd>esc</kbd> {t('to close', '关闭')}
          </span>
        </div>
      </div>
    </div>
  )
}
