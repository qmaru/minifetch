import { qFetch } from "@/fetch"
import type { qStreamConfig, qStreamCallbacks, qStreamProtocol } from "@/types"

const safeError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)))

const readRawStream = async (
  body: ReadableStream<Uint8Array>,
  processChunk: (buffer: string) => { consumed: number; done?: boolean },
  onEnd?: () => void,
  onError?: (err: Error) => void,
): Promise<void> => {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const { consumed, done: shouldStop } = processChunk(buffer)

      if (consumed > 0) {
        buffer = buffer.slice(consumed)
      }

      if (shouldStop) {
        await reader.cancel()
        onEnd?.()
        return
      }
    }

    buffer += decoder.decode()

    const { done: shouldStop } = processChunk(buffer)
    if (shouldStop) {
      onEnd?.()
      return
    }

    onEnd?.()
  } catch (err) {
    onError?.(safeError(err))
  } finally {
    reader.releaseLock()
  }
}

const readSSEStream = async <T = string>(
  body: ReadableStream<Uint8Array>,
  callbacks: qStreamCallbacks<T>,
  parser?: (raw: string) => T,
): Promise<void> => {
  const parse = parser ?? ((s: string) => s as unknown as T)
  let eventData = ""

  return readRawStream(
    body,
    (buffer) => {
      let pos = 0
      let lineStart = 0

      while (true) {
        const nl = buffer.indexOf("\n", pos)
        if (nl === -1) break

        let lineEnd = nl
        if (nl > 0 && buffer[nl - 1] === "\r") {
          lineEnd = nl - 1
        }

        const line = buffer.slice(lineStart, lineEnd)

        if (line.length === 0) {
          if (eventData.length > 0) {
            const finalData =
              eventData[eventData.length - 1] === "\n" ? eventData.slice(0, -1) : eventData

            if (finalData === "[DONE]") {
              return { consumed: nl + 1, done: true }
            }

            try {
              callbacks.onData(parse(finalData))
            } catch (err) {
              callbacks.onError?.(safeError(err))
            }

            eventData = ""
          }
        } else if (line[0] !== ":") {
          if (line.startsWith("data:")) {
            let value = line.length > 5 ? line.slice(5) : ""
            if (value.startsWith(" ")) value = value.slice(1)
            eventData += value + "\n"
          }
        }

        pos = nl + 1
        lineStart = pos
      }

      return { consumed: lineStart }
    },
    callbacks.onEnd,
    callbacks.onError,
  )
}

const readNDJSONStream = async <T = unknown>(
  body: ReadableStream<Uint8Array>,
  callbacks: qStreamCallbacks<T>,
  parser?: (line: string) => T,
): Promise<void> => {
  const parse = parser ?? ((line: string) => JSON.parse(line) as T)

  return readRawStream(
    body,
    (buffer) => {
      let pos = 0
      let lineStart = 0

      while (true) {
        const nl = buffer.indexOf("\n", pos)
        if (nl === -1) break

        let lineEnd = nl
        if (nl > 0 && buffer[nl - 1] === "\r") {
          lineEnd = nl - 1
        }

        const line = buffer.slice(lineStart, lineEnd)

        if (line.length > 0) {
          try {
            callbacks.onData(parse(line))
          } catch (err) {
            callbacks.onError?.(safeError(err))
          }
        }

        pos = nl + 1
        lineStart = pos
      }

      return { consumed: lineStart }
    },
    callbacks.onEnd,
    callbacks.onError,
  )
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

export const qFetchStream = async <T = unknown>(
  url: string,
  config: qStreamConfig<T>,
  callbacks: qStreamCallbacks<T>,
): Promise<void> => {
  const { protocol = "auto", parser, timeout = 15000 } = config

  let res: Awaited<ReturnType<typeof qFetch>>

  try {
    res = await qFetch(url, { ...config, timeout })
  } catch (err) {
    callbacks.onError?.(safeError(err))
    return
  }

  const raw = res.raw

  if (!raw.ok) {
    let extra = ""
    try {
      extra = await raw.clone().text()
    } catch {
      // ignore
    }
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
    return readNDJSONStream(raw.body, callbacks, parser)
  }

  return readSSEStream(raw.body, callbacks, parser)
}
