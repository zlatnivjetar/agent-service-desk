"use client"

import { useEffect } from "react"

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return
    }

    if (!("serviceWorker" in navigator)) {
      return
    }

    const register = () => {
      void navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
      })
    }

    window.addEventListener("load", register, { once: true })

    return () => {
      window.removeEventListener("load", register)
    }
  }, [])

  return null
}
