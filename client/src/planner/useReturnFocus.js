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
      const visible = (element) => element instanceof HTMLElement && element.isConnected &&
        !element.closest('[hidden], [inert]') && element.getClientRects().length > 0
      const usable = trigger !== document.body && visible(trigger)
      const target = usable
        ? trigger
        : fallbackSelectors.split(' || ').map((selector) => document.querySelector(selector)).find(visible)
      target?.focus({ preventScroll: true })
    }
  }, [fallbackSelectors])
}
