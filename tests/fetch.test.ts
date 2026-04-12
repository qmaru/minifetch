import { describe, it, expect, vi } from "vitest"
import { qFetch } from "../src/fetch"
import { qFetchStream } from "../src/stream"

describe("qFetch", () => {
  it("GET Json", async () => {
    const res = await qFetch("https://httpbun.com/ip", {})
    const data = await res.toJson<{ title: string }>()
    expect(res.ok).toBe(true)
    expect(data.origin).toBeDefined()
  })

  it("POST Json", async () => {
    const res = await qFetch("https://httpbun.com/post", {
      method: "POST",
      bodyType: "json",
      body: { a: 1 },
    })
    const data = await res.toJson<any>()
    expect(data.json.a).toBe(1)
  })

  it("URL Encoded", async () => {
    const res = await qFetch("https://httpbun.com/post", {
      method: "POST",
      bodyType: "urlencoded",
      body: { a: 1 },
    })
    const data = await res.toJson<any>()
    expect(data.form.a).toBe("1")
  })

  it("Form Data", async () => {
    const res = await qFetch("https://httpbun.com/post", {
      method: "POST",
      bodyType: "form",
      body: { a: 1 },
    })
    const data = await res.toJson<any>()
    expect(data.form.a).toBe("1")
  })

  it("Merge Headers", async () => {
    const res = await qFetch("https://httpbun.com/headers", {
      headers: { "X-Test": "abc" },
    })
    const data = await res.toJson<any>()
    expect(data.headers["X-Test"]).toBe("abc")
  })

  it("Timeout", async () => {
    await expect(qFetch("https://httpbun.com/delay/3", { timeout: 500 })).rejects.toThrow()
  })

  it("Retry fixed", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch")
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const res = await qFetch("https://example.com/test", {
      options: {
        retry: { retries: 3, delay: 50, backoff: "fixed" },
      },
    })

    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    mockFetch.mockRestore()
  })

  it("Retry exponential", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch")
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const start = Date.now()
    const res = await qFetch("https://example.com/test", {
      options: {
        retry: { retries: 3, delay: 100, backoff: "exponential" },
      },
    })
    const elapsed = Date.now() - start

    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(elapsed).toBeGreaterThanOrEqual(250)
    mockFetch.mockRestore()
  })

  it("Retry on network error", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch")
    mockFetch
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const res = await qFetch("https://example.com/test", {
      options: {
        retry: { retries: 2, delay: 50 },
      },
    })

    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    mockFetch.mockRestore()
  })

  it("Streaming sse", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch")

    const openaiStream = [
      `data: ${JSON.stringify({
        choices: [{ delta: { content: "hello," } }],
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [{ delta: { content: "world" } }],
      })}\n\n`,
      `data: [DONE]\n\n`,
    ].join("")

    mockFetch.mockResolvedValue(
      new Response(openaiStream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      }),
    )

    let result = ""

    await qFetchStream(
      "https://api.openai.com/v1/chat/completions",
      { protocol: "sse" },
      {
        onData: (data: any) => {
          if (!data) return
          result += data.choices?.[0]?.delta?.content ?? ""
        },
      },
    )

    expect(result).toBe("hello,world")
    mockFetch.mockRestore()
  }, 30000)

  it("Streaming ndjson", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch")

    const ollamaStream = [
      JSON.stringify({ message: { content: "hello," } }),
      JSON.stringify({ message: { content: "world" } }),
      JSON.stringify({ done: true }),
    ].join("\n")

    mockFetch.mockResolvedValue(
      new Response(ollamaStream, {
        status: 200,
        headers: {
          "content-type": "application/x-ndjson",
        },
      }),
    )

    let result = ""

    await qFetchStream(
      "http://127.0.0.1:11434/api/chat",
      { protocol: "ndjson" },
      {
        onData: (data: any) => {
          result += data.message?.content ?? ""
        },
      },
    )
    expect(result).toBe("hello,world")
  })
})
