'use client'

import { useEffect, useRef, useState } from 'react'
import { useSite } from '../SiteContext'
import { RankingDemo } from './RankingDemo'
import { SemanticVideoDemo } from './SemanticVideoDemo'
import type { DemoId } from './semantic-video-demos'
import { demoMediaManifests, preloadDemoMedia, type DemoMediaManifest } from './demo-media'
import { clearDemoPointer, updateDemoPointer } from './demo-pointer'
import './demo.css'

// Wraps the ported demo the way SvmlDemoCarousel did upstream: preload the
// media, then mount the demo and drive `active` from viewport visibility.
// `demo` selects a SemanticVideoDemo config; 'ranking' selects the separate
// RankingDemo component, which has its own data and stage.
export function DemoSection({
  demo = 'street',
  manifestIndex = 1,
  active = true,
}: {
  demo?: DemoId | 'ranking'
  manifestIndex?: number
  active?: boolean
}) {
  const { lang } = useSite()
  const isChinese = lang === 'zh'
  const [loaded, setLoaded] = useState(false)
  const [onScreen, setOnScreen] = useState(true)
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const manifest: DemoMediaManifest = demoMediaManifests[manifestIndex]
    const assets = [
      ...manifest.images.map((source) => preloadDemoMedia(source, 'image')),
      ...manifest.videos.map((source) => preloadDemoMedia(source, 'video')),
    ]
    void Promise.allSettled(assets).then((results) => {
      if (cancelled) return
      const failures = results.filter((result) => result.status === 'rejected')
      if (failures.length) {
        console.warn(`SVML demo mounted with ${failures.length} media preload failure(s).`, failures)
      }
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [active, manifestIndex])

  useEffect(() => {
    const element = cardRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting && entry.intersectionRatio > 0.2),
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [loaded])

  return (
    <div
      className="svml-demo-showcase"
      aria-busy={!loaded}
      onPointerMove={(event) => updateDemoPointer(event.nativeEvent)}
      onPointerLeave={clearDemoPointer}
    >
      <div ref={cardRef} className="demo-card">
        {loaded ? (
          <div className="demo-card-content">
            {demo === 'ranking' ? (
              <RankingDemo active={active && onScreen} isChinese={isChinese} showHeading={false} />
            ) : (
              <SemanticVideoDemo
                demo={demo}
                active={active && onScreen}
                isChinese={isChinese}
                showHeading={false}
              />
            )}
          </div>
        ) : (
          <div className="demo-loading" role="status" aria-live="polite">
            <span className="demo-loading-spinner" aria-hidden="true" />
            <span>{isChinese ? '加载演示素材…' : 'Loading demo media…'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
