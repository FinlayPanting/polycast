/** Where tapping a notification takes the learner: "ready" and "new episode" both open the episode page. */
export function routeForNotification(data: unknown): string | undefined {
  const id = (data as { episodeId?: unknown } | null)?.episodeId
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? `/episode/${id}` : undefined
}
