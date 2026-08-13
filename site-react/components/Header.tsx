'use client'

import Link from 'next/link'
import { Logo } from './Logo'
import { useSite } from './SiteContext'
import styles from './Header.module.css'

type Props = {
  /** 文档页顶栏与左侧栏对齐，首页不需要 */
  docsAligned?: boolean
  current?: 'quick-start' | 'develop' | 'community'
}

export function Header({ docsAligned = false, current }: Props) {
  const { t, toggleLang, toggleTheme } = useSite()

  return (
    <header className={styles.header}>
      <div className={`${styles.bar} ${docsAligned ? styles.docsBar : ''}`}>
        <Link href="/" className={styles.brand} aria-label="Narratage — home">
          <Logo className={styles.logo} />
          {!docsAligned && <span className={styles.divider} />}
        </Link>

        <button className={styles.search} aria-label={t('Search docs', '搜索文档')}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span className={styles.ph}>{t('Search docs…', '搜索文档…')}</span>
          <span className={styles.kbd}>⌘ K</span>
        </button>

        <nav className={styles.nav}>
          <Link
            href="/guide/quick-start"
            aria-current={current === 'quick-start' ? 'page' : undefined}
          >
            {t('Quick start', '快速开始')}
          </Link>
          <Link href="/guide/develop" aria-current={current === 'develop' ? 'page' : undefined}>
            {t('Develop', '开发')}
          </Link>
          {/* Listed but not linked yet — no Playground page exists. */}
          <span className={styles.pending}>{t('Playground', 'Playground')}</span>
          <a href="https://discord.gg/cWQ92BaKV" target="_blank" rel="noopener noreferrer">
            {t('Community', '社区')}
          </a>
        </nav>

        <div className={styles.icons}>
          <button
            className={styles.ibtn}
            onClick={toggleTheme}
            aria-label={t('Toggle colour theme', '切换主题')}
          >
            <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
              <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.6" />
              <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M10 1.6v2.2M10 16.2v2.2M1.6 10h2.2M16.2 10h2.2M4.1 4.1l1.6 1.6M14.3 14.3l1.6 1.6M15.9 4.1l-1.6 1.6M5.7 14.3l-1.6 1.6" />
              </g>
            </svg>
          </button>

          <button className={styles.ibtn} onClick={toggleLang} aria-label="EN / 中文">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
              <text x="0" y="12" fontFamily="system-ui, sans-serif" fontSize="13" fontWeight="600" fill="currentColor">
                文
              </text>
              <text x="11" y="20" fontFamily="system-ui, sans-serif" fontSize="11" fontWeight="600" fill="currentColor">
                A
              </text>
            </svg>
          </button>

          <a
            className={styles.ibtn}
            href="https://github.com/yw2675/narratage"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  )
}
