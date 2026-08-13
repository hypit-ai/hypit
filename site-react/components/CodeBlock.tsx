'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSite } from './SiteContext'
import styles from './CodeBlock.module.css'

/** Flattens the rendered children back to the raw text to put on the clipboard. */
function textOf(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}

export function CodeBlock({
  children,
  highlighted,
}: {
  children: React.ReactNode
  highlighted?: Record<string, string>
}) {
  const { t } = useSite()
  const code = textOf(children).replace(/\n$/, '')
  // Pre-highlighted markup from the server, when the language had a grammar.
  const html = highlighted?.[code]
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be denied; leaving the label unchanged is the
      // honest signal that nothing was copied.
    }
  }, [code])

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.copy}
        onClick={copy}
        aria-label={copied ? t('Copied', '已复制') : t('Copy code', '复制代码')}
      >
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
        <span>{copied ? t('Copied', '已复制') : t('Copy', '复制')}</span>
      </button>
      {html ? (
        <div className={styles.shiki} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className={styles.pre}>{children}</pre>
      )}
    </div>
  )
}
