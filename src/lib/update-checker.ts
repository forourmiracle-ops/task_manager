const GITHUB_REPO = 'forourmiracle-ops/task_manager'
const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000
const LAST_CHECK_KEY = 'taskflow-update-last-check'
const LAST_STATUS_KEY = 'taskflow-update-last-status'

interface UpdateStatus {
  hasUpdate: boolean
  latestSha: string
  currentSha: string
  status: 'latest' | 'error' | 'unknown'
  unavailableReason?: 'missing-build-info' | 'network'
}

let cachedStatus: UpdateStatus | null = null

export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    const lastCheck = localStorage.getItem(LAST_CHECK_KEY)
    if (lastCheck && Date.now() - Number(lastCheck) < CHECK_INTERVAL_MS) {
      if (cachedStatus) return cachedStatus
      const storedStatus = localStorage.getItem(LAST_STATUS_KEY)
      if (storedStatus) {
        try {
          cachedStatus = JSON.parse(storedStatus) as UpdateStatus
          return cachedStatus
        } catch {
          localStorage.removeItem(LAST_STATUS_KEY)
        }
      }
      return { hasUpdate: false, latestSha: '', currentSha: '', status: 'error', unavailableReason: 'missing-build-info' }
    }

    const currentSha = import.meta.env.VITE_COMMIT_SHA || ''
    if (!currentSha) {
      console.warn('[UpdateChecker] No VITE_COMMIT_SHA defined at build time')
      return { hasUpdate: false, latestSha: '', currentSha: '', status: 'error', unavailableReason: 'missing-build-info' }
    }

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/commits/master`,
      { headers: { Accept: 'application/vnd.github.v3+json' } },
    )
    if (!response.ok) {
      console.warn('[UpdateChecker] GitHub API returned', response.status)
      return { hasUpdate: false, latestSha: '', currentSha, status: 'error', unavailableReason: 'network' }
    }

    const data = await response.json()
    const latestSha = (data.sha || '').slice(0, 7)
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))
    cachedStatus = {
      hasUpdate: latestSha !== currentSha && latestSha !== '',
      latestSha,
      currentSha,
      status: latestSha === currentSha ? 'latest' : 'unknown',
    }
    localStorage.setItem(LAST_STATUS_KEY, JSON.stringify(cachedStatus))
    return cachedStatus
  } catch (err) {
    console.warn('[UpdateChecker] Failed to check for updates:', err)
    return { hasUpdate: false, latestSha: '', currentSha: '', status: 'error', unavailableReason: 'network' }
  }
}

export function clearUpdateCache(): void {
  localStorage.removeItem(LAST_CHECK_KEY)
  localStorage.removeItem(LAST_STATUS_KEY)
  cachedStatus = null
}
