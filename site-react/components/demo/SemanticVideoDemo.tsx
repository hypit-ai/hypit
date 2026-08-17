'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  enableDemoAudioAfterInteraction,
  getDemoAudioServerSnapshot,
  getDemoAudioSnapshot,
  initializeDemoAudio,
  subscribeDemoAudio,
  toggleDemoAudio,
} from './demo-audio'
import { goodBetterBestMedia, resolveDemoMedia } from './demo-media'
import { demoPointerIsInside } from './demo-pointer'
import { wordAtTime } from './demo-word-timing'
import { useSourcePanelInteraction } from './useSourcePanelInteraction'
import {
  semanticVideoDemos,
  type DemoId,
  type DemoSelection,
  type DemoSourceLine,
  type SemanticVideoDemoConfig,
  type WordCue,
} from './semantic-video-demos'
import {
  buildFoldedSourceView,
  buildFullSourceView,
  type SourceDisplayEntry,
} from './source-display'
import styles from './SemanticVideoDemo.module.css'

type RangeBounds = { id: string; start: number; end: number; depth: number }
type DisplayLine = SourceDisplayEntry<DemoSourceLine>

// Everything derived from a demo config is precomputed once per demo id, so
// mounting a demo never recomputes bounds or re-decorates source lines.
function buildDemo(config: SemanticVideoDemoConfig) {
  const sourceLines = config.lines

  const rawBounds = config.selections
    .map((selection) => ({
      id: selection.id,
      start: sourceLines.findIndex((line) => line.html.includes(`>@${selection.id}</span>`)),
      end: sourceLines.findIndex((line) => line.html.includes(`>@/${selection.id}</span>`)),
    }))
    .filter((range) => range.start >= 0 && range.end >= range.start)

  const rangeBounds: RangeBounds[] = rawBounds.map((range) => ({
    ...range,
    depth: rawBounds.filter(
      (candidate) =>
        candidate.id !== range.id && candidate.start <= range.start && candidate.end >= range.end,
    ).length,
  }))

  function decorateLine(line: DemoSourceLine) {
    if (!line.tokens) return line.html
    let cueIndex = line.tokens[0]
    const end = line.tokens[1]
    return line.html
      .split(/(<span\b[^>]*>.*?<\/span>)/giu)
      .map((part) => {
        if (part.startsWith('<span')) return part
        let output = ''
        let cursor = 0
        while (cueIndex < end) {
          const cue = config.words[cueIndex]
          const position = part.toLocaleLowerCase().indexOf(cue.text.toLocaleLowerCase(), cursor)
          if (position === -1) break
          output += part.slice(cursor, position)
          output += `<span class="script-word" data-word-index="${cue.index}">${part.slice(position, position + cue.text.length)}</span>`
          cursor = position + cue.text.length
          cueIndex += 1
        }
        return output + part.slice(cursor)
      })
      .join('')
  }

  return {
    config,
    sourceLines,
    sceneSelections: config.selections.filter((selection) => selection.layer === 'scene'),
    overlaySelections: config.selections.filter((selection) => selection.layer === 'overlay'),
    rangeBounds,
    decoratedLines: sourceLines.map(decorateLine),
  }
}

const GBB_SLOTS = [
  { id: 'good', label: 'GOOD', slotClass: 'slotGood' },
  { id: 'better', label: 'BETTER', slotClass: 'slotBetter' },
  { id: 'best', label: 'BEST', slotClass: 'slotBest' },
] as const

const DEMOS: Record<DemoId, ReturnType<typeof buildDemo>> = {
  street: buildDemo(semanticVideoDemos.street),
  'good-better-best': buildDemo(semanticVideoDemos['good-better-best']),
}

function roundedRangePath(points: Array<{ x: number; y: number }>, radius = 6) {
  return (
    points
      .map((point, index) => {
        const previous = points[(index - 1 + points.length) % points.length]
        const next = points[(index + 1) % points.length]
        const previousLength = Math.hypot(previous.x - point.x, previous.y - point.y) || 1
        const nextLength = Math.hypot(next.x - point.x, next.y - point.y) || 1
        const cornerRadius = Math.min(radius, previousLength / 2, nextLength / 2)
        const before = {
          x: point.x + ((previous.x - point.x) * cornerRadius) / previousLength,
          y: point.y + ((previous.y - point.y) * cornerRadius) / previousLength,
        }
        const after = {
          x: point.x + ((next.x - point.x) * cornerRadius) / nextLength,
          y: point.y + ((next.y - point.y) * cornerRadius) / nextLength,
        }
        return `${index === 0 ? 'M' : 'L'} ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`
      })
      .join(' ') + ' Z'
  )
}

export function SemanticVideoDemo({
  demo,
  active = true,
  showHeading = true,
  isChinese = false,
  onEnded,
}: {
  demo: DemoId
  active?: boolean
  showHeading?: boolean
  isChinese?: boolean
  onEnded?: () => void
}) {
  const { config, sourceLines, sceneSelections, overlaySelections, rangeBounds, decoratedLines } =
    DEMOS[demo]
  const isStreet = demo === 'street'

  const sceneIndexAt = useCallback(
    (time: number) => {
      const index = config.scenes.findIndex((scene) => time >= scene.start && time < scene.end)
      return index === -1 ? config.scenes.length - 1 : index
    },
    [config],
  )

  const audio = useSyncExternalStore(
    subscribeDemoAudio,
    getDemoAudioSnapshot,
    getDemoAudioServerSnapshot,
  )

  const [sourceFollowEnabled, setSourceFollowEnabled] = useState(true)
  const [pinnedSelection, setPinnedSelection] = useState<string | null>(null)
  const [activeWord, setActiveWord] = useState<WordCue | null>(null)
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0)
  const [activeSceneSelection, setActiveSceneSelection] = useState<DemoSelection>(sceneSelections[0])
  const [activeOverlaySelection, setActiveOverlaySelection] = useState<DemoSelection | null>(null)
  const [sourceViewportRows, setSourceViewportRows] = useState(27)
  const [sourceLineRows, setSourceLineRows] = useState<number[]>(() => sourceLines.map(() => 1))
  const [visibleLogoCount, setVisibleLogoCount] = useState(0)
  const [rangeCanvas, setRangeCanvas] = useState({ width: 0, height: 0 })
  const [rangeGeometry, setRangeGeometry] = useState<Record<string, { path: string; depth: number }>>({})

  const sourcePanelElement = useRef<HTMLDivElement | null>(null)
  const codeScrollElement = useRef<HTMLDivElement | null>(null)
  const sourceMeasureElement = useRef<HTMLDivElement | null>(null)
  const playheadElement = useRef<HTMLElement | null>(null)
  const baseVideos = useRef<HTMLVideoElement[]>([])
  const overlayVideos = useRef<HTMLVideoElement[]>([])

  // Playback bookkeeping the render loop mutates every frame. These stay in
  // refs because re-rendering on each rAF tick would be far too expensive.
  const pinnedLoopSelection = useRef<string | null>(null)
  const animationFrame = useRef(0)
  const previousTimestamp = useRef(0)
  const programTime = useRef(0)
  const playbackSceneIndex = useRef(-1)
  const playbackOverlayId = useRef<string | null>(null)
  const completedPass = useRef(false)
  const audioRef = useRef(audio)
  audioRef.current = audio
  const activeRef = useRef(active)
  activeRef.current = active
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded

  // Mirror reactive state the animation loop reads, so callbacks stay stable.
  const stateRef = useRef({
    currentSceneIndex,
    activeSceneSelection,
    activeOverlaySelection,
    activeWord,
  })
  stateRef.current = { currentSceneIndex, activeSceneSelection, activeOverlaySelection, activeWord }

  const activeCaptionWords = useMemo(() => {
    if (!activeWord) return []
    const start = Math.floor(activeWord.index / 3) * 3
    return config.words.slice(start, start + 3)
  }, [activeWord])

  const sourceSelections = useMemo(() => {
    const automatic = [
      activeSceneSelection,
      ...(activeOverlaySelection ? [activeOverlaySelection] : []),
    ]
    if (!pinnedSelection) return automatic
    const pinned = config.selections.find((selection) => selection.id === pinnedSelection)
    if (!pinned) return automatic
    const bounds = rangeBounds.find((range) => range.id === pinned.id)
    const outer = bounds
      ? rangeBounds
          .filter((candidate) => candidate.start <= bounds.start && candidate.end >= bounds.end)
          .sort((left, right) => left.depth - right.depth)[0]
      : undefined
    const outerSelection = config.selections.find((selection) => selection.id === outer?.id)
    const pinnedSelections =
      outerSelection && outerSelection.id !== pinned.id ? [outerSelection, pinned] : [pinned]
    const activeNestedOverlay =
      pinned.layer === 'scene' &&
      activeOverlaySelection &&
      activeOverlaySelection.start >= pinned.start &&
      activeOverlaySelection.end <= pinned.end
        ? activeOverlaySelection
        : null
    return activeNestedOverlay ? [...pinnedSelections, activeNestedOverlay] : pinnedSelections
  }, [pinnedSelection, activeSceneSelection, activeOverlaySelection])

  const sourceWordLine = useMemo(() => {
    const wordIndex = activeWord?.index
    if (wordIndex === undefined) {
      return rangeBounds.find((range) => range.id === activeSceneSelection.id)?.start ?? 0
    }
    const lineIndex = sourceLines.findIndex(
      (line) => line.tokens && wordIndex >= line.tokens[0] && wordIndex < line.tokens[1],
    )
    return lineIndex >= 0 ? lineIndex : 0
  }, [activeWord, activeSceneSelection])

  const bindingLine = useMemo(() => {
    const id = activeOverlaySelection?.id ?? activeSceneSelection.id
    const index = sourceLines.findIndex((line, lineIndex) => line.selection === id && lineIndex > 24)
    if (index >= 0) return index
    const scriptEnd = sourceLines.findIndex((line) => line.html.includes('&lt;/script&gt;'))
    return Math.min(sourceLines.length - 1, scriptEnd + 2)
  }, [activeOverlaySelection, activeSceneSelection])

  const displayedLines = useMemo<DisplayLine[]>(() => {
    if (!sourceFollowEnabled) return buildFullSourceView(sourceLines)
    const sideRows = Math.max(3, Math.floor((sourceViewportRows - 1) / 2))
    const activeRanges = sourceSelections
      .map((selection) => rangeBounds.find((range) => range.id === selection.id))
      .filter((range): range is RangeBounds => range !== undefined)
      .sort((left, right) => left.depth - right.depth)
    return buildFoldedSourceView({
      lines: sourceLines,
      rowSpans: sourceLineRows,
      rowBudget: sideRows,
      topRanges: activeRanges,
      topFocus: sourceWordLine,
      bottomLine: bindingLine,
    })
  }, [sourceFollowEnabled, sourceViewportRows, sourceSelections, sourceLineRows, sourceWordLine, bindingLine])

  const renderedLineHtml = useCallback(
    (index: number) => {
      let html = decoratedLines[index]
      if (activeWord) {
        html = html.replace(
          `class="script-word" data-word-index="${activeWord.index}"`,
          `class="script-word active" data-word-index="${activeWord.index}"`,
        )
      }
      for (const selection of sourceSelections) {
        const depth = rangeBounds.find((range) => range.id === selection.id)?.depth ?? 0
        html = html.replaceAll(
          `semantic-token" data-selection="${selection.id}"`,
          `semantic-token semantic-active semantic-depth-${depth}" data-selection="${selection.id}"`,
        )
      }
      return html
    },
    [activeWord, sourceSelections],
  )

  const bindingDepth = useCallback(
    (line: DemoSourceLine) => {
      if (!line.selection || !sourceSelections.some((selection) => selection.id === line.selection)) {
        return -1
      }
      return rangeBounds.find((range) => range.id === line.selection)?.depth ?? 0
    },
    [sourceSelections],
  )

  const updateRangeGeometry = useCallback(() => {
    const container = codeScrollElement.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const width = container.clientWidth
    const scaleX = container.offsetWidth ? containerRect.width / container.offsetWidth : 1
    const scaleY = container.offsetHeight ? containerRect.height / container.offsetHeight : 1
    const renderedLines = Array.from(
      container.querySelectorAll<HTMLElement>(':scope > .code-line'),
    )
    const lastLine = renderedLines.at(-1)
    const height = Math.max(
      container.clientHeight,
      lastLine ? lastLine.offsetTop + lastLine.offsetHeight : container.clientHeight,
    )
    const markers = Array.from(
      container.querySelectorAll<HTMLElement>('.syn-marker[data-selection]'),
    )
    const geometry: Record<string, { path: string; depth: number }> = {}

    for (const range of rangeBounds) {
      const startMarker = markers.find(
        (marker) =>
          marker.dataset.selection === range.id && marker.textContent?.trim() === `@${range.id}`,
      )
      const endMarker = markers.find(
        (marker) =>
          marker.dataset.selection === range.id && marker.textContent?.trim() === `@/${range.id}`,
      )
      const startLine = startMarker?.closest<HTMLElement>('.code-line')
      const endLine = endMarker?.closest<HTMLElement>('.code-line')
      if (!startMarker || !endMarker || !startLine || !endLine) continue
      const startFragments = Array.from(startMarker.getClientRects())
      const endFragments = Array.from(endMarker.getClientRects())
      const startRect = startFragments[0] ?? startMarker.getBoundingClientRect()
      const endRect = endFragments.at(-1) ?? endMarker.getBoundingClientRect()
      const lineHeight = Number.parseFloat(getComputedStyle(startLine).lineHeight) || 26
      const blockPadding = 0
      const startCenter =
        ((startRect.top + startRect.bottom) / 2 - containerRect.top) / scaleY + container.scrollTop
      const endCenter =
        ((endRect.top + endRect.bottom) / 2 - containerRect.top) / scaleY + container.scrollTop
      const inlinePadding = 3
      const edgeOverhang = 3
      const startX = Math.max(
        3,
        Math.min(
          width - 3,
          (startRect.left - containerRect.left) / scaleX + container.scrollLeft - inlinePadding,
        ),
      )
      const endX = Math.max(
        3,
        Math.min(
          width - 3,
          (endRect.right - containerRect.left) / scaleX + container.scrollLeft + inlinePadding,
        ),
      )
      const left = 44 - edgeOverhang
      const right = width - 12 + edgeOverhang
      const top = startCenter - lineHeight / 2 - blockPadding
      const bottom = endCenter + lineHeight / 2 + blockPadding
      const sameLine = Math.abs(startCenter - endCenter) < lineHeight / 2
      const endTop = endCenter - lineHeight / 2
      const startBottom = startCenter + lineHeight / 2
      const points = sameLine
        ? [
            { x: startX, y: top },
            { x: endX, y: top },
            { x: endX, y: bottom },
            { x: startX, y: bottom },
          ]
        : [
            { x: startX, y: top },
            { x: right, y: top },
            { x: right, y: endTop },
            { x: endX, y: endTop },
            { x: endX, y: bottom },
            { x: left, y: bottom },
            { x: left, y: startBottom },
            { x: startX, y: startBottom },
          ]
      geometry[range.id] = { path: roundedRangePath(points), depth: range.depth }
    }

    setRangeCanvas((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height },
    )
    setRangeGeometry(geometry)
  }, [])

  const syncState = useCallback((time: number, force = false) => {
    const current = stateRef.current
    const nextSceneIndex = sceneIndexAt(time)
    const sceneChanged = force || nextSceneIndex !== current.currentSceneIndex
    if (sceneChanged) setCurrentSceneIndex(nextSceneIndex)
    const nextSceneSelection =
      sceneSelections.find((selection) => time >= selection.start && time < selection.end) ??
      sceneSelections.find((selection) => time < selection.start) ??
      sceneSelections.at(-1)!
    if (force || nextSceneSelection.id !== current.activeSceneSelection.id) {
      setActiveSceneSelection(nextSceneSelection)
    }
    const nextOverlay =
      overlaySelections.find((selection) => time >= selection.start && time < selection.end) ?? null
    if (force || nextOverlay?.id !== current.activeOverlaySelection?.id) {
      setActiveOverlaySelection(nextOverlay)
    }
    const nextWord = wordAtTime(config.words, time)
    if (force || nextWord?.index !== current.activeWord?.index) setActiveWord(nextWord)
    if (config.id === 'good-better-best') {
      const nextLogoCount = time >= 23.12 ? 3 : time >= 14.12 ? 2 : time >= 4.01 ? 1 : 0
      setVisibleLogoCount((previous) => (previous === nextLogoCount ? previous : nextLogoCount))
    }
    return sceneChanged
  }, [config, sceneSelections, overlaySelections, sceneIndexAt])

  const syncBaseVideos = useCallback((force = false) => {
    const activeIndex = sceneIndexAt(programTime.current)
    const scene = config.scenes[activeIndex]
    const localTime = scene.sourceStart + Math.max(0, programTime.current - scene.start)
    const sceneChanged = playbackSceneIndex.current !== activeIndex
    baseVideos.current.forEach((video, index) => {
      if (!video) return
      video.muted = !audioRef.current.playbackEnabled || index !== activeIndex
      if (index !== activeIndex) {
        video.pause()
        return
      }
      if (force || sceneChanged || Math.abs(video.currentTime - localTime) > 0.2) {
        video.currentTime = localTime
      }
      if (activeRef.current && video.paused) void video.play().catch(() => undefined)
    })
    playbackSceneIndex.current = activeIndex
  }, [config, sceneIndexAt])

  const syncOverlayVideos = useCallback((force = false) => {
    if (config.id !== 'street') return
    overlayVideos.current.forEach((video, index) => {
      if (!video) return
      const selection = overlaySelections[index]
      const active = selection.id === stateRef.current.activeOverlaySelection?.id
      video.muted = true
      if (!active) {
        video.pause()
        return
      }
      const requestedTime = Math.max(0, programTime.current - selection.start)
      const sourceEnd = Number.isFinite(video.duration) ? Math.max(0, video.duration) : requestedTime
      const localTime = Math.min(requestedTime, sourceEnd)
      if (
        force ||
        playbackOverlayId.current !== selection.id ||
        Math.abs(video.currentTime - localTime) > 0.2
      ) {
        video.currentTime = localTime
      }
      if (requestedTime >= sourceEnd) {
        video.pause()
        return
      }
      if (activeRef.current && video.paused) void video.play().catch(() => undefined)
    })
    playbackOverlayId.current = stateRef.current.activeOverlaySelection?.id ?? null
  }, [config, overlaySelections])

  const clearInspection = useCallback(() => {
    setPinnedSelection(null)
    pinnedLoopSelection.current = null
  }, [])

  const seekTo = useCallback(
    (selection: DemoSelection) => {
      setPinnedSelection(selection.id)
      const bounds = rangeBounds.find((range) => range.id === selection.id)
      const outer = bounds
        ? rangeBounds
            .filter((candidate) => candidate.start <= bounds.start && candidate.end >= bounds.end)
            .sort((left, right) => left.depth - right.depth)[0]
        : undefined
      pinnedLoopSelection.current = outer?.id ?? selection.id
      programTime.current = selection.start
      previousTimestamp.current = 0
      syncState(programTime.current, true)
      syncBaseVideos(true)
      syncOverlayVideos(true)
    },
    [syncState, syncBaseVideos, syncOverlayVideos],
  )

  const pinnedRef = useRef(pinnedSelection)
  pinnedRef.current = pinnedSelection

  const inspectLine = useCallback(
    (line: DemoSourceLine) => {
      const id = line.range ?? line.selection
      if (!id) {
        clearInspection()
        return
      }
      const selection = config.selections.find((candidate) => candidate.id === id)
      if (selection && pinnedRef.current !== selection.id) seekTo(selection)
    },
    [clearInspection, seekTo],
  )

  const inspectToken = useCallback(
    (event: React.SyntheticEvent) => {
      const target =
        event.target instanceof Element ? event.target.closest<HTMLElement>('[data-selection]') : null
      const selection = config.selections.find(
        (candidate) => candidate.id === target?.dataset.selection,
      )
      if (selection && pinnedRef.current !== selection.id) seekTo(selection)
    },
    [seekTo],
  )

  const updateSourceViewportRows = useCallback(() => {
    const container = codeScrollElement.current
    if (!container) return
    let rows = Math.max(7, Math.floor(container.clientHeight / 26))
    if (rows % 2 === 0) rows -= 1
    setSourceViewportRows((previous) => (previous === rows ? previous : rows))
    const padding = Math.max(0, (container.clientHeight - rows * 26) / 2)
    container.style.setProperty('--source-vertical-padding', `${padding}px`)

    const measuredRows = Array.from(
      sourceMeasureElement.current?.querySelectorAll<HTMLElement>('[data-measure-line]') ?? [],
    ).map((line) => Math.max(1, Math.ceil(line.getBoundingClientRect().height / 26)))
    if (measuredRows.length !== sourceLines.length) return
    setSourceLineRows((previous) =>
      measuredRows.some((rowSpan, index) => rowSpan !== previous[index]) ? measuredRows : previous,
    )
  }, [])

  const updateLayoutGeometry = useCallback(() => {
    updateSourceViewportRows()
    updateRangeGeometry()
  }, [updateSourceViewportRows, updateRangeGeometry])

  const sourceFollowRef = useRef(sourceFollowEnabled)
  sourceFollowRef.current = sourceFollowEnabled

  const stopSourceFollow = useCallback(
    (event?: { target: EventTarget | null; clientY: number }) => {
      if (!sourceFollowRef.current) return
      const container = codeScrollElement.current
      const hoveredLine =
        event?.target instanceof Element && container
          ? event.target.closest<HTMLElement>('[data-source-line]')
          : null
      const lineIndex = Number(hoveredLine?.dataset.sourceLine)
      const lineOffset =
        event && hoveredLine ? event.clientY - hoveredLine.getBoundingClientRect().top : 0
      const targetTop = event && hoveredLine ? event.clientY - lineOffset : null
      sourceFollowRef.current = false
      setSourceFollowEnabled(false)
      if (!container || !Number.isInteger(lineIndex) || targetTop === null) return
      // The folded view expands on the next paint; realign then so the line the
      // pointer sits on does not jump.
      requestAnimationFrame(() => {
        const expandedLine = container.querySelector<HTMLElement>(
          `[data-source-line="${lineIndex}"]`,
        )
        if (!expandedLine) return
        const previousBehavior = container.style.scrollBehavior
        container.style.scrollBehavior = 'auto'
        container.scrollTop += expandedLine.getBoundingClientRect().top - targetTop
        container.style.scrollBehavior = previousBehavior
        updateRangeGeometry()
      })
    },
    [updateRangeGeometry],
  )

  const resumeSourceFollow = useCallback(() => {
    clearInspection()
    sourceFollowRef.current = true
    setSourceFollowEnabled(true)
  }, [clearInspection])

  const {
    sourceUsesHover,
    handleSourcePointerMove,
    handleSourcePointerDown,
    handleSourceClick,
    handleSourceWheel,
    handleSourcePointerLeave,
  } = useSourcePanelInteraction(sourcePanelElement, {
    active: () => activeRef.current,
    expand: stopSourceFollow,
    collapse: resumeSourceFollow,
  })

  const usesHoverRef = useRef(sourceUsesHover)
  usesHoverRef.current = sourceUsesHover

  const renderFrame = useCallback(
    (timestamp: number) => {
      if (!activeRef.current) {
        animationFrame.current = 0
        return
      }
      if (!previousTimestamp.current) previousTimestamp.current = timestamp
      const delta = Math.min(0.05, (timestamp - previousTimestamp.current) / 1000)
      previousTimestamp.current = timestamp
      const sceneIndex = stateRef.current.currentSceneIndex
      const scene = config.scenes[sceneIndex]
      const video = baseVideos.current[sceneIndex]
      let nextTime =
        video && !video.paused && video.readyState >= 2
          ? scene.start + video.currentTime - scene.sourceStart
          : programTime.current + delta
      let looped = false
      if (pinnedLoopSelection.current) {
        const loopSelection = config.selections.find(
          (selection) => selection.id === pinnedLoopSelection.current,
        )
        if (loopSelection && nextTime >= loopSelection.end) {
          nextTime = loopSelection.start
          looped = true
        }
      } else if (nextTime >= config.duration) {
        if (!completedPass.current) {
          completedPass.current = true
          onEndedRef.current?.()
        }
        nextTime = 0
        looped = true
      }
      programTime.current = nextTime
      const sceneChanged = syncState(programTime.current, looped)
      if (looped || sceneChanged) syncBaseVideos(true)
      syncOverlayVideos(looped)
      if (playheadElement.current) {
        playheadElement.current.style.left = `${Math.max(0, Math.min(100, (programTime.current / config.duration) * 100))}%`
      }
      animationFrame.current = requestAnimationFrame(renderFrame)
    },
    [syncState, syncBaseVideos, syncOverlayVideos],
  )

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(animationFrame.current)
    animationFrame.current = 0
    previousTimestamp.current = 0
    baseVideos.current.forEach((video) => video?.pause())
    overlayVideos.current.forEach((video) => video?.pause())
  }, [])

  const startPlayback = useCallback(() => {
    stopPlayback()
    programTime.current = 0
    playbackSceneIndex.current = -1
    playbackOverlayId.current = null
    completedPass.current = false
    setPinnedSelection(null)
    pinnedLoopSelection.current = null
    syncState(programTime.current, true)
    syncBaseVideos(true)
    syncOverlayVideos(true)

    if (!usesHoverRef.current) {
      resumeSourceFollow()
    } else {
      const sourceHovered = demoPointerIsInside(sourcePanelElement.current)
      if (!sourceHovered) clearInspection()
      sourceFollowRef.current = !sourceHovered
      setSourceFollowEnabled(!sourceHovered)
    }

    animationFrame.current = requestAnimationFrame(renderFrame)
  }, [
    stopPlayback,
    syncState,
    syncBaseVideos,
    syncOverlayVideos,
    renderFrame,
    resumeSourceFollow,
    clearInspection,
  ])

  const enableAudio = useCallback(
    (event?: Event) => {
      if (event?.target instanceof Element && event.target.closest('.live-audio-toggle')) return
      if (!enableDemoAudioAfterInteraction()) return
      syncBaseVideos()
    },
    [syncBaseVideos],
  )

  const handleToggleAudio = useCallback(() => {
    toggleDemoAudio()
    syncBaseVideos()
  }, [syncBaseVideos])

  useEffect(() => {
    initializeDemoAudio()
    const onEnable = (event: Event) => enableAudio(event)
    window.addEventListener('pointerdown', onEnable, { capture: true, once: true })
    window.addEventListener('keydown', onEnable, { capture: true, once: true })
    window.addEventListener('resize', updateLayoutGeometry)
    if (navigator.userActivation?.hasBeenActive) enableAudio()

    syncState(0, true)
    updateLayoutGeometry()

    let resizeObserver: ResizeObserver | null = null
    let rangeMutationObserver: MutationObserver | null = null
    if (codeScrollElement.current) {
      resizeObserver = new ResizeObserver(updateLayoutGeometry)
      resizeObserver.observe(codeScrollElement.current)
      rangeMutationObserver = new MutationObserver(() =>
        requestAnimationFrame(updateRangeGeometry),
      )
      rangeMutationObserver.observe(codeScrollElement.current, { childList: true, subtree: true })
    }

    return () => {
      stopPlayback()
      window.removeEventListener('pointerdown', onEnable, true)
      window.removeEventListener('keydown', onEnable, true)
      window.removeEventListener('resize', updateLayoutGeometry)
      resizeObserver?.disconnect()
      rangeMutationObserver?.disconnect()
    }
    // Mount-only: mirrors the Vue component's onMounted/onBeforeUnmount pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (active) startPlayback()
    else stopPlayback()
  }, [active, startPlayback, stopPlayback])

  // Vue used a post-flush watcher on the rendered line keys; useLayoutEffect is
  // the React equivalent, running after DOM mutation but before paint.
  const displayKey = displayedLines.map((entry) => entry.key).join('|')
  useLayoutEffect(() => {
    updateSourceViewportRows()
    updateLayoutGeometry()
    const frame = requestAnimationFrame(updateLayoutGeometry)
    return () => cancelAnimationFrame(frame)
  }, [displayKey, sourceFollowEnabled, sourceSelections, updateSourceViewportRows, updateLayoutGeometry])

  const heading = isChinese
    ? { hover: '悬停标记范围，查看对应画面', touch: '点击标记范围，查看对应画面' }
    : {
        hover: 'Hover a marked range to see the corresponding frame',
        touch: 'Tap a marked range to see the corresponding frame',
      }

  const followHint = isChinese
    ? sourceUsesHover
      ? sourceFollowEnabled
        ? '移入查看所有源码'
        : '移出查看精简视图'
      : sourceFollowEnabled
        ? '点击代码查看所有源码'
        : '点击空白处返回精简视图'
    : sourceUsesHover
      ? sourceFollowEnabled
        ? 'Move in to view all source'
        : 'Move out for the compact view'
      : sourceFollowEnabled
        ? 'Tap the code to view all source'
        : 'Tap outside for the compact view'

  return (
    <section
      className={`${styles.demo} svml-demo semantic-video-demo`}
      aria-label={isChinese ? 'SVML 交互式实时渲染预览' : 'Interactive SVML live-render preview'}
    >
      {showHeading && (
        <header className="demo-heading">
          <h2>
            <span className="hover-interaction-copy">{heading.hover}</span>
            <span className="touch-interaction-copy">{heading.touch}</span>
          </h2>
        </header>
      )}

      <div className="demo-shell real-demo-shell">
        <div
          ref={sourcePanelElement}
          className={`source-panel${sourceFollowEnabled ? ' source-following' : ''}`}
          onPointerMove={handleSourcePointerMove}
          onPointerDown={handleSourcePointerDown}
          onClick={handleSourceClick}
          onWheel={handleSourceWheel}
          onPointerLeave={handleSourcePointerLeave}
        >
          <div ref={sourceMeasureElement} className="source-measure" aria-hidden="true">
            {decoratedLines.map((html, index) => (
              <div key={index} className="code-line" data-measure-line={index}>
                <span className="line-number">{index + 1}</span>
                <code dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
              </div>
            ))}
          </div>

          <div className="source-follow-hint">{followHint}</div>

          <div
            ref={codeScrollElement}
            className="code-scroll"
            aria-label="SVML source code"
            onScroll={updateRangeGeometry}
          >
            {rangeCanvas.width > 0 && rangeCanvas.height > 0 && (
              <svg
                className="semantic-range-canvas"
                width={rangeCanvas.width}
                height={rangeCanvas.height}
                viewBox={`0 0 ${rangeCanvas.width} ${rangeCanvas.height}`}
                aria-hidden="true"
              >
                {sourceSelections.map((selection) => (
                  <path
                    key={selection.id}
                    className={`depth-${rangeGeometry[selection.id]?.depth ?? 0}`}
                    d={rangeGeometry[selection.id]?.path}
                  />
                ))}
              </svg>
            )}

            {displayedLines.map((entry) =>
              entry.kind === 'fold' ? (
                <div
                  key={entry.key}
                  className="code-line code-fold"
                  data-source-line={entry.index}
                  aria-hidden="true"
                >
                  <code>···</code>
                </div>
              ) : entry.line ? (
                <div
                  key={entry.key}
                  className={[
                    'code-line',
                    bindingDepth(entry.line) >= 0 ? 'binding-active' : '',
                    bindingDepth(entry.line) === 1 ? 'binding-depth-1' : '',
                    bindingDepth(entry.line) === 2 ? 'binding-depth-2' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-source-line={entry.index}
                  onMouseOver={() => inspectLine(entry.line!)}
                >
                  <span className="line-number">{entry.index + 1}</span>
                  <code
                    dangerouslySetInnerHTML={{ __html: renderedLineHtml(entry.index) || '&nbsp;' }}
                    onMouseOver={inspectToken}
                    onFocus={inspectToken}
                    onClick={inspectToken}
                  />
                </div>
              ) : null,
            )}
          </div>
        </div>

        <div className="preview-panel">
          <div className="real-preview-body">
            <div className={`${styles.stage} semantic-live-stage stage-${demo}`}>
              <div className="live-base-layer">
                {config.scenes.map((scene, index) => (
                  <video
                    key={scene.src}
                    ref={(element) => {
                      if (element) baseVideos.current[index] = element
                    }}
                    className={currentSceneIndex === index ? 'active' : undefined}
                    src={resolveDemoMedia(scene.src)}
                    muted={!audio.playbackEnabled || currentSceneIndex !== index}
                    playsInline
                    preload="auto"
                    onLoadedMetadata={() => syncBaseVideos(true)}
                  />
                ))}
              </div>

              {isStreet ? (
                <>
                  {overlaySelections.map((selection, index) => (
                    <video
                      key={selection.id}
                      ref={(element) => {
                        if (element) overlayVideos.current[index] = element
                      }}
                      className={`${styles.broll}${activeOverlaySelection?.id === selection.id ? ` ${styles.brollActive}` : ''}`}
                      src={resolveDemoMedia(selection.asset!)}
                      muted
                      playsInline
                      preload="auto"
                    />
                  ))}
                  <div className={`${styles.outline} ${styles.sceneOutline}`} />
                  {activeOverlaySelection && (
                    <div className={`${styles.outline} ${styles.brollOutline}`} />
                  )}
                </>
              ) : (
                <>
                  <div className={styles.gbbHeader}>
                    {GBB_SLOTS.map((item, index) => (
                      <div
                        key={item.id}
                        className={[
                          styles.gbbSlot,
                          styles[item.slotClass],
                          visibleLogoCount > index ? styles.gbbSlotVisible : '',
                          sourceSelections.some((selection) => selection.id === item.id)
                            ? styles.gbbSlotSelected
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <img src={resolveDemoMedia(goodBetterBestMedia.logos[index])} alt="" />
                        <strong>{item.label}</strong>
                      </div>
                    ))}
                  </div>
                  {activeOverlaySelection && (
                    <img
                      className={`${styles.gbbDeck}${
                        sourceSelections.some(
                          (selection) => selection.id === activeOverlaySelection.id,
                        )
                          ? ` ${styles.gbbDeckSelected}`
                          : ''
                      }`}
                      src={resolveDemoMedia(activeOverlaySelection.asset!)}
                      alt=""
                    />
                  )}
                </>
              )}

              {activeCaptionWords.length > 0 && (
                <div
                  className={`${styles.caption} ${isStreet ? styles.captionStreet : styles.captionGbb}`}
                  aria-hidden="true"
                >
                  {activeCaptionWords.map((word) => (
                    <span
                      key={word.index}
                      className={activeWord?.index === word.index ? styles.captionActive : undefined}
                    >
                      {word.text}
                    </span>
                  ))}
                </div>
              )}

              <button
                className="live-audio-toggle"
                type="button"
                aria-label={
                  isChinese
                    ? audio.enabled ? '静音' : '取消静音'
                    : audio.enabled ? 'Mute' : 'Unmute'
                }
                title={
                  isChinese
                    ? audio.enabled ? '静音' : '取消静音'
                    : audio.enabled ? 'Mute' : 'Unmute'
                }
                onClick={(event) => {
                  event.stopPropagation()
                  handleToggleAudio()
                }}
              >
                {/* Inline SVG rather than the upstream Material Symbols
                    ligature: this site does not load that icon font, so the
                    ligature rendered as the literal text "volume_up". */}
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
                  {audio.enabled ? (
                    <>
                      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                    </>
                  ) : (
                    <>
                      <path d="M16 9.5 21 15" />
                      <path d="M21 9.5 16 15" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <div className="real-semantic-controls">
            <div className="semantic-timeline">
              <div className="timeline-labels ranking-labels demo-progress-labels">
                {sceneSelections.map((selection) => (
                  <button
                    key={selection.id}
                    type="button"
                    className={activeSceneSelection.id === selection.id ? 'current' : undefined}
                    style={{ flexGrow: selection.end - selection.start }}
                    onClick={() => seekTo(selection)}
                  >
                    @{selection.id}
                  </button>
                ))}
              </div>
              <div className={`${styles.progressTrack} timeline-track demo-progress-track`}>
                {sceneSelections.map((selection) => (
                  <span
                    key={selection.id}
                    className={`${styles.segment} segment${activeSceneSelection.id === selection.id ? ` ${styles.segmentActive} active` : ''}`}
                    style={{ flexGrow: selection.end - selection.start }}
                  />
                ))}
                <i ref={playheadElement} className="playhead" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
