import { useCallback, useEffect, useRef, useState } from 'react'
import { nextAnnouncement } from './navigation.js'

const KEY = 'daymap:voice-muted'

function readMuted() {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function speak(text) {
  const synth = globalThis.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1
  synth.speak(utterance)
}

/**
 * Spoken turn-by-turn guidance, like a sat-nav, through the browser's speech
 * synthesis. Each announcement is said once per route; a new route (after
 * leaving it) keeps what was already said about starting. Mute is remembered
 * on this device.
 *
 * @param {object} input
 * @param {object | null} input.route
 * @param {object | null} input.progress
 * @param {string | null} input.destination The stop's title while navigating, or null.
 * @param {{ kind: string, key: number } | null} input.notice The trip's latest notice, for "You have arrived".
 */
export function useVoiceGuidance({ route, progress, destination, notice }) {
  const supported = typeof globalThis.speechSynthesis !== 'undefined'
  const [muted, setMuted] = useState(readMuted)
  const spokenRef = useRef(new Set())
  const routeRef = useRef(null)

  useEffect(() => {
    if (!destination) {
      spokenRef.current = new Set()
      routeRef.current = null
      return
    }
    if (route && route !== routeRef.current) {
      const started = spokenRef.current.has('start')
      spokenRef.current = new Set(started ? ['start'] : [])
      routeRef.current = route
    }
    const next = nextAnnouncement(route, progress, spokenRef.current, destination)
    if (!next) return
    spokenRef.current.add(next.key)
    if (!muted) speak(next.text)
  }, [route, progress, destination, muted])

  const arrivedKey = notice?.kind === 'arrived' ? notice.key : null
  const arrivedAt = notice?.kind === 'arrived' ? notice.title : null
  useEffect(() => {
    if (arrivedKey !== null && arrivedAt && !muted) speak(`You have arrived at ${arrivedAt}.`)
  }, [arrivedKey, arrivedAt, muted])

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current
      try {
        globalThis.localStorage?.setItem(KEY, next ? '1' : '0')
      } catch {
        // Not remembered; still applies now.
      }
      if (next) globalThis.speechSynthesis?.cancel()
      return next
    })
  }, [])

  return { supported, muted, toggleMuted }
}
