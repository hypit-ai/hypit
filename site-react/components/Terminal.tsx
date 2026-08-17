'use client'

import { useState } from 'react'
import { useSite } from './SiteContext'
import styles from './Terminal.module.css'

export function Terminal({
  tag = 'bash',
  code,
  children,
}: {
  tag?: string
  /** 纯文本，用于复制 */
  code: string
  /** 带高亮的展示内容，缺省则用 code */
  children?: React.ReactNode
}) {
  const { t } = useSite()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* 剪贴板不可用时静默失败，用户仍可手动选中复制 */
    }
  }

  return (
    <div className={styles.term}>
      <div className={styles.bar}>
        <span className={styles.tag}>{tag}</span>
        <span className={styles.spacer} />
        <button className={styles.copy} onClick={copy}>
          {copied ? t('Copied', '已复制') : t('Copy', '复制')}
        </button>
      </div>
      <pre className={styles.pre}>{children ?? code}</pre>
    </div>
  )
}
