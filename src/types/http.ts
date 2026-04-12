export type qHTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS"
  | "TRACE"
  | "CONNECT"
  | "PURGE"

export type qBodyType = "json" | "form" | "urlencoded" | "protobuf" | "raw"

export type qStreamProtocol = "sse" | "ndjson" | "auto"

export type qBuildBodyResult = {
  headers: Record<string, string>
  body: BodyInit | null
}

export interface qAuthorization {
  key: string
  type?: string
  value: string
}

export interface qRetry {
  retries?: number
  delay?: number
  backoff?: "fixed" | "exponential"
  shouldRetry?: (error: unknown, response?: Response) => boolean
}

export interface qConfigOptions {
  authorization?: string | qAuthorization | null
  [key: string]: any
  retry?: qRetry
}

export interface qCallbacks {
  onSuccess?: (response: qResponse) => void
  onError?: (error: Error, status?: number) => void
  onFinally?: () => void
}

export interface qConfig {
  method?: qHTTPMethod
  headers?: Record<string, string>
  bodyType?: qBodyType
  body?: any
  options?: qConfigOptions
  cache?: RequestCache | undefined
  credentials?: RequestCredentials | undefined
  timeout?: number
  redirect?: RequestRedirect
  signal?: AbortSignal
  callbacks?: qCallbacks
}

export interface qStreamConfig<T = unknown> extends qConfig {
  protocol?: qStreamProtocol
  parser?: (raw: string) => T
}

export interface qResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Headers
  url: string
  redirected: boolean
  type: ResponseType
  body: ReadableStream<Uint8Array> | null
  toJson: <T = any>() => Promise<T>
  toText: () => Promise<string>
  toBlob: () => Promise<Blob>
  toArrayBuffer: () => Promise<ArrayBuffer>
  toFormData: () => Promise<FormData>
  clone: () => qResponse
  raw: Response
}

export interface qStreamCallbacks<T = string> {
  onData: (data: T) => void
  onEnd?: () => void
  onError?: (error: Error) => void
}
