'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSite } from './SiteContext'
import { DemoSection } from './demo/DemoSection'
import type { DemoId } from './demo/semantic-video-demos'
import styles from './Carousel.module.css'

const GAP = 26

type Card = { demo: DemoId | 'ranking'; manifestIndex: number }

// manifestIndex points into demoMediaManifests: 0 ranking, 1 street, 2 gbb.
const CARDS: Card[] = [
  { demo: 'ranking', manifestIndex: 0 },
  { demo: 'street', manifestIndex: 1 },
  { demo: 'good-better-best', manifestIndex: 2 },
]

export function Carousel() {
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

  // Landing on a clone, the track is silently repositioned onto the matching
  // real card with the transition switched off, so the wrap is invisible: the
  // clone is identical to what replaces it and nothing appears to move.
  const onTransitionEnd = () => {
    if (idx < 0 || idx >= CARDS.length) {
      setAnimating(false)
      setIdx((n) => (n + CARDS.length) % CARDS.length)
    }
  }

  // Re-enable the transition only after the repositioned frame has painted.
  useEffect(() => {
    if (animating) return
    const frame = requestAnimationFrame(() => setAnimating(true))
    return () => cancelAnimationFrame(frame)
  }, [animating])

  const active = ((idx % CARDS.length) + CARDS.length) % CARDS.length

  return (
    <section className={styles.section} id="syntax">
      <div className={styles.wrap}>
        <div className="rule" />
        <h2 className={styles.head}>
          {t(
            'Hover over a marked range to preview the corresponding scene.',
            '悬停任意标记区间，即可预览对应的画面。'
          )}
        </h2>
      </div>

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
                className={`${styles.slide} ${styles.demoSlide}`}
                data-active={isActive ? '' : undefined}
              >
                {/* A clone shares its real card's active state, so the two are
                    visually identical when the track silently swaps between
                    them and the wrap-around never shows as a jump. */}
                <DemoSection
                  demo={card.demo}
                  manifestIndex={card.manifestIndex}
                  active={isActive}
                />
              </div>
            )
          })}
        </div>

        <button
          className={`${styles.nav} ${styles.prevB}`}
          onClick={() => setIdx((n) => n - 1)}
          aria-label={t('Previous slide', '上一张')}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 4 7 12l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className={`${styles.nav} ${styles.nextB}`}
          onClick={() => setIdx((n) => n + 1)}
          aria-label={t('Next slide', '下一张')}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 4l8 8-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

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
    </section>
  )
}
