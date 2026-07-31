const GITHUB_REPO = 'forourmiracle-ops/task_manager'
const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000 // 2 hours
const LAST_CHECK_KEY = 'taskflow-update-last-check'

interface UpdateStatus {
  hasUpdate: boolean
  latestSha: string
  currentSha: string
}

let cachedStatus: UpdateStatus | null = null

export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    // Rate limit: skip if checked within last 2 hours
    const lastCheck = localStorage.getItem(LAST_CHECK_KEY)
    if (lastCheck && Date.now() - Number(lastCheck) < CHECK_INTERVAL_MS) {
      return cachedStatus ?? { hasUpdate: false, latestSha: '', currentSha: '' }
    }

    const currentSha = (import.meta as any).env?.VITE_COMMIT_SHA || ''
    if (!currentSha) {
      console.warn('[UpdateChecker] No VITE_COMMIT_SHA defined at build time')
      return { hasUpdate: false, latestSha: '', currentSha: '' }
    }

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/commits/master`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (!response.ok) {
      console.warn('[UpdateChecker] GitHub API returned', response.status)
      return { hasUpdate: false, latestSha: '', currentSha }
    }

    const data = await response.json()
    const latestSha = (data.sha || '').slice(0, 7)

    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))

    cachedStatus = {
      hasUpdate: latestSha !== currentSha && latestSha !== '',
      latestSha,
      currentSha,
    }

    return cachedStatus
  } catch (err) {
    console.warn('[UpdateChecker] Failed to check for updates:', err)
    return { hasUpdate: false, latestSha: '', currentSha: '' }
  }
}

export function clearUpdateCache(): void {
  localStorage.removeItem(LAST_CHECK_KEY)
  cachedStatus = null
}