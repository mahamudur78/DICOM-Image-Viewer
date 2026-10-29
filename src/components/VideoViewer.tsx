import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DisplaySet } from '../dicom/types'
import { readDicomVideo, type DicomVideo } from '../video/dicomVideo'
import { videoControllers } from '../video/videoControllers'
import { ViewportFrame } from './ViewportFrame'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]

interface VideoViewerProps {
  viewportId: string
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
  onToggleMaximize: () => void
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; video: DicomVideo; url?: string }

const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Plays a DICOM video (MPEG-4 / H.264) with frame stepping, speed and loop controls. */
export default function VideoViewer({ viewportId, displaySet, active, onActivate, onToggleMaximize }: VideoViewerProps) {
  const { t } = useTranslation()
  const { series, study } = displaySet
  const file = series.images[0].file
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<State>({ status: 'loading' })
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const [cannotPlay, setCannotPlay] = useState(false)
  const frameRate = series.frameRate ?? 25

  useEffect(() => {
    let url: string | undefined
    let cancelled = false
    readDicomVideo(file, series.frameRate)
      .then((video) => {
        if (cancelled) return
        if (video.playable) url = URL.createObjectURL(video.blob)
        setState({ status: 'ready', video, url })
      })
      .catch((error: unknown) => !cancelled && setState({ status: 'error', message: String(error) }))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [file, series.frameRate])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const controller = {
      toggle: () => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) void video.play()
        else video.pause()
      },
      step: (frames: number) => {
        const video = videoRef.current
        if (!video) return
        video.pause()
        video.currentTime = Math.min(video.duration || 0, Math.max(0, video.currentTime + frames / frameRate))
      },
      changeSpeed: (direction: 1 | -1) =>
        setSpeed((current) => SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, SPEEDS.indexOf(current) + direction))]),
    }
    videoControllers.set(viewportId, controller)
    return () => {
      videoControllers.delete(viewportId)
    }
  }, [viewportId, frameRate])

  const controller = videoControllers.get(viewportId)
  const ready = state.status === 'ready' && state.video.playable && !cannotPlay
  const stream = state.status === 'ready' && !state.video.playable ? state.video : null
  const baseName = (series.description || 'video').replace(/[^\w.-]+/g, '_')

  return (
    <ViewportFrame viewportId={viewportId} kind="video" active={active} onActivate={onActivate} onToggleMaximize={onToggleMaximize}>
      <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[60%] font-mono text-[11px] text-slate-100 [text-shadow:0_1px_2px_#000] sm:text-xs">
        <div className="truncate font-semibold">{study.patientName || t('viewport.anonymous')}</div>
        <div className="truncate">{series.description}</div>
      </div>

      <div className="relative grid min-h-0 flex-1 place-items-center bg-black">
        {state.status === 'loading' && <p className="text-sm text-slate-400">{t('video.preparing')}</p>}
        {state.status === 'error' && <p className="p-4 text-center text-sm text-red-300">{t('video.failed', { error: state.message })}</p>}
        {state.status === 'ready' && state.url && !cannotPlay && (
          <video
            ref={videoRef}
            src={state.url}
            loop={loop}
            playsInline
            muted
            aria-label={t('video.label')}
            className="h-full w-full object-contain"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => {
              setDuration(event.currentTarget.duration)
              event.currentTarget.playbackRate = speed
            }}
            onError={() => setCannotPlay(true)}
            onClick={() => controller?.toggle()}
          />
        )}
        {(stream || cannotPlay) && (
          <div className="max-w-sm p-4 text-center text-sm text-slate-300">
            <p>{t('video.unsupported', { codec: (stream?.codec ?? 'h264').toUpperCase() })}</p>
            <button
              className="mt-3 rounded-md bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500"
              onClick={() => {
                if (stream) download(stream.stream, `${baseName}.${stream.extension}`)
                else if (state.status === 'ready' && state.video.playable) download(state.video.blob, `${baseName}.mp4`)
              }}
            >
              {t('video.download')}
            </button>
          </div>
        )}
      </div>

      {ready && (
        <div className="flex flex-wrap items-center gap-1 border-t border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200">
          <button className="rounded px-2 py-1 hover:bg-slate-800" aria-label={playing ? t('cine.pause') : t('cine.play')} onClick={() => controller?.toggle()}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="rounded px-1.5 py-1 hover:bg-slate-800" aria-label={t('video.previousFrame')} title={`${t('video.previousFrame')} (←)`} onClick={() => controller?.step(-1)}>
            ⏮
          </button>
          <button className="rounded px-1.5 py-1 hover:bg-slate-800" aria-label={t('video.nextFrame')} title={`${t('video.nextFrame')} (→)`} onClick={() => controller?.step(1)}>
            ⏭
          </button>
          <input
            type="range"
            aria-label={t('video.position')}
            min={0}
            max={duration || 0}
            step={1 / frameRate}
            value={time}
            onChange={(event) => {
              if (videoRef.current) videoRef.current.currentTime = Number(event.target.value)
            }}
            className="min-w-24 flex-1 accent-sky-500"
          />
          <span className="tabular-nums text-slate-400">
            {formatTime(time)} / {formatTime(duration)}
          </span>
          <select
            aria-label={t('video.speed')}
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5"
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
          <button className={`rounded px-1.5 py-1 ${loop ? 'bg-sky-600 text-white' : 'hover:bg-slate-800'}`} aria-label={t('cine.loop')} aria-pressed={loop} onClick={() => setLoop(!loop)}>
            ⟳
          </button>
          <button
            className="rounded px-1.5 py-1 hover:bg-slate-800"
            aria-label={t('video.download')}
            onClick={() => state.status === 'ready' && state.video.playable && download(state.video.blob, `${baseName}.mp4`)}
          >
            ⤓
          </button>
        </div>
      )}
    </ViewportFrame>
  )
}
