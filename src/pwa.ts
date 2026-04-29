import { registerSW } from 'virtual:pwa-register'

export const SERVICE_WORKER_UPDATE_INTERVAL_MS = 5 * 60 * 1000

type ServiceWorkerRegistrationLike = Pick<ServiceWorkerRegistration, 'update'> & {
  installing?: ServiceWorker | null
}

type OnlineState = Pick<Navigator, 'onLine'>

type UpdateCheckDependencies = {
  fetchImpl?: typeof fetch
  navigatorLike?: OnlineState
}

type AutoRefreshDependencies = UpdateCheckDependencies & {
  documentLike?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  windowLike?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>
  updateIntervalMs?: number
}

type ControllerReloadDependencies = {
  serviceWorkerContainer?: Pick<ServiceWorkerContainer, 'addEventListener' | 'removeEventListener'>
  locationLike?: Pick<Location, 'reload'>
}

export async function checkForServiceWorkerUpdate(
  swUrl: string,
  registration: ServiceWorkerRegistrationLike | undefined,
  {
    fetchImpl = fetch,
    navigatorLike = navigator,
  }: UpdateCheckDependencies = {},
) {
  if (!registration || registration.installing || navigatorLike.onLine === false) {
    return false
  }

  const response = await fetchImpl(swUrl, {
    cache: 'no-store',
    headers: {
      'cache-control': 'no-cache',
    },
  })

  if (!response.ok) {
    return false
  }

  await registration.update()
  return true
}

export function setupServiceWorkerAutoRefresh(
  swUrl: string,
  registration: ServiceWorkerRegistrationLike,
  {
    fetchImpl = fetch,
    navigatorLike = navigator,
    documentLike = document,
    windowLike = window,
    updateIntervalMs = SERVICE_WORKER_UPDATE_INTERVAL_MS,
  }: AutoRefreshDependencies = {},
) {
  const runUpdateCheck = () => {
    void checkForServiceWorkerUpdate(swUrl, registration, {
      fetchImpl,
      navigatorLike,
    })
  }

  const handleVisibilityChange = () => {
    if (documentLike.visibilityState === 'visible') {
      runUpdateCheck()
    }
  }

  const intervalId = windowLike.setInterval(runUpdateCheck, updateIntervalMs)

  documentLike.addEventListener('visibilitychange', handleVisibilityChange)
  windowLike.addEventListener('focus', runUpdateCheck)
  windowLike.addEventListener('pageshow', runUpdateCheck)

  runUpdateCheck()

  return () => {
    windowLike.clearInterval(intervalId)
    documentLike.removeEventListener('visibilitychange', handleVisibilityChange)
    windowLike.removeEventListener('focus', runUpdateCheck)
    windowLike.removeEventListener('pageshow', runUpdateCheck)
  }
}

export function registerControllerChangeReload({
  serviceWorkerContainer = navigator.serviceWorker,
  locationLike = window.location,
}: ControllerReloadDependencies = {}) {
  if (!serviceWorkerContainer) {
    return () => {}
  }

  let hasReloaded = false

  const handleControllerChange = () => {
    if (hasReloaded) {
      return
    }

    hasReloaded = true
    locationLike.reload()
  }

  serviceWorkerContainer.addEventListener('controllerchange', handleControllerChange)

  return () => {
    serviceWorkerContainer.removeEventListener('controllerchange', handleControllerChange)
  }
}

export function registerProductionPwa() {
  const cleanups: Array<() => void> = [registerControllerChangeReload()]

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) {
        return
      }

      cleanups.push(setupServiceWorkerAutoRefresh(swUrl, registration))
    },
    onRegisterError(error) {
      console.error('Service worker registration failed.', error)
    },
  })

  return () => {
    while (cleanups.length > 0) {
      cleanups.pop()?.()
    }
  }
}
