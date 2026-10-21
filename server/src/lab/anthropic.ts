import { errorFromResponse, ProviderError, type TextModel } from '../providers/types'

/**
 * Claude through the Messages API, for the Lab's lesson-plan and script comparisons (PC-1021-06).
 * The reply is forced through one tool whose input schema is the plan's schema, so it comes back as
 * structured JSON like Gemini's. Not used by the app's pipeline unless Finlay picks it.
 */
export function claudeText(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): TextModel {
  return {
    async generateJson<T>({ system, prompt, schema, temperature }: { system: string; prompt: string; schema: Record<string, unknown>; temperature?: number }) {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 16_000,
          system,
          ...(temperature === undefined ? {} : { temperature }),
          messages: [{ role: 'user', content: prompt }],
          tools: [{ name: 'answer', description: 'Give the answer in this exact shape.', input_schema: schema }],
          tool_choice: { type: 'tool', name: 'answer' },
        }),
      })
      if (!res.ok) throw errorFromResponse('Claude', res.status, await res.text())
      const json = (await res.json()) as {
        content?: { type: string; name?: string; input?: unknown }[]
        usage?: { input_tokens?: number; output_tokens?: number }
        stop_reason?: string
      }
      const block = json.content?.find((c) => c.type === 'tool_use' && c.name === 'answer')
      if (!block || block.input === undefined) throw new ProviderError(`Claude reply had no answer (${json.stop_reason ?? 'no reason'})`, true)
      return {
        data: block.input as T,
        usage: { textInTokens: json.usage?.input_tokens ?? 0, textOutTokens: json.usage?.output_tokens ?? 0 },
      }
    },
  }
}
