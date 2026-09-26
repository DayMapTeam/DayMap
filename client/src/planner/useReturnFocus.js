import { useEffect } from 'react'

/**
 * On unmount, put focus back on the control that opened this surface. When
 * that control was replaced or removed while the surface was open, focus the
 * first element that matches one of the fallback selectors, tried in order.
 * Call it before any effect that moves focus into the surface.
 *
 * @param {string} fallbackSelectors Selectors separated by " || ", e.g. "#a || .b".
 */
export function useReturnFocus(fallbackSelectors) {
  useEffect(() => {
    const trigger = document.activeElement
    return () => {
      const usable = trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected
      const target = usable
        ? trigger
        : fallbackSelectors.split(' || ').map((selector) => document.querySelector(selector)).find(Boolean)
      target?.focus({ preventScroll: true })
    }
  }, [fallbackSelectors])
}
