const RACHEL_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
const MAX_RETRIES = 4
const RETRY_DELAY_MS = 1500

export async function synthesise(text: string, apiKey: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  let lastErr: Error = new Error('TTS failed')

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    signal?.throwIfAborted()
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${RACHEL_VOICE_ID}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
          signal,
        },
      )

      if (!res.ok) {
        const err = await res.text()
        // 429 rate limit — always retry; 5xx server errors — retry; 4xx auth errors — don't
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`ElevenLabs error ${res.status}: ${err}`)
          console.warn(`[polycast] tts attempt ${attempt + 1} failed (${res.status}), retrying…`)
        } else {
          throw new Error(`ElevenLabs error ${res.status}: ${err}`)
        }
      } else {
        return res.arrayBuffer()
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      lastErr = e instanceof Error ? e : new Error(String(e))
      console.warn(`[polycast] tts attempt ${attempt + 1} network error:`, lastErr.message)
    }

    if (attempt < MAX_RETRIES - 1) {
      // Exponential backoff: 1.5s, 3s, 6s
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
    }
  }

  throw lastErr
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
