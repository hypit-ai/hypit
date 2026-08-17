'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSite } from './SiteContext'
import { DemoSection } from './demo/DemoSection'
import type { DemoId } from './demo/semantic-video-demos'
import styles from './HeroDemo.module.css'

const GAP = 26

type Card = { demo: DemoId | 'ranking'; manifestIndex: number }

// manifestIndex points into demoMediaManifests: 0 ranking, 1 street, 2 gbb.
const CARDS: Card[] = [
  { demo: 'ranking', manifestIndex: 0 },
  { demo: 'street', manifestIndex: 1 },
  { demo: 'good-better-best', manifestIndex: 2 },
]

/**
 * The experimental hero: the demo carousel fills the first screen and the
 * wordmark, pitch and calls to action sit on a glass panel over its lower
 * left. Carousel mechanics mirror `Carousel.tsx` — the two are kept separate
 * so the existing home page is unaffected by anything tried here.
 */
export function HeroDemo() {
  const { t } = useSite()
  const [idx, setIdx] = useState(0)
  const [animating, setAnimating] = useState(true)
  const [offset, setOffset] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  // 首尾各克隆一张，两侧始终有卡可露，并让循环无缝
  const rendered = [CARDS[CARDS.length - 1], ...CARDS, CARDS[0]]

  const place = useCallback(() => {
    const vp = viewportRef.current
    const track = trackRef.current
    if (!vp || !track) return
    const slide = track.querySelector<HTMLElement>(`.${styles.slide}`)
    if (!slide) return
    const slW = slide.getBoundingClientRect().width
    setOffset((idx + 1) * (slW + GAP) - (vp.clientWidth - slW) / 2)
  }, [idx])

  useEffect(() => {
    place()
  }, [place])

  useEffect(() => {
    const onResize = () => {
      setAnimating(false)
      place()
      requestAnimationFrame(() => setAnimating(true))
    }
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [place])

  const onTransitionEnd = () => {
    if (idx < 0 || idx >= CARDS.length) {
      setAnimating(false)
      setIdx((n) => (n + CARDS.length) % CARDS.length)
    }
  }

  useEffect(() => {
    if (animating) return
    const frame = requestAnimationFrame(() => setAnimating(true))
    return () => cancelAnimationFrame(frame)
  }, [animating])

  const active = ((idx % CARDS.length) + CARDS.length) % CARDS.length

  return (
    <section className={styles.stage}>
      <div className={styles.car} ref={viewportRef}>
        <div
          className={styles.track}
          ref={trackRef}
          onTransitionEnd={onTransitionEnd}
          style={{
            transform: `translateX(${-offset}px)`,
            transition: animating ? undefined : 'none',
          }}
        >
          {rendered.map((card, n) => {
            const realIndex = (n - 1 + CARDS.length) % CARDS.length
            const isActive = realIndex === active
            return (
              <div
                key={n}
                className={styles.slide}
                data-active={isActive ? '' : undefined}
              >
                <DemoSection
                  demo={card.demo}
                  manifestIndex={card.manifestIndex}
                  active={isActive}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* 覆盖层与激活卡片同宽并居中，面板与控件因此落在卡片自己的下缘内，
          而不是浮在屏幕边缘的暗卡上 */}
      <div className={styles.overlay}>
        <div className={styles.panel}>
          <svg className={styles.wordmark} viewBox="0 0 1200 268" role="img" aria-label="Narratage">
            <text
              x="0"
              y="252"
              fontFamily="Impact, Haettenschweiler, 'Arial Narrow Bold', 'Arial Black', sans-serif"
              fontSize="268"
              textLength="1200"
              lengthAdjust="spacingAndGlyphs"
            >
              <tspan className={styles.wInk}>NARRA</tspan>
              <tspan className={styles.wRed}>TAGE</tspan>
            </text>
          </svg>

          <p className={styles.tag}>
            {t(
              'A language and system for AI agents to create video.',
              '一套让 AI agent 创作视频的语言与系统。'
            )}
          </p>
          <p className={styles.sub}>{t('Built to kill Adobe.', '为终结 Adobe 而生。')}</p>

          <div className={styles.cta}>
            <Link href="/guide/quick-start" className={`${styles.btn} ${styles.solid}`}>
              <span>{t('Get started', '开始使用')}</span>
              <svg className={styles.arw} width="17" height="12" viewBox="0 0 18 13" fill="none" aria-hidden>
                <path
                  d="M0 6.5h16M11 1l5.5 5.5L11 12"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <a
              className={`${styles.btn} ${styles.ghost}`}
              href="https://github.com/hypit-ai/narratage"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('View on GitHub', '在 GitHub 查看')}
            </a>
          </div>
        </div>

        {/* 控件成组放右下，避开左下的字标面板 */}
        <div className={styles.controls}>
          <div className={styles.dots}>
            {CARDS.map((_, n) => (
              <button
                key={n}
                className={styles.dot}
                aria-current={n === active}
                aria-label={`Slide ${n + 1}`}
                onClick={() => setIdx(n)}
              />
            ))}
          </div>
          <div className={styles.arrows}>
            <button
              className={styles.nav}
              onClick={() => setIdx((n) => n - 1)}
              aria-label={t('Previous slide', '上一张')}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 4 7 12l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              className={styles.nav}
              onClick={() => setIdx((n) => n + 1)}
              aria-label={t('Next slide', '下一张')}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M9 4l8 8-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
