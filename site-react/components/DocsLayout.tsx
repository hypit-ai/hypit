'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSite } from './SiteContext'
import { Header } from './Header'
import { Footer } from './Footer'
import styles from './DocsLayout.module.css'

type NavItem = { slug: string; en: string; zh: string }

/** 侧栏在这里定义一次，所有文档页共用 */
export const GUIDE_SECTIONS: { en: string; zh: string; items: NavItem[] }[] = [
  {
    en: 'Get started',
    zh: '开始使用',
    items: [
      { slug: 'quick-start', en: 'Overview', zh: '概览' },
      { slug: 'script', en: 'Script', zh: 'Script' },
      { slug: 'stylesheet', en: 'SVS stylesheet', zh: 'SVS 样式表' },
      { slug: 'media', en: 'Media & generation', zh: '媒体与生成' },
      { slug: 'timing', en: 'Timing & assembly', zh: '时序与装配' },
      { slug: 'captions', en: 'Captions, B-roll & text', zh: '字幕、B-roll 与文字' },
      { slug: 'render', en: 'Film & render', zh: 'Film 与渲染' },
      { slug: 'build', en: 'Run source & build', zh: 'Run Source 与 Build' },
    ],
  },
  {
    en: 'Develop',
    zh: '开发',
    items: [
      { slug: 'develop', en: 'Overview', zh: '概览' },
      { slug: 'packages', en: 'Package Architecture', zh: '包架构' },
      { slug: 'author-packages', en: 'Adding an Author Package', zh: '新增作者包' },
      { slug: 'providers', en: 'Adding a Provider', zh: '新增 Provider' },
      { slug: 'runtime-profile', en: 'Runtime Profile', zh: 'Runtime Profile' },
      { slug: 'caption-playground', en: 'Caption Playground', zh: 'Caption Playground' },
      { slug: 'services', en: 'Local Services', zh: '本地服务' },
      { slug: 'testing', en: 'Testing', zh: '测试' },
      { slug: 'conventions', en: 'Conventions', zh: '约定' },
    ],
  },
]

/** Flat reading order across every section, for the prev/next pager. */
export const GUIDE_NAV: NavItem[] = GUIDE_SECTIONS.flatMap((section) => section.items)

export type TocItem = { id: string; en: string; zh: string }

// Tracks which section the reader is in. A heading counts as current once it
// crosses the top band of the viewport, and stays current until the next one
// does — so the highlight advances on the way down and reverses on the way up.
function useActiveHeading(toc: TocItem[]) {
  const [activeId, setActiveId] = useState<string>('')
  const ids = toc.map((item) => item.id).join('|')

  useEffect(() => {
    const headingIds = ids ? ids.split('|') : []
    if (!headingIds.length) return

    const elements = headingIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)
    if (!elements.length) return

    const sync = () => {
      // Bottom of the page can't scroll far enough to bring the last heading
      // into the band, so pin to the last item there.
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 2) {
        setActiveId(headingIds[headingIds.length - 1])
        return
      }
      const band = window.innerHeight * 0.3
      let current = elements[0].id
      for (const element of elements) {
        if (element.getBoundingClientRect().top <= band) current = element.id
        else break
      }
      setActiveId(current)
    }

    sync()
    window.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [ids])

  return activeId
}

export function DocsLayout({
  children,
  toc = [],
}: {
  children: React.ReactNode
  toc?: TocItem[]
}) {
  const { t, lang } = useSite()
  const pathname = usePathname()
  const activeHeading = useActiveHeading(toc)
  const slug = pathname.replace(/^\/guide\//, '')
  const currentSection =
    GUIDE_SECTIONS.find((section) => section.items.some((item) => item.slug === slug)) ??
    GUIDE_SECTIONS[0]
  const isDevelop = currentSection === GUIDE_SECTIONS[1]

  return (
    <>
      <Header docsAligned current={isDevelop ? 'develop' : 'quick-start'} />
      <div className={styles.doc}>
        <aside className={styles.side}>
          <div className={styles.sideSection}>
            <p className={styles.sideLabel}>
              {lang === 'en' ? currentSection.en : currentSection.zh}
            </p>
            <ul>
              {currentSection.items.map((item) => {
                const href = `/guide/${item.slug}`
                const active = pathname === href
                return (
                  <li key={item.slug}>
                    <Link href={href} aria-current={active ? 'page' : undefined}>
                      {lang === 'en' ? item.en : item.zh}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>

        <main className={styles.body}>{children}</main>

        <nav className={styles.toc} aria-label={t('On this page', '本页目录')}>
          <h3>{t('On this page', '本页目录')}</h3>
          <ul>
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={item.id === activeHeading ? 'true' : undefined}
                >
                  {lang === 'en' ? item.en : item.zh}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <Footer />
    </>
  )
}
