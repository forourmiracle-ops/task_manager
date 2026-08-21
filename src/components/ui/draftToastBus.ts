export interface DraftToastData {
  message: string
  onUndo: () => void
}

let showToast: ((data: DraftToastData | null) => void) | null = null

export function showDraftToast(data: DraftToastData | null) {
  showToast?.(data)
}

export function setDraftToastHandler(
  handler: ((data: DraftToastData | null) => void) | null,
) {
  showToast = handler
}
