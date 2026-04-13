import { vi } from "vitest"

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })

export const mockEmpty = () => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null))

export const mockOnce = (...items: Array<Response | Error>) => {
  const spy = vi.spyOn(globalThis, "fetch")
  for (const item of items) {
    if (item instanceof Error) {
      spy.mockRejectedValueOnce(item)
    } else {
      spy.mockResolvedValueOnce(item)
    }
  }
  return spy
}

export const mockWith = (response: Response) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response)

export const mockDelay = (ms: number) =>
  vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    const signal = init?.signal as AbortSignal | undefined

    return new Promise<Response>((resolve, reject) => {
      const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"))

      if (signal?.aborted) {
        abort()
        return
      }

      const timer = setTimeout(() => {
        resolve(new Response(null))
      }, ms)

      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer)
          abort()
        },
        { once: true },
      )
    })
  })
