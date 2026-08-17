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
import { resolveDemoMedia } from './demo-media'
import { demoPointerIsInside } from './demo-pointer'
import { wordAtTime } from './demo-word-timing'
import { useSourcePanelInteraction } from './useSourcePanelInteraction'
import {
  buildFoldedSourceView,
  buildFullSourceView,
  type SourceDisplayEntry,
} from './source-display'
import {
  baseScenes,
  brollBlock,
  brollItems,
  decoratedLines,
  ENTER_DURATION,
  lines,
  MOVE_DURATION,
  rankingBlock,
  runtimeItems,
  selections,
  semanticRangeBounds,
  semanticSelections,
  TOTAL_DURATION,
  wordCues,
  type BrollItem,
  type RankingSelection,
  type RankingSelectionId,
  type SelectionId,
  type SourceLine,
  type TimelineSelection,
  type WordCue,
} from './ranking-demo'
import styles from './RankingDemo.module.css'

type DisplayedSourceLine = SourceDisplayEntry<SourceLine>

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress
const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
const outBack = (value: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2)
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

function sceneIndexAt(time: number) {
  const index = baseScenes.findIndex((scene) => time >= scene.start && time < scene.end)
  return index === -1 ? baseScenes.length - 1 : index
}

export function RankingDemo({
  active = true,
  showHeading = true,
  isChinese = false,
  onEnded,
}: {
  active?: boolean
  showHeading?: boolean
  isChinese?: boolean
  onEnded?: () => void
}) {
  const audio = useSyncExternalStore(
    subscribeDemoAudio,
    getDemoAudioSnapshot,
    getDemoAudioServerSnapshot,
  )

  const [pinnedSelection, setPinnedSelection] = useState<SelectionId | null>(null)
  const [sourceFollowEnabled, setSourceFollowEnabled] = useState(true)
  const [sourceViewportRows, setSourceViewportRows] = useState(27)
  const [sourceLineRows, setSourceLineRows] = useState<number[]>(() => lines.map(() => 1))
  const [rangeGeometry, setRangeGeometry] = useState<Record<string, { path: string; depth: number }>>({})
  const [rangeCanvas, setRangeCanvas] = useState({ width: 0, height: 0 })
  const [activeWord, setActiveWord] = useState<WordCue | null>(null)
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0)
  const [activeBroll, setActiveBroll] = useState<BrollItem | null>(null)
  const [activeRankingSelection, setActiveRankingSelection] = useState<RankingSelection>(selections[0])
  const [automaticSourceSelections, setAutomaticSourceSelections] = useState<TimelineSelection[]>([
    selections[0],
  ])
  const [activeRuntimeItem, setActiveRuntimeItem] = useState<RankingSelection | null>(null)
  const [settledIds, setSettledIds] = useState<Set<RankingSelectionId>>(() => new Set())

  const stageElement = useRef<HTMLDivElement | null>(null)
  const sourcePanelElement = useRef<HTMLDivElement | null>(null)
  const codeScrollElement = useRef<HTMLDivElement | null>(null)
  const sourceMeasureElement = useRef<HTMLDivElement | null>(null)
  const activeIconElement = useRef<HTMLDivElement | null>(null)
  const playheadElement = useRef<HTMLElement | null>(null)
  const rankCells = useRef<Array<HTMLElement | undefined>>([])
  const rankTargets = useRef<Array<{ x: number; y: number; size: number } | undefined>>([])
  const baseVideos = useRef<HTMLVideoElement[]>([])

  // Per-frame playback bookkeeping: refs, not state, so the rAF loop never
  // triggers a React render.
  const pinnedLoopSelection = useRef<SelectionId | null>(null)
  const animationFrame = useRef(0)
  const previousTimestamp = useRef(0)
  const programTime = useRef(0)
  const playbackSceneIndex = useRef(-1)
  const completedPass = useRef(false)

  const audioRef = useRef(audio)
  audioRef.current = audio
  const activeRef = useRef(active)
  activeRef.current = active
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  const pinnedRef = useRef(pinnedSelection)
  pinnedRef.current = pinnedSelection

  const stateRef = useRef({
    currentSceneIndex,
    activeBroll,
    activeRankingSelection,
    activeRuntimeItem,
    activeWord,
    automaticSourceSelections,
    settledIds,
  })
  stateRef.current = {
    currentSceneIndex,
    activeBroll,
    activeRankingSelection,
    activeRuntimeItem,
    activeWord,
    automaticSourceSelections,
    settledIds,
  }

  const resolvedSelection = useMemo<RankingSelection>(() => {
    if (pinnedSelection) {
      const pinnedRanking = selections.find((item) => item.id === pinnedSelection)
      if (pinnedRanking) return pinnedRanking
    }
    return activeRankingSelection
  }, [pinnedSelection, activeRankingSelection])

  const resolvedBrollSelection = useMemo<BrollItem | null>(() => {
    if (pinnedSelection) {
      const pinned = brollItems.find((item) => item.id === pinnedSelection)
      if (pinned) return pinned
    }
    return activeBroll
  }, [pinnedSelection, activeBroll])

  const activeSourceSelections = useMemo<TimelineSelection[]>(() => {
    if (!pinnedSelection) return automaticSourceSelections
    return [resolvedSelection, ...(resolvedBrollSelection ? [resolvedBrollSelection] : [])]
  }, [pinnedSelection, automaticSourceSelections, resolvedSelection, resolvedBrollSelection])

  const automaticScriptLineIndex = useMemo(() => {
    const wordIndex = activeWord?.index
    if (wordIndex !== undefined) {
      const lineIndex = lines.findIndex(
        (line) => line.tokens && wordIndex >= line.tokens[0] && wordIndex < line.tokens[1],
      )
      if (lineIndex >= 0) return lineIndex
    }
    return semanticRangeBounds.find((range) => range.id === activeRankingSelection.id)?.start ?? 0
  }, [activeWord, activeRankingSelection])

  const automaticBindingLineIndex = useMemo(() => {
    const selectionId = activeBroll?.id ?? activeRankingSelection.id
    const block = activeBroll ? brollBlock : rankingBlock
    const lineIndex = lines.findIndex(
      (line, index) => index >= block.start && index <= block.end && line.selection === selectionId,
    )
    return lineIndex >= 0 ? lineIndex : block.start
  }, [activeBroll, activeRankingSelection])

  const displayedLines = useMemo<DisplayedSourceLine[]>(() => {
    if (!sourceFollowEnabled) return buildFullSourceView(lines)
    const sideRows = Math.max(3, Math.floor((sourceViewportRows - 1) / 2))
    const activeRanges = activeSourceSelections
      .map((selection) => semanticRangeBounds.find((range) => range.id === selection.id))
      .filter((range): range is (typeof semanticRangeBounds)[number] => range !== undefined)
      .sort((left, right) => left.depth - right.depth)
    return buildFoldedSourceView({
      lines,
      rowSpans: sourceLineRows,
      rowBudget: sideRows,
      topRanges: activeRanges,
      topFocus: automaticScriptLineIndex,
      bottomLine: automaticBindingLineIndex,
    })
  }, [
    sourceFollowEnabled,
    sourceViewportRows,
    activeSourceSelections,
    sourceLineRows,
    automaticScriptLineIndex,
    automaticBindingLineIndex,
  ])

  const activeCaptionWords = useMemo(() => {
    if (!activeWord) return []
    const segmentStart = activeWord.index < 42 ? 0 : activeWord.index < 89 ? 42 : 89
    const segmentEnd = activeWord.index < 42 ? 42 : activeWord.index < 89 ? 89 : 135
    const cueStart = segmentStart + Math.floor((activeWord.index - segmentStart) / 3) * 3
    return wordCues.slice(cueStart, Math.min(cueStart + 3, segmentEnd))
  }, [activeWord])

  const renderedLineHtml = useCallback(
    (index: number) => {
      let html = decoratedLines[index]
      if (activeWord) {
        html = html.replace(
          `class="script-word" data-word-index="${activeWord.index}"`,
          `class="script-word active" data-word-index="${activeWord.index}"`,
        )
      }
      for (const selection of activeSourceSelections) {
        const depth = semanticRangeBounds.find((range) => range.id === selection.id)?.depth ?? 0
        html = html.replaceAll(
          `semantic-token" data-selection="${selection.id}"`,
          `semantic-token semantic-active semantic-depth-${depth}" data-selection="${selection.id}"`,
        )
      }
      return html
    },
    [activeWord, activeSourceSelections],
  )

  const bindingDepth = useCallback(
    (line: SourceLine) => {
      if (
        !line.selection ||
        !activeSourceSelections.some((selection) => selection.id === line.selection)
      ) {
        return -1
      }
      return semanticRangeBounds.find((range) => range.id === line.selection)?.depth ?? 0
    },
    [activeSourceSelections],
  )

  const updateRangeGeometry = useCallback(() => {
    const container = codeScrollElement.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const width = container.clientWidth
    const scaleX = container.offsetWidth ? containerRect.width / container.offsetWidth : 1
    const scaleY = container.offsetHeight ? containerRect.height / container.offsetHeight : 1
    const renderedLines = Array.from(container.querySelectorAll<HTMLElement>(':scope > .code-line'))
    const lastRenderedLine = renderedLines.at(-1)
    const paddingBottom = Number.parseFloat(getComputedStyle(container).paddingBottom) || 0
    const contentHeight = lastRenderedLine
      ? lastRenderedLine.offsetTop + lastRenderedLine.offsetHeight + paddingBottom
      : container.clientHeight
    const height = Math.max(container.clientHeight, contentHeight)
    const geometry: Record<string, { path: string; depth: number }> = {}
    const markers = Array.from(container.querySelectorAll<HTMLElement>('.syn-marker[data-selection]'))

    for (const range of semanticRangeBounds) {
      const startMarker = markers.find(
        (marker) =>
          marker.dataset.selection === range.id && marker.textContent?.trim() === `@${range.id}`,
      )
      const endMarker = markers.find(
        (marker) =>
          marker.dataset.selection === range.id &&
          marker.textContent?.trim().startsWith(`@/${range.id}`),
      )
      const startLine = startMarker?.closest<HTMLElement>('.code-line')
      const endLine = endMarker?.closest<HTMLElement>('.code-line')
      if (!startMarker || !endMarker || !startLine || !endLine) continue

      const startFragments = Array.from(startMarker.getClientRects())
      const endFragments = Array.from(endMarker.getClientRects())
      const startRect = startFragments[0] ?? startMarker.getBoundingClientRect()
      const endRect = endFragments.at(-1) ?? endMarker.getBoundingClientRect()
      const inlinePadding = 3
      const edgeOverhang = 3
      const left = 44 - edgeOverhang
      const right = width - 12 + edgeOverhang
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
      const lineHeight = Number.parseFloat(getComputedStyle(startLine).lineHeight) || 26
      const startCenter =
        ((startRect.top + startRect.bottom) / 2 - containerRect.top) / scaleY + container.scrollTop
      const endCenter =
        ((endRect.top + endRect.bottom) / 2 - containerRect.top) / scaleY + container.scrollTop
      const top = startCenter - lineHeight / 2
      const startBottom = startCenter + lineHeight / 2
      const endTop = endCenter - lineHeight / 2
      const bottom = endCenter + lineHeight / 2
      const sameVisualLine = Math.abs(startCenter - endCenter) < lineHeight / 2
      const points = sameVisualLine
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

  const updateRankTargets = useCallback(() => {
    const stageRect = stageElement.current?.getBoundingClientRect()
    if (!stageRect) return
    for (let rank = 1; rank <= 5; rank += 1) {
      const cellRect = rankCells.current[rank]?.getBoundingClientRect()
      if (!cellRect) continue
      rankTargets.current[rank] = {
        x: ((cellRect.left - stageRect.left + cellRect.width / 2) / stageRect.width) * 100,
        y: ((cellRect.top - stageRect.top + cellRect.height / 2) / stageRect.height) * 100,
        size: (cellRect.width / stageRect.width) * 100,
      }
    }
  }, [])

  // Drives the icon that flies from centre stage into its rank slot. Written
  // straight to element style each frame, never through React state.
  const updateContinuousVisuals = useCallback((time: number) => {
    if (playheadElement.current) {
      playheadElement.current.style.left = `${Math.min(100, Math.max(0, (time / TOTAL_DURATION) * 100))}%`
    }
    const item = stateRef.current.activeRuntimeItem
    const icon = activeIconElement.current
    if (!item || !icon) return
    const duration = item.end - item.start
    const elapsed = time - item.start
    const moveStart = Math.max(ENTER_DURATION, duration - MOVE_DURATION)
    let centerX = 66.0185
    let centerY = 73.0208
    let size = 33
    let opacity = 1
    let scale = 1
    let rotate = 0

    if (elapsed < ENTER_DURATION) {
      const phase = outBack(clamp01(elapsed / ENTER_DURATION))
      centerY = lerp(104.6406, 73.0208, phase)
      opacity = Math.min(1, phase * 2.2)
      scale = 0.96 + 0.04 * phase
    } else if (elapsed < moveStart) {
      const idle = (elapsed - ENTER_DURATION) / Math.max(0.001, moveStart - ENTER_DURATION)
      const wave = Math.sin(idle * Math.PI * 2)
      const wave2 = Math.sin(idle * Math.PI * 2 + Math.PI / 2)
      centerY = 73.0208 - 0.09375 * wave
      centerX = 66.0185 + 0.0741 * wave2
      scale = 1.004 + 0.003 * wave2
      rotate = 0.12 * wave
    } else {
      const phase = easeInOutCubic(clamp01((elapsed - moveStart) / MOVE_DURATION))
      const rankIndex = item.rank - 1
      const target = rankTargets.current[item.rank]
      const targetX = target?.x ?? 20.55
      const targetY = target?.y ?? 23.23 + rankIndex * 7.29
      const targetSize = target?.size ?? 8.89
      centerX = lerp(66.0185, targetX, phase)
      centerY = lerp(73.0208, targetY, phase)
      size = lerp(33, targetSize, phase)
      scale = 1 - 0.02 * Math.sin(phase * Math.PI)
    }

    icon.style.left = `${centerX - size / 2}%`
    icon.style.top = `${centerY - (size * 0.5625) / 2}%`
    icon.style.width = `${size}%`
    icon.style.opacity = `${opacity}`
    icon.style.transform = `scale(${scale}) rotate(${rotate}deg)`
  }, [])

  const syncDiscreteState = useCallback((time: number, force = false) => {
    const current = stateRef.current
    const nextSceneIndex = sceneIndexAt(time)
    const sceneChanged = force || current.currentSceneIndex !== nextSceneIndex
    if (sceneChanged) setCurrentSceneIndex(nextSceneIndex)

    const nextBroll = brollItems.find((item) => time >= item.start && time < item.end) ?? null
    if (force || current.activeBroll?.id !== nextBroll?.id) setActiveBroll(nextBroll)

    const nextRanking =
      selections.find((item) => time >= item.start && time < item.end) ??
      selections.find((item) => time < item.start) ??
      selections[selections.length - 1]
    if (force || current.activeRankingSelection.id !== nextRanking.id) {
      setActiveRankingSelection(nextRanking)
    }

    const nextSourceSelections = semanticSelections.filter(
      (item) => time >= item.start && time < item.end,
    )
    const sourceSelectionsChanged =
      nextSourceSelections.length !== current.automaticSourceSelections.length ||
      nextSourceSelections.some(
        (item, index) => item.id !== current.automaticSourceSelections[index]?.id,
      )
    if (force || sourceSelectionsChanged) setAutomaticSourceSelections(nextSourceSelections)

    const nextRuntimeItem = runtimeItems.find((item) => time >= item.start && time < item.end) ?? null
    if (force || current.activeRuntimeItem?.id !== nextRuntimeItem?.id) {
      setActiveRuntimeItem(nextRuntimeItem)
    }

    const nextSettledIds = new Set(
      runtimeItems.filter((item) => time >= item.end).map((item) => item.id),
    )
    const settledChanged =
      nextSettledIds.size !== current.settledIds.size ||
      [...nextSettledIds].some((id) => !current.settledIds.has(id))
    if (force || settledChanged) setSettledIds(nextSettledIds)

    const nextWord = wordAtTime(wordCues, time)
    if (force || current.activeWord?.index !== nextWord?.index) setActiveWord(nextWord)
    return sceneChanged
  }, [])

  const syncBaseVideos = useCallback((force = false) => {
    const activeIndex = sceneIndexAt(programTime.current)
    const scene = baseScenes[activeIndex]
    const localTime = scene.sourceStart + Math.max(0, programTime.current - scene.start)
    const sceneChanged = playbackSceneIndex.current !== activeIndex

    baseVideos.current.forEach((video, index) => {
      if (!video) return
      video.muted = !audioRef.current.playbackEnabled || index !== activeIndex
      if (index !== activeIndex) {
        video.pause()
        return
      }
      if (force || sceneChanged) video.currentTime = localTime
      if (activeRef.current && video.paused) void video.play().catch(() => undefined)
    })
    playbackSceneIndex.current = activeIndex
  }, [])

  const clearInspection = useCallback(() => {
    setPinnedSelection(null)
    pinnedLoopSelection.current = null
  }, [])

  const seekTo = useCallback(
    (selection: TimelineSelection) => {
      setPinnedSelection(selection.id)
      const selectedBounds = semanticRangeBounds.find((range) => range.id === selection.id)
      const outermostBounds = selectedBounds
        ? semanticRangeBounds
            .filter(
              (range) => range.start <= selectedBounds.start && range.end >= selectedBounds.end,
            )
            .sort((left, right) => left.depth - right.depth)[0]
        : undefined
      pinnedLoopSelection.current = outermostBounds?.id ?? selection.id
      programTime.current = selection.start
      previousTimestamp.current = 0
      syncDiscreteState(programTime.current, true)
      syncBaseVideos(true)
      updateContinuousVisuals(programTime.current)
    },
    [syncDiscreteState, syncBaseVideos, updateContinuousVisuals],
  )

  const selectRange = useCallback(
    (selection: TimelineSelection) => {
      if (pinnedRef.current === selection.id) return
      seekTo(selection)
    },
    [seekTo],
  )

  const inspectToken = useCallback(
    (event: React.SyntheticEvent) => {
      const element =
        event.target instanceof Element ? event.target.closest<HTMLElement>('[data-selection]') : null
      const id = element?.dataset.selection as SelectionId | undefined
      if (!id) return
      const selection = semanticSelections.find((item) => item.id === id)
      if (selection) selectRange(selection)
    },
    [selectRange],
  )

  const inspectLine = useCallback(
    (line: SourceLine) => {
      const id = line.range ?? line.selection
      if (!id) {
        clearInspection()
        return
      }
      const selection = semanticSelections.find((item) => item.id === id)
      if (selection) selectRange(selection)
    },
    [clearInspection, selectRange],
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
    if (measuredRows.length !== lines.length) return
    setSourceLineRows((previous) =>
      measuredRows.some((rowSpan, index) => rowSpan !== previous[index]) ? measuredRows : previous,
    )
  }, [])

  const updateLayoutGeometry = useCallback(() => {
    updateSourceViewportRows()
    updateRankTargets()
    updateRangeGeometry()
  }, [updateSourceViewportRows, updateRankTargets, updateRangeGeometry])

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
      const scene = baseScenes[sceneIndex]
      const video = baseVideos.current[sceneIndex]
      let nextTime =
        video && !video.paused && video.readyState >= 2
          ? scene.start + video.currentTime - scene.sourceStart
          : programTime.current + delta
      let looped = false
      if (pinnedLoopSelection.current) {
        const selection = semanticSelections.find(
          (candidate) => candidate.id === pinnedLoopSelection.current,
        )
        if (selection && nextTime >= selection.end) {
          nextTime = selection.start
          looped = true
        }
      } else if (nextTime >= TOTAL_DURATION) {
        if (!completedPass.current) {
          completedPass.current = true
          onEndedRef.current?.()
        }
        nextTime = 0
        looped = true
      }
      programTime.current = nextTime
      const sceneChanged = syncDiscreteState(programTime.current, looped)
      if (looped || sceneChanged) syncBaseVideos(true)
      updateContinuousVisuals(programTime.current)
      animationFrame.current = requestAnimationFrame(renderFrame)
    },
    [syncDiscreteState, syncBaseVideos, updateContinuousVisuals],
  )

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(animationFrame.current)
    animationFrame.current = 0
    previousTimestamp.current = 0
    baseVideos.current.forEach((video) => video?.pause())
  }, [])

  const startPlayback = useCallback(() => {
    stopPlayback()
    programTime.current = 0
    playbackSceneIndex.current = -1
    completedPass.current = false
    setPinnedSelection(null)
    pinnedLoopSelection.current = null
    syncDiscreteState(programTime.current, true)
    syncBaseVideos(true)
    updateContinuousVisuals(programTime.current)

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
    syncDiscreteState,
    syncBaseVideos,
    updateContinuousVisuals,
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

  useEffect(() => {
    initializeDemoAudio()
    const onEnable = (event: Event) => enableAudio(event)
    window.addEventListener('pointerdown', onEnable, { capture: true, once: true })
    window.addEventListener('keydown', onEnable, { capture: true, once: true })
    window.addEventListener('resize', updateLayoutGeometry)
    if (navigator.userActivation?.hasBeenActive) enableAudio()

    syncDiscreteState(0, true)
    updateLayoutGeometry()

    let rangeResizeObserver: ResizeObserver | null = null
    let rangeMutationObserver: MutationObserver | null = null
    if (codeScrollElement.current) {
      rangeResizeObserver = new ResizeObserver(updateLayoutGeometry)
      rangeResizeObserver.observe(codeScrollElement.current)
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
      rangeResizeObserver?.disconnect()
      rangeMutationObserver?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (active) startPlayback()
    else stopPlayback()
  }, [active, startPlayback, stopPlayback])

  // The flying icon mounts and unmounts as runtime items change; reposition it
  // immediately so it never paints one frame at a stale spot.
  useLayoutEffect(() => {
    updateContinuousVisuals(programTime.current)
  }, [activeRuntimeItem, updateContinuousVisuals])

  const displayKey = displayedLines.map((entry) => entry.key).join('|')
  useLayoutEffect(() => {
    updateSourceViewportRows()
    updateLayoutGeometry()
    const frame = requestAnimationFrame(updateLayoutGeometry)
    return () => cancelAnimationFrame(frame)
  }, [
    displayKey,
    sourceFollowEnabled,
    activeSourceSelections,
    updateSourceViewportRows,
    updateLayoutGeometry,
  ])

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
      className="svml-demo"
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

      <div
        className="demo-shell real-demo-shell"
        onPointerMove={(event) => {
          if (!usesHoverRef.current) return
          const target = event.target instanceof Element ? event.target : null
          if (!target?.closest('.source-panel')) resumeSourceFollow()
        }}
        onMouseLeave={() => {
          if (usesHoverRef.current) clearInspection()
        }}
      >
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
                {activeSourceSelections.map((selection) => (
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
            <div
              ref={stageElement}
              className={`${styles.stage} live-ranking-stage`}
              aria-label="Ranking Track live render"
            >
              <div className="live-base-layer">
                {baseScenes.map((scene, index) => (
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

              <div className={styles.title}>
                RANKING AI PHOTO APPS FOR GUYS
                <br />
                WITH NO GOOD PICS
              </div>

              <div className={styles.board}>
                {[1, 2, 3, 4, 5].map((rank) => {
                  const item = runtimeItems[5 - rank]
                  return (
                    <div key={rank} className={styles.rankRow}>
                      <strong style={{ background: item.color }}>{rank}</strong>
                      <span
                        ref={(element) => {
                          if (element) rankCells.current[rank] = element
                        }}
                        className={`${styles.rankCell}${
                          !activeRuntimeItem && resolvedSelection.id === item.id
                            ? ` ${styles.selected}`
                            : ''
                        }`}
                      >
                        {settledIds.has(item.id) && (
                          <img src={resolveDemoMedia(item.icon)} alt={item.label} />
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>

              {activeRuntimeItem && (
                <div
                  ref={activeIconElement}
                  className={`${styles.activeIcon}${
                    resolvedSelection.id === activeRuntimeItem.id ? ` ${styles.selected}` : ''
                  }`}
                >
                  <img
                    src={resolveDemoMedia(activeRuntimeItem.icon)}
                    alt={activeRuntimeItem.label}
                  />
                  <i />
                </div>
              )}

              {activeBroll && (
                <img
                  className={`${styles.broll}${
                    activeSourceSelections.some((selection) => selection.id === activeBroll.id)
                      ? ` ${styles.brollSelected}`
                      : ''
                  }`}
                  src={resolveDemoMedia(activeBroll.src)}
                  alt=""
                  style={{ transform: `scale(${activeBroll.zoom})` }}
                />
              )}

              {activeCaptionWords.length > 0 && (
                <div className={styles.caption} aria-hidden="true">
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
                    ? audio.enabled
                      ? '静音'
                      : '取消静音'
                    : audio.enabled
                      ? 'Mute'
                      : 'Unmute'
                }
                title={
                  isChinese
                    ? audio.enabled
                      ? '静音'
                      : '取消静音'
                    : audio.enabled
                      ? 'Mute'
                      : 'Unmute'
                }
                onClick={(event) => {
                  event.stopPropagation()
                  toggleDemoAudio()
                  syncBaseVideos()
                }}
              >
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
              <div className="timeline-labels ranking-labels">
                {selections.map((selection) => (
                  <button
                    key={selection.id}
                    type="button"
                    className={resolvedSelection.id === selection.id ? 'current' : undefined}
                    style={{ flexGrow: selection.end - selection.start }}
                    onClick={() => seekTo(selection)}
                  >
                    @{selection.id}
                  </button>
                ))}
              </div>
              <div className={`${styles.progressTrack} timeline-track`}>
                {selections.map((selection) => (
                  <span
                    key={selection.id}
                    className={`${styles.segment}${
                      resolvedSelection.id === selection.id ? ` ${styles.segmentActive}` : ''
                    }`}
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
