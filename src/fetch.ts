import { qHEADERS } from "@/constants/index"
import type { qAuthorization, qConfig, qResponse } from "@/types/http"

const setAuthorization = (auth: string | qAuthorization, headers: Record<string, string>) => {
  if (typeof auth === "string") {
    headers["Authorization"] = "Bearer " + auth
  } else {
    headers[auth.key] = auth.type ? `${auth.type} ${auth.value}` : auth.value
  }
}

const createResponse = (response: Response): qResponse => ({
  ok: response.ok,
  status: response.status,
  statusText: response.statusText,
  headers: response.headers,
  url: response.url,
  redirected: response.redirected,
  type: response.type,
  toJson: <T = any>() => response.clone().json() as Promise<T>,
  toText: () => response.clone().text(),
  toBlob: () => response.clone().blob(),
  toArrayBuffer: () => response.clone().arrayBuffer(),
  toFormData: () => response.clone().formData(),
  raw: response,
})

const isPlainObject = (v: unknown): v is Record<string, any> =>
  Object.prototype.toString.call(v) === "[object Object]"

const client = async (config: qConfig) => {
  const {
    url,
    method = "GET",
    cache = "default",
    credentials = "same-origin",
    timeout,
    options = {},
  } = config

  const headers: Record<string, string> = {}

  if (config.headers) {
    Object.assign(headers, config.headers)
  }

  if (options.authorization) {
    setAuthorization(options.authorization, headers)
  }

  const hasBody = config.body !== undefined && config.body !== null

  const requestBody: BodyInit | null =
    method === "GET" || method === "HEAD" ? null : hasBody ? (config.body as BodyInit) : null

  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  if (timeout) {
    timeoutId = setTimeout(() => controller.abort(), timeout)
  }

  try {
    const response = await fetch(url, {
      method,
      headers: new Headers(headers),
      body: requestBody,
      cache,
      credentials,
      signal: controller.signal,
    })

    if (timeoutId) clearTimeout(timeoutId)

    if (response.status === 401) {
      config.authCallback?.()
      throw new Error("401 Unauthorized")
    }

    if (response.status === 429) {
      throw new Error("429 Too Many Requests")
    }

    return response
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId)
    throw error
  }
}

export const qBuildQueryURL = (baseUrl: string, params: Record<string, string>) => {
  const url = new URL(baseUrl)
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v))
  return url.toString()
}

export const qBuildFormUrlEncoded = (params: Record<string, any>): string => {
  const urlencoded = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined) urlencoded.append(k, String(v))
  })
  return urlencoded.toString()
}

export const qBuildFormData = (params: Record<string, any>): FormData => {
  const formData = new FormData()

  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined) return

    if (typeof Blob !== "undefined" && v instanceof Blob) {
      formData.append(k, v)
    } else if (Array.isArray(v)) {
      v.forEach((item) => formData.append(k, String(item)))
    } else {
      formData.append(k, String(v))
    }
  })

  return formData
}

export const qBuildJsonBody = (params: Record<string, any>): string => {
  return JSON.stringify(params)
}

export const qFetch = async (config: qConfig): Promise<qResponse> => {
  const buildBody = (config: qConfig) => {
    switch (config.bodyType) {
      case "json":
        return {
          headers: qHEADERS.JSON,
          body:
            config.body !== undefined && config.body !== null ? qBuildJsonBody(config.body) : null,
        }

      case "urlencoded":
        return {
          headers: qHEADERS.FORM_URLENCODED,
          body: isPlainObject(config.body) ? qBuildFormUrlEncoded(config.body) : null,
        }

      case "form":
        return {
          headers: {},
          body:
            config.body instanceof FormData
              ? config.body
              : isPlainObject(config.body)
                ? qBuildFormData(config.body)
                : qBuildFormData({}),
        }

      case "protobuf":
        return {
          headers: qHEADERS.PROTOBUF,
          body: config.body,
        }

      default:
        return {
          headers: {},
          body: config.body ?? null,
        }
    }
  }

  const built = buildBody(config)

  const headers: Record<string, string> = {}
  if (config.headers) {
    Object.assign(headers, config.headers)
  }
  Object.assign(headers, built.headers)

  const res = await client({
    ...config,
    headers,
    body: built.body,
  })

  return createResponse(res)
}

export const qFetchRaw = async (config: qConfig): Promise<qResponse> => {
  const res = await client(config)
  return createResponse(res)
}
