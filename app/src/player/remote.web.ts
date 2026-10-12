import type { RemoteCommand } from './types'

export function setRemoteHandler(_h: ((cmd: RemoteCommand) => void) | undefined): void {}
export async function playbackService(): Promise<void> {}
