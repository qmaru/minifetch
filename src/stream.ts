import { qFetch } from "@/fetch"
import type { qStreamConfig, qStreamCallbacks, qStreamProtocol } from "@/types"

const safeError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)))

async function* lineStream(body: ReadableStream<Uint8Array>) {
  const reader = body
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
    .getReader()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += value

    let idx
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx)
      if (line.endsWith("\r")) line = line.slice(0, -1)

      yield line
      buffer = buffer.slice(idx + 1)
    }
  }

  if (buffer) yield buffer
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
  { onData, onError, onEnd }: qStreamCallbacks<T>,
  parser?: (line: string) => T,
) => {
  const parse = parser ?? ((line: string) => JSON.parse(line) as T)

  try {
    for await (const line of lineStream(body)) {
      if (!line) continue

      try {
        onData(parse(line))
      } catch (err) {
        onError?.(safeError(err))
      }
    }

    onEnd?.()
  } catch (err) {
    onError?.(safeError(err))
  }
}

const readSSE = async <T>(
  body: ReadableStream<Uint8Array>,
  { onData, onError, onEnd }: qStreamCallbacks<T>,
  parser?: (raw: string) => T,
) => {
  const parse =
    parser ??
    ((raw: string) => {
      if (raw === "[DONE]") return null as unknown as T
      return JSON.parse(raw) as T
    })

  let eventData = ""

  try {
    for await (const line of lineStream(body)) {
      if (!line) {
        if (eventData) {
          const data = eventData.trimEnd()

          if (data === "[DONE]") break

          try {
            onData(parse(data))
          } catch (err) {
            onError?.(safeError(err))
          }

          eventData = ""
        }
        continue
      }

      if (line.startsWith("data:")) {
        let v = line.slice(5)
        if (v.startsWith(" ")) v = v.slice(1)
        eventData += v + "\n"
      }
    }

    onEnd?.()
  } catch (err) {
    onError?.(safeError(err))
  }
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
    return readNDJSON<T>(raw.body, callbacks, parser)
  }

  return readSSE<T>(raw.body, callbacks, parser)
}
