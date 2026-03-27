"use client"

export function replaceUrl(url: string) {
  window.history.replaceState(null, "", url)
}
