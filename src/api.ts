import type {
  ApiResponse,
  CreatePolicyRequest,
  CreatePolicyVersionRequest,
  LoginResponse,
  ModerationAction,
  PageResponse,
  PolicyDetail,
  PolicyFilters,
  PolicySummary,
  ReportDetail,
  ReportFilters,
  ReportSummary,
} from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const ACCESS_TOKEN_KEY = 'meetple.admin.access-token'
const REFRESH_TOKEN_KEY = 'meetple.admin.refresh-token'
export const SESSION_EXPIRED_EVENT = 'meetple:session-expired'
let reissuePromise: Promise<boolean> | null = null

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const tokenStore = {
  access: () => sessionStorage.getItem(ACCESS_TOKEN_KEY),
  refresh: () => sessionStorage.getItem(REFRESH_TOKEN_KEY),
  save: (tokens: LoginResponse) => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken)
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
  },
  clear: () => {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null
  if (!response.ok || !body?.success) {
    throw new ApiError(response.status, body?.message || '요청을 처리하지 못했습니다.')
  }
  return body
}

async function reissue(): Promise<boolean> {
  const refreshToken = tokenStore.refresh()
  if (!refreshToken) return false

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/reissue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    const body = await parseResponse<LoginResponse>(response)
    tokenStore.save(body.data)
    return true
  } catch {
    tokenStore.clear()
    return false
  }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const accessToken = tokenStore.access()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  if (response.status === 401) {
    if (retry) {
      reissuePromise ??= reissue().finally(() => {
        reissuePromise = null
      })
      if (await reissuePromise) return request<T>(path, init, false)
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
  }
  const body = await parseResponse<T>(response)
  return body.data
}

export const hasSession = () => Boolean(tokenStore.access() && tokenStore.refresh())

export async function login(email: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await parseResponse<LoginResponse>(response)
  tokenStore.save(body.data)
}

export async function logout(): Promise<void> {
  const refreshToken = tokenStore.refresh()
  try {
    if (refreshToken) {
      await request<void>('/api/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken, deviceId: null }),
      })
    }
  } finally {
    tokenStore.clear()
  }
}

export function clearSession(): void {
  tokenStore.clear()
}

export async function getReports(filters: ReportFilters): Promise<PageResponse<ReportSummary>> {
  const params = new URLSearchParams({
    page: String(filters.page),
    size: '20',
    sort: 'createdAt,desc',
  })
  if (filters.reviewStatus) params.set('reviewStatus', filters.reviewStatus)
  if (filters.analysisStatus) params.set('analysisStatus', filters.analysisStatus)
  return request(`/api/v1/admin/reports?${params.toString()}`)
}

export async function getReport(reportId: number): Promise<ReportDetail> {
  return request(`/api/v1/admin/reports/${reportId}`)
}

export async function applyAction(
  reportId: number,
  action: ModerationAction,
  reason: string,
): Promise<void> {
  await request(`/api/v1/admin/reports/${reportId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action, reason }),
  })
}

export async function getPolicies(filters: PolicyFilters): Promise<PageResponse<PolicySummary>> {
  const params = new URLSearchParams({
    page: String(filters.page),
    size: '20',
  })
  if (filters.policyCode.trim()) params.set('policyCode', filters.policyCode.trim())
  if (filters.active) params.set('active', filters.active)
  return request(`/api/v1/admin/moderation-policies?${params.toString()}`)
}

export async function getPolicy(policyId: number): Promise<PolicyDetail> {
  return request(`/api/v1/admin/moderation-policies/${policyId}`)
}

export async function createPolicy(payload: CreatePolicyRequest): Promise<PolicyDetail> {
  return request('/api/v1/admin/moderation-policies', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createPolicyVersion(
  policyId: number,
  payload: CreatePolicyVersionRequest,
): Promise<PolicyDetail> {
  return request(`/api/v1/admin/moderation-policies/${policyId}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updatePolicyActivation(
  policyId: number,
  active: boolean,
): Promise<PolicyDetail> {
  return request(`/api/v1/admin/moderation-policies/${policyId}/activation`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  })
}
