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

type qBodyType = "json" | "form" | "urlencoded" | "protobuf"

export interface qAuthorization {
  key: string
  type?: string
  value: string
}

export interface qConfigOptions {
  authorization?: string | qAuthorization | null
  [key: string]: any
}

export interface qConfig {
  url: string
  method?: qHTTPMethod
  headers?: Record<string, string>
  bodyType?: qBodyType
  body?: any
  options?: qConfigOptions
  cache?: RequestCache | undefined
  credentials?: RequestCredentials | undefined
  timeout?: number
  authCallback?: () => void
}

export interface qResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Headers
  url: string
  redirected: boolean
  type: ResponseType
  toJson: <T = any>() => Promise<T>
  toText: () => Promise<string>
  toBlob: () => Promise<Blob>
  toArrayBuffer: () => Promise<ArrayBuffer>
  toFormData: () => Promise<FormData>
  raw: Response
}
