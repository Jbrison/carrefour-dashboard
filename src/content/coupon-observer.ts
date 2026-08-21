export function observeCouponChanges(onChange: () => void, debounceMs = 500): () => void {
  let timeout: number | undefined

  const schedule = (): void => {
    if (timeout !== undefined) window.clearTimeout(timeout)
    timeout = window.setTimeout(onChange, debounceMs)
  }

  const observer = new MutationObserver((mutations) => {
    const hasRelevantChange = mutations.some((mutation) => mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
    if (hasRelevantChange) schedule()
  })

  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    if (timeout !== undefined) window.clearTimeout(timeout)
    observer.disconnect()
  }
}
