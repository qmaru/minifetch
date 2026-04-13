import { afterEach, describe, expect, it, vi } from "vitest"
import { qFetch, qBuildQueryURL } from "../src/fetch"
import { qFetchStream } from "../src/stream"
import { json, mockOnce, mockEmpty, mockDelay, mockWith } from "./mock"

interface User {
  id: string
  name: string
  email: string
}

interface ApiData {
  info: User[]
  page: number
  pageSize: number
  total: number
}

interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

const userData: ApiResponse = {
  code: 0,
  message: "ok",
  data: {
    page: 4,
    pageSize: 10,
    total: 100,
    info: [
      { id: "1", name: "Alice", email: "alice@example.com" },
      { id: "2", name: "Bob", email: "bob@example.com" },
    ],
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("minifetch", () => {
  it("get_json", async () => {
    mockOnce(json(userData))

    const response = await qFetch("http://mock.local/get", {})
    const jsonData = await response.toJson<ApiResponse<ApiData>>()

    expect(response.ok).toBe(true)
    expect(jsonData.data?.info[0]?.id).toBe("1")
  })

  it("get_query", async () => {
    const spy = mockEmpty()

    const reqUrl = qBuildQueryURL("http://mock.local/get", { ping: "true" })
    await qFetch(reqUrl, {})

    const call = spy.mock.calls[0]
    if (!call) {
      throw new Error("fetch not called")
    }

    const [url] = call
    if (typeof url !== "string") {
      throw new Error("invalid url")
    }

    const parsedUrl = new URL(url)

    expect(parsedUrl.searchParams.get("ping")).toBe("true")
  })

  it("post_json", async () => {
    const spy = mockEmpty()

    await qFetch("http://mock.local/post", {
      method: "POST",
      bodyType: "json",
      body: { ping: true },
    })

    const call = spy.mock.calls[0]
    if (!call) {
      throw new Error("fetch not called")
    }

    const [url, options] = call
    const headers = new Headers(options?.headers)

    expect(url).toBe("http://mock.local/post")
    expect(headers.get("content-type")).toBe("application/json")
    expect(options?.body).toBe(JSON.stringify({ ping: true }))
  })

  it("post_form", async () => {
    const spy = mockEmpty()

    await qFetch("http://mock.local/post", {
      method: "POST",
      bodyType: "form",
      body: { ping: true },
    })

    const call = spy.mock.calls[0]
    if (!call) {
      throw new Error("fetch not called")
    }

    const [url, options] = call
    const headers = new Headers(options?.headers)
    const form = options?.body as FormData

    expect(url).toBe("http://mock.local/post")
    expect(headers.get("content-type")).toBeNull()
    expect(form.get("ping")).toBe("true")
  })

  it("post_urlencoded", async () => {
    const spy = mockEmpty()
    await qFetch("http://mock.local/post", {
      method: "POST",
      bodyType: "urlencoded",
      body: { ping: true },
    })

    const call = spy.mock.calls[0]
    if (!call) {
      throw new Error("fetch not called")
    }

    const [url, options] = call
    const headers = new Headers(options?.headers)

    expect(url).toBe("http://mock.local/post")
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded")
    expect(options?.body).toBe("ping=true")
  })

  it("post_protobuf", async () => {
    const spy = mockEmpty()

    const buffer = new Uint8Array([1, 2, 3])
    await qFetch("http://mock.local/post", {
      method: "POST",
      bodyType: "protobuf",
      body: buffer,
    })

    const call = spy.mock.calls[0]

    if (!call) {
      throw new Error("fetch not called")
    }

    const [url, options] = call
    const headers = new Headers(options?.headers)

    expect(url).toBe("http://mock.local/post")
    expect(headers.get("content-type")).toBe("application/x-protobuf")
    expect(options?.body).toBe(buffer)
  })

  it("request_header", async () => {
    const spy = mockEmpty()
    await qFetch("http://mock.local/headers", {
      headers: { "x-custom-key": "abc" },
    })

    const call = spy.mock.calls[0]
    if (!call) {
      throw new Error("fetch not called")
    }

    const [url, options] = call
    const headers = new Headers(options?.headers)

    expect(url).toBe("http://mock.local/headers")
    expect(headers.get("x-custom-key")).toBe("abc")
  })

  it("request_timeout", async () => {
    vi.useFakeTimers()

    // response delay 30s
    mockDelay(30000)

    const promise = qFetch("http://mock.local", {
      timeout: 3000,
    })

    const assertion = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    })

    vi.advanceTimersByTime(3000)
    await assertion

    vi.useRealTimers()
  })

  it("request_abort", async () => {
    vi.useFakeTimers()

    // response delay 30s
    mockDelay(30000)

    // abort
    const controller = new AbortController()

    const promise = qFetch("http://mock.local", {
      signal: controller.signal,
    })

    const assertion = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    })

    vi.advanceTimersByTime(1000)
    controller.abort()

    await assertion

    vi.useRealTimers()
  })

  it("request_retry", async () => {
    vi.useFakeTimers()

    const spy = mockOnce(
      new Response(null, { status: 500 }),
      new Response(null, { status: 500 }),
      json({ ok: true }),
    )

    const promise = qFetch("http://mock.local", {
      options: {
        retry: { retries: 3, delay: 500, backoff: "exponential" },
      },
    })

    await Promise.resolve()

    // first 500
    vi.advanceTimersByTime(500)
    await Promise.resolve()
    await Promise.resolve()
    expect(spy).toHaveBeenCalledTimes(2)

    // second 500 * 2^1 = 1000
    vi.advanceTimersByTime(1000)
    await Promise.resolve()
    expect(spy).toHaveBeenCalledTimes(3)

    await vi.runAllTimersAsync()

    const res = await promise
    expect(res.ok).toBe(true)

    vi.useRealTimers()
  })

  it("request_user_retry", async () => {
    vi.useFakeTimers()

    const spy = mockOnce(new Response(null, { status: 404 }), json({ ok: true }))

    const promise = qFetch("http://mock.local", {
      options: {
        retry: {
          retries: 1,
          delay: 500,
          shouldRetry: (error, response) => {
            return response?.status === 404
          },
        },
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    vi.advanceTimersByTime(500)
    await Promise.resolve()

    const res = await promise

    expect(res.ok).toBe(true)
    expect(spy).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it("stream_sse", async () => {
    const openaiStream = [
      `data: ${JSON.stringify({
        choices: [{ delta: { content: "hello," } }],
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [{ delta: { content: "world" } }],
      })}\n\n`,
      `data: [DONE]\n\n`,
    ].join("")

    mockWith(
      new Response(openaiStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    )

    let result = ""

    await qFetchStream(
      "http://mock.local/sse",
      { protocol: "sse" },
      {
        onData: (data: any) => {
          if (!data) return
          result += data.choices?.[0]?.delta?.content ?? ""
        },
      },
    )

    expect(result).toBe("hello,world")
  }, 30000)

  it("stream_ndjson", async () => {
    const ollamaStream = [
      JSON.stringify({ message: { content: "hello," } }),
      JSON.stringify({ message: { content: "world" } }),
      JSON.stringify({ done: true }),
    ].join("\n")

    mockWith(
      new Response(ollamaStream, {
        status: 200,
        headers: { "content-type": "application/x-ndjson" },
      }),
    )

    let result = ""

    await qFetchStream(
      "http://mock.local/ndjson",
      { protocol: "ndjson" },
      { onData: (data: any) => (result += data.message?.content ?? "") },
    )

    expect(result).toBe("hello,world")
  })
})
