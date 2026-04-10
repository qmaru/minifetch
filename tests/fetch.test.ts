import { describe, it, expect, vi } from "vitest"
import { qFetch } from "../src/fetch"
import { qFetchStream } from "../src/stream"

describe("qFetch", () => {
  it("GET Json", async () => {
    const res = await qFetch({
      url: "https://httpbun.com/ip",
    })

    const data = await res.toJson<{ title: string }>()

    expect(res.ok).toBe(true)
    expect(data.origin).toBeDefined()
  })

  it("POST Json", async () => {
    const res = await qFetch({
      url: "https://httpbun.com/post",
      method: "POST",
      bodyType: "json",
      body: { a: 1 },
    })

    const data = await res.toJson<any>()

    expect(data.json.a).toBe(1)
  })

  it("URL Encoded", async () => {
    const res = await qFetch({
      url: "https://httpbun.com/post",
      method: "POST",
      bodyType: "urlencoded",
      body: { a: 1 },
    })

    const data = await res.toJson<any>()

    expect(data.form.a).toBe("1")
  })

  it("Form Data", async () => {
    const res = await qFetch({
      url: "https://httpbun.com/post",
      method: "POST",
      bodyType: "form",
      body: { a: 1 },
    })

    const data = await res.toJson<any>()

    expect(data.form.a).toBe("1")
  })

  it("Merge Headers", async () => {
    const res = await qFetch({
      url: "https://httpbun.com/headers",
      headers: {
        "X-Test": "abc",
      },
    })

    const data = await res.toJson<any>()

    expect(data.headers["X-Test"]).toBe("abc")
  })

  it("Timeout", async () => {
    await expect(
      qFetch({
        url: "https://httpbun.com/delay/3",
        timeout: 500,
      }),
    ).rejects.toThrow()
  })

  it("Streaming sse", async () => {
    const onData = vi.fn()

    await qFetchStream(
      {
        url: "https://httpbun.com/sse",
        protocol: "sse",
        timeout: 30000,
      },
      { onData },
    )

    expect(onData).toHaveBeenCalledTimes(10)
  }, 30000)
})
