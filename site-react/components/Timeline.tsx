'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSite } from './SiteContext'
import { semanticVideoDemos } from './demo/semantic-video-demos'
import styles from './Timeline.module.css'

type Clip = {
  id: string
  label: string
  start: number
  end: number
}

type Track = {
  id: string
  en: string
  zh: string
  kind: 'kindVideo' | 'kindBroll' | 'kindCaption' | 'kindAudio'
  clips: Clip[]
}

const demo = semanticVideoDemos.street
const DURATION = demo.duration

// Every clip below is read from the street-interview demo's own timing data,
// so the ruler and the blocks describe a real assembled film rather than a
// decorative mock.
const TRACKS: Track[] = [
  {
    id: 'video',
    en: 'Speech',
    zh: '口播',
    kind: 'kindVideo',
    clips: demo.selections
      .filter((selection) => selection.layer === 'scene')
      .map((selection) => ({
        id: selection.id,
        label: `@${selection.id}`,
        start: selection.start,
        end: selection.end,
      })),
  },
  {
    id: 'broll',
    en: 'B-roll',
    zh: 'B-roll',
    kind: 'kindBroll',
    clips: demo.selections
      .filter((selection) => selection.layer === 'overlay')
      .map((selection) => ({
        id: selection.id,
        label: `@${selection.id}`,
        start: selection.start,
        end: selection.end,
      })),
  },
  {
    id: 'caption',
    en: 'Captions',
    zh: '字幕',
    kind: 'kindCaption',
    // Words are grouped into cue-sized runs, the way the caption track emits them.
    clips: (() => {
      const clips: Clip[] = []
      for (let index = 0; index < demo.words.length; index += 3) {
        const group = demo.words.slice(index, index + 3)
        if (!group.length) break
        clips.push({
          id: `cue-${index}`,
          label: group.map((word) => word.text).join(' '),
          start: group[0].start,
          end: group[group.length - 1].end,
        })
      }
      return clips
    })(),
  },
  {
    id: 'audio',
    en: 'Audio',
    zh: '音频',
    kind: 'kindAudio',
    clips: [{ id: 'narration', label: 'narration', start: 0, end: DURATION }],
  },
]

const TICK_SECONDS = 5

function formatTime(seconds: number) {
  const whole = Math.floor(seconds)
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

export function Timeline() {
  const { t, lang } = useSite()
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [hovered, setHovered] = useState<string | null>(null)
  const laneRef = useRef<HTMLDivElement | null>(null)
  const frame = useRef(0)
  const previous = useRef(0)

  const ticks = useMemo(() => {
    const marks: number[] = []
    for (let second = 0; second <= DURATION; second += TICK_SECONDS) marks.push(second)
    return marks
  }, [])

  useEffect(() => {
    if (!playing) return
    previous.current = 0

    const step = (timestamp: number) => {
      if (!previous.current) previous.current = timestamp
      const delta = (timestamp - previous.current) / 1000
      previous.current = timestamp
      setTime((current) => (current + delta >= DURATION ? 0 : current + delta))
      frame.current = requestAnimationFrame(step)
    }

    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [playing])

  // Clicking or dragging anywhere in the lanes scrubs, like a real timeline.
  const scrubTo = useCallback((clientX: number) => {
    const lane = laneRef.current
    if (!lane) return
    const rect = lane.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setTime(ratio * DURATION)
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      scrubTo(event.clientX)
    },
    [scrubTo],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (event.buttons !== 1) return
      scrubTo(event.clientX)
    },
    [scrubTo],
  )

  const percent = (seconds: number) => `${(seconds / DURATION) * 100}%`

  return (
    <section className={styles.timeline} aria-label={t('Track timeline', '轨道时间轴')}>
      <header className={styles.head}>
        <button
          type="button"
          className={styles.play}
          onClick={() => setPlaying((current) => !current)}
          aria-label={playing ? t('Pause', '暂停') : t('Play', '播放')}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1.5" y="1" width="3" height="10" fill="currentColor" />
              <rect x="7.5" y="1" width="3" height="10" fill="currentColor" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 1l9 5-9 5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className={styles.clock}>
          {formatTime(time)} <span className={styles.clockTotal}>/ {formatTime(DURATION)}</span>
        </span>
        <span className={styles.caption}>
          {hovered ?? t('Drag anywhere to scrub', '拖动任意位置可定位')}
        </span>
      </header>

      <div className={styles.grid}>
        <div className={styles.labels}>
          <span className={styles.rulerSpacer} />
          {TRACKS.map((track) => (
            <span key={track.id} className={styles.label}>
              {lang === 'en' ? track.en : track.zh}
            </span>
          ))}
        </div>

        <div
          ref={laneRef}
          className={styles.lanes}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
        >
          <div className={styles.ruler} aria-hidden="true">
            {ticks.map((second) => (
              <span key={second} className={styles.tick} style={{ left: percent(second) }}>
                {formatTime(second)}
              </span>
            ))}
          </div>

          {TRACKS.map((track) => (
            <div key={track.id} className={styles.lane}>
              {track.clips.map((clip) => {
                const active = time >= clip.start && time < clip.end
                return (
                  <div
                    key={clip.id}
                    className={`${styles.clip} ${styles[track.kind]}${active ? ` ${styles.active}` : ''}`}
                    style={{
                      left: percent(clip.start),
                      width: percent(Math.max(0.12, clip.end - clip.start)),
                    }}
                    onMouseEnter={() => setHovered(clip.label)}
                    onMouseLeave={() => setHovered(null)}
                    title={clip.label}
                  >
                    <span className={styles.clipLabel}>{clip.label}</span>
                  </div>
                )
              })}
            </div>
          ))}

          <div className={styles.playhead} style={{ left: percent(time) }} aria-hidden="true">
            <i className={styles.playheadHandle} />
          </div>
        </div>
      </div>
    </section>
  )
}
