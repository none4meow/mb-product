import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkForServiceWorkerUpdate,
  registerControllerChangeReload,
  SERVICE_WORKER_UPDATE_INTERVAL_MS,
  setupServiceWorkerAutoRefresh,
} from './pwa'

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(),
}))

function flushMicrotasks() {
  return new Promise<void>((resolve) => {
    queueMicrotask(() => resolve())
  })
}

describe('pwa helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('skips update checks while offline', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const registration = {
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    }

    await expect(
      checkForServiceWorkerUpdate('/sw.js', registration, {
        fetchImpl,
        navigatorLike: { onLine: false },
      }),
    ).resolves.toBe(false)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(registration.update).not.toHaveBeenCalled()
  })

  it('fetches the service worker with no-store before updating', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', {
        status: 200,
      }),
    )
    const registration = {
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    }

    await expect(
      checkForServiceWorkerUpdate('/sw.js', registration, {
        fetchImpl,
        navigatorLike: { onLine: true },
      }),
    ).resolves.toBe(true)

    expect(fetchImpl).toHaveBeenCalledWith('/sw.js', {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache',
      },
    })
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('runs periodic, visibility, and focus update checks with the configured interval', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', {
        status: 200,
      }),
    )
    const registration = {
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    }

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    const cleanup = setupServiceWorkerAutoRefresh('/sw.js', registration, {
      fetchImpl,
      navigatorLike: { onLine: true },
      updateIntervalMs: 1_000,
    })

    await flushMicrotasks()
    expect(registration.update).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1_000)
    await flushMicrotasks()
    expect(registration.update).toHaveBeenCalledTimes(2)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushMicrotasks()
    expect(registration.update).toHaveBeenCalledTimes(2)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushMicrotasks()
    expect(registration.update).toHaveBeenCalledTimes(3)

    window.dispatchEvent(new Event('focus'))
    await flushMicrotasks()
    expect(registration.update).toHaveBeenCalledTimes(4)

    window.dispatchEvent(new Event('pageshow'))
    await flushMicrotasks()
    expect(registration.update).toHaveBeenCalledTimes(5)

    cleanup()

    vi.advanceTimersByTime(SERVICE_WORKER_UPDATE_INTERVAL_MS)
    await flushMicrotasks()
    expect(registration.update).toHaveBeenCalledTimes(5)
  })

  it('reloads only once when the controlling service worker changes', () => {
    const serviceWorkerContainer = new EventTarget() as ServiceWorkerContainer
    const locationLike = {
      reload: vi.fn(),
    }

    const cleanup = registerControllerChangeReload({
      serviceWorkerContainer,
      locationLike,
    })

    serviceWorkerContainer.dispatchEvent(new Event('controllerchange'))
    serviceWorkerContainer.dispatchEvent(new Event('controllerchange'))

    expect(locationLike.reload).toHaveBeenCalledTimes(1)

    cleanup()
  })
})
