import { describe, it, expect } from "vitest"
import { qFetch } from "../src/fetch"

describe("qFetch", () => {
  it("should GET json", async () => {
    const res = await qFetch({
      url: "https://httpbin.org/json",
    })

    const data = await res.toJson<{ title: string }>()

    expect(res.ok).toBe(true)
    expect(data.slideshow.title).toBeDefined()
  })

  it("should POST json", async () => {
    const res = await qFetch({
      url: "https://httpbin.org/post",
      method: "POST",
      bodyType: "json",
      body: { a: 1 },
    })

    const data = await res.toJson<any>()

    expect(data.json.a).toBe(1)
  })

  it("should send urlencoded", async () => {
    const res = await qFetch({
      url: "https://httpbin.org/post",
      method: "POST",
      bodyType: "urlencoded",
      body: { a: 1 },
    })

    const data = await res.toJson<any>()

    expect(data.form.a).toBe("1")
  })

  it("should send form data", async () => {
    const res = await qFetch({
      url: "https://httpbin.org/post",
      method: "POST",
      bodyType: "form",
      body: { a: 1 },
    })

    const data = await res.toJson<any>()

    expect(data.form.a).toBe("1")
  })

  it("should merge headers", async () => {
    const res = await qFetch({
      url: "https://httpbin.org/headers",
      headers: {
        "X-Test": "abc",
      },
    })

    const data = await res.toJson<any>()

    expect(data.headers["X-Test"]).toBe("abc")
  })

  it("should timeout", async () => {
    await expect(
      qFetch({
        url: "https://httpbin.org/delay/3",
        timeout: 500,
      }),
    ).rejects.toThrow()
  })
})
