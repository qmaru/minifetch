import { qFetch } from "@/fetch"
import type { qStreamConfig, qStreamCallbacks, qStreamProtocol } from "@/types"

const safeError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)))

const isAbortError = (err: unknown) =>
  err instanceof DOMException ? err.name === "AbortError" : false

const toTextDecoderStream = () =>
  new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>

const splitLines = () => {
  let buffer = ""

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk

      let idx: number
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx)
        if (line.endsWith("\r")) line = line.slice(0, -1)

        controller.enqueue(line)
        buffer = buffer.slice(idx + 1)
      }
    },
    flush(controller) {
      if (buffer) controller.enqueue(buffer)
    },
  })
}

const detectProtocol = (
  res: Response,
  protocol: qStreamProtocol,
): Exclude<qStreamProtocol, "auto"> => {
  if (protocol !== "auto") return protocol

  const contentType = res.headers.get("content-type") ?? ""

  if (
    contentType.includes("application/x-ndjson") ||
    contentType.includes("application/jsonl") ||
    contentType.includes("application/ndjson")
  ) {
    return "ndjson"
  }

  return "sse"
}

const readNDJSON = async <T>(
  body: ReadableStream<Uint8Array>,
  callbacks: qStreamCallbacks<T>,
  parser?: (line: string) => T,
  signal?: AbortSignal,
) => {
  const parse = parser ?? ((line: string) => JSON.parse(line) as T)

  try {
    const stream = body.pipeThrough(toTextDecoderStream()).pipeThrough(splitLines())

    const reader = stream.getReader()

    signal?.addEventListener("abort", () => {
      reader.cancel()
    })

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      if (!value) continue

      try {
        callbacks.onData(parse(value))
      } catch (err) {
        callbacks.onError?.(safeError(err))
      }
    }

    callbacks.onEnd?.()
  } catch (err) {
    if (!isAbortError(err)) {
      callbacks.onError?.(safeError(err))
    }
  }
}

const readSSE = async <T>(
  body: ReadableStream<Uint8Array>,
  callbacks: qStreamCallbacks<T>,
  parser?: (raw: string) => T,
  signal?: AbortSignal,
) => {
  const parse = parser ?? ((raw: string) => JSON.parse(raw) as T)

  let eventData = ""

  try {
    const stream = body.pipeThrough(toTextDecoderStream()).pipeThrough(splitLines())

    const reader = stream.getReader()

    signal?.addEventListener("abort", () => {
      reader.cancel()
    })

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const line = value

      if (!line) {
        if (!eventData) continue

        const data = eventData.trimEnd()
        eventData = ""

        if (data === "[DONE]") break

        try {
          callbacks.onData(parse(data))
        } catch (err) {
          callbacks.onError?.(safeError(err))
        }

        continue
      }

      if (line.startsWith("data:")) {
        let v = line.slice(5)
        if (v.startsWith(" ")) v = v.slice(1)
        eventData += v + "\n"
      }
    }

    callbacks.onEnd?.()
  } catch (err) {
    if (!isAbortError(err)) {
      callbacks.onError?.(safeError(err))
    }
  }
}

export const qFetchStream = async <T = unknown>(
  url: string,
  config: qStreamConfig<T>,
  callbacks: qStreamCallbacks<T>,
): Promise<void> => {
  const { protocol = "auto", parser, timeout = 15000, signal } = config

  let res: Awaited<ReturnType<typeof qFetch>>

  try {
    res = await qFetch(url, { ...config, timeout, ...(signal && { signal }) })
  } catch (err) {
    callbacks.onError?.(safeError(err))
    return
  }

  const raw = res.raw

  if (!raw.ok) {
    let extra = ""
    try {
      extra = await raw.clone().text()
    } catch {}

    callbacks.onError?.(
      new Error(`HTTP ${raw.status} ${raw.statusText}${extra ? `\n${extra.slice(0, 500)}` : ""}`),
    )
    return
  }

  if (!raw.body) {
    callbacks.onError?.(new Error("Empty response body"))
    return
  }

  const finalProtocol = detectProtocol(raw, protocol)

  if (finalProtocol === "ndjson") {
    await readNDJSON<T>(raw.body, callbacks, parser, signal)
    return
  }

  await readSSE<T>(raw.body, callbacks, parser, signal)
}
