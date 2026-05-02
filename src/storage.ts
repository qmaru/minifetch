export type qStorageVersion = string | number

export interface qStorageSetOptions {
  ttl?: number
  version?: qStorageVersion
}

export interface qStorageGetOptions {
  version?: qStorageVersion
}

export interface qStorageItem<T> {
  data: T
  expiresAt: number | null
  updatedAt: number
  version: qStorageVersion | null
}

abstract class qBaseStorage {
  constructor(
    private readonly storageType: "localStorage" | "sessionStorage",
    private readonly defaultOptions: qStorageSetOptions = {}
  ) {}

  private get storage(): Storage {
    if (typeof window === "undefined") {
      throw new Error(`${this.storageType} is not available outside the browser`)
    }

    return window[this.storageType]
  }

  private isExpired(expiresAt: number | null): boolean {
    return expiresAt !== null && Date.now() > expiresAt
  }

  private parse<T>(key: string): qStorageItem<T> | null {
    const raw = this.storage.getItem(key)

    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as qStorageItem<T>
    } catch {
      this.storage.removeItem(key)
      return null
    }
  }

  private isVersionMatched(
    itemVersion: qStorageVersion | null,
    expectedVersion?: qStorageVersion
  ): boolean {
    if (expectedVersion === undefined) {
      return true
    }

    return itemVersion === expectedVersion
  }

  set<T>(key: string, data: T, options: qStorageSetOptions = {}): qStorageItem<T> {
    const ttl = options.ttl ?? this.defaultOptions.ttl
    const version = options.version ?? this.defaultOptions.version ?? null
    const item: qStorageItem<T> = {
      data,
      expiresAt: typeof ttl === "number" && ttl > 0 ? Date.now() + ttl : null,
      updatedAt: Date.now(),
      version,
    }

    this.storage.setItem(key, JSON.stringify(item))
    return item
  }

  get<T>(key: string, options: qStorageGetOptions = {}): T | null {
    const item = this.getItem<T>(key, options)
    return item?.data ?? null
  }

  getItem<T>(key: string, options: qStorageGetOptions = {}): qStorageItem<T> | null {
    const item = this.parse<T>(key)
    const version = options.version ?? this.defaultOptions.version

    if (!item) {
      return null
    }

    if (this.isExpired(item.expiresAt) || !this.isVersionMatched(item.version, version)) {
      this.remove(key)
      return null
    }

    return item
  }

  has(key: string, options: qStorageGetOptions = {}): boolean {
    return this.getItem(key, options) !== null
  }

  remove(key: string): void {
    this.storage.removeItem(key)
  }

  clear(): void {
    this.storage.clear()
  }
}

export class qLocalStorage extends qBaseStorage {
  constructor(defaultOptions: qStorageSetOptions = {}) {
    super("localStorage", defaultOptions)
  }
}

export class qSessionStorage extends qBaseStorage {
  constructor(defaultOptions: qStorageSetOptions = {}) {
    super("sessionStorage", defaultOptions)
  }
}

export const qLocalStore = new qLocalStorage()
export const qSessionStore = new qSessionStorage()
