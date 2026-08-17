'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Logo } from './Logo'
import { useSite } from './SiteContext'
import { useSearch } from './SearchProvider'
import styles from './Header.module.css'

type Props = {
  /** 文档页顶栏与左侧栏对齐，首页不需要 */
  docsAligned?: boolean
  current?: 'quick-start' | 'develop' | 'community'
  /** 关掉搜索框，让顶栏只剩品牌、导航和图标 */
  showSearch?: boolean
}

type NavItem = {
  key: Props['current'] | 'playground'
  label: string
  href?: string
  external?: boolean
}

/** 顶栏窄屏折叠的断点，与 Header.module.css 里的媒体查询一致 */
const COMPACT = '(max-width: 900px)'

export function Header({ docsAligned = false, current, showSearch = true }: Props) {
  const { t, toggleLang, toggleTheme } = useSite()
  const search = useSearch()
  const [menuOpen, setMenuOpen] = useState(false)
  const zoneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!zoneRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    // 视口拉宽后完整导航自己回来了，折叠菜单要跟着收起
    const compact = matchMedia(COMPACT)
    const onViewport = () => {
      if (!compact.matches) setMenuOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    compact.addEventListener('change', onViewport)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      compact.removeEventListener('change', onViewport)
    }
  }, [menuOpen])

  const items: NavItem[] = [
    { key: 'quick-start', href: '/guide/quick-start', label: t('Quick start', '快速开始') },
    { key: 'develop', href: '/guide/develop', label: t('Develop', '开发') },
    // Listed but not linked yet — no Playground page exists.
    { key: 'playground', label: t('Playground', 'Playground') },
    {
      key: 'community',
      href: 'https://discord.gg/cWQ92BaKV',
      external: true,
      label: t('Community', '社区'),
    },
  ]

  /**
   * 同一份导航项渲染两次：宽屏的一行，窄屏折叠面板里的一列。面板里的每一项
   * 点掉之后要顺手收起菜单——跳转本身不会卸载顶栏。
   */
  const renderItem = (item: NavItem, pendingClass: string, inMenu = false) => {
    const close = inMenu ? () => setMenuOpen(false) : undefined

    if (!item.href) {
      return (
        <span key={item.key} className={pendingClass}>
          {item.label}
        </span>
      )
    }
    if (item.external) {
      return (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={close}
        >
          {item.label}
        </a>
      )
    }
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={current === item.key ? 'page' : undefined}
        onClick={close}
      >
        {item.label}
      </Link>
    )
  }

  return (
    <header className={styles.header}>
      <div className={`${styles.bar} ${docsAligned ? styles.docsBar : ''}`}>
        <Link href="/" className={styles.brand} aria-label="Narratage — home">
          <Logo className={styles.logo} />
          {!docsAligned && <span className={styles.divider} />}
        </Link>

        {showSearch && (
          <button
            className={styles.search}
            onClick={search?.open}
            aria-label={t('Search docs', '搜索文档')}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className={styles.ph}>{t('Search docs…', '搜索文档…')}</span>
            <span className={styles.kbd}>⌘ K</span>
          </button>
        )}

        <div className={styles.navZone} ref={zoneRef}>
          <nav className={styles.nav}>{items.map((item) => renderItem(item, styles.pending))}</nav>

          <button
            className={styles.burger}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? t('Close menu', '关闭菜单') : t('Open menu', '打开菜单')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                {menuOpen ? (
                  <path d="M5 5l10 10M15 5L5 15" />
                ) : (
                  <path d="M3 6h14M3 10h14M3 14h14" />
                )}
              </g>
            </svg>
          </button>

          {menuOpen && (
            <nav className={styles.menu} id="site-menu">
              {items.map((item) => renderItem(item, styles.menuPending, true))}
            </nav>
          )}
        </div>

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
            href="https://github.com/hypit-ai/narratage"
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
