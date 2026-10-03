import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  applyAction,
  createPolicyVersion,
  getPolicies,
  login,
  SESSION_EXPIRED_EVENT,
  updatePolicyActivation,
} from './api'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

function apiResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    status,
    success: status < 400,
    code: status,
    message: status < 400 ? '성공' : '인증 실패',
    data,
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('admin API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.stubGlobal('sessionStorage', new MemoryStorage())
  })

  it('로그인 토큰을 사용해 관리자 처리 요청을 보낸다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        accessTokenExpiresIn: 1800,
        refreshTokenExpiresIn: 1209600,
      }))
      .mockResolvedValueOnce(apiResponse({ actionId: 1 }, 201))

    await login('admin@meetple.test', 'password')
    await applyAction(10, 'SUSPEND_1_DAY', '정책 위반 확인')

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/admin/reports/10/actions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'SUSPEND_1_DAY', reason: '정책 위반 확인' }),
      headers: expect.any(Headers),
    }))
    const actionHeaders = fetchMock.mock.calls[1][1]?.headers as Headers
    expect(actionHeaders.get('Authorization')).toBe('Bearer access-token')
  })

  it('모임 강제 삭제와 모임장 정지를 함께 요청한다', async () => {
    sessionStorage.setItem('meetple.admin.access-token', 'access-token')
    sessionStorage.setItem('meetple.admin.refresh-token', 'refresh-token')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse({ actionId: 1, additionalActionId: 2 }, 201))

    await applyAction(
      10,
      'FORCE_DELETE_MEETING',
      '허위 비용 안내 확인',
      'SUSPEND_3_DAYS',
    )

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/reports/10/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'FORCE_DELETE_MEETING',
          additionalAction: 'SUSPEND_3_DAYS',
          reason: '허위 비용 안내 확인',
        }),
      }),
    )
  })

  it('access token 만료 시 재발급 후 요청을 한 번만 재시도한다', async () => {
    sessionStorage.setItem('meetple.admin.access-token', 'expired-token')
    sessionStorage.setItem('meetple.admin.refresh-token', 'refresh-token')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(null, 401))
      .mockResolvedValueOnce(apiResponse({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
        accessTokenExpiresIn: 1800,
        refreshTokenExpiresIn: 1209600,
      }))
      .mockResolvedValueOnce(apiResponse({ actionId: 2 }, 201))

    await applyAction(11, 'DISMISS', '위반 근거 부족')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/reissue')
    const retriedHeaders = fetchMock.mock.calls[2][1]?.headers as Headers
    expect(retriedHeaders.get('Authorization')).toBe('Bearer new-access-token')
  })

  it('재발급도 실패하면 만료 이벤트를 보내고 세션을 제거한다', async () => {
    const browserWindow = new EventTarget()
    const expiredListener = vi.fn()
    browserWindow.addEventListener(SESSION_EXPIRED_EVENT, expiredListener)
    vi.stubGlobal('window', browserWindow)
    sessionStorage.setItem('meetple.admin.access-token', 'expired-token')
    sessionStorage.setItem('meetple.admin.refresh-token', 'expired-refresh-token')
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(null, 401))
      .mockResolvedValueOnce(apiResponse(null, 401))

    await expect(applyAction(12, 'DISMISS', '위반 근거 부족'))
      .rejects.toBeInstanceOf(ApiError)

    expect(expiredListener).toHaveBeenCalledOnce()
    expect(sessionStorage.length).toBe(0)
  })

  it('운영 정책 필터를 관리자 목록 API query로 전달한다', async () => {
    sessionStorage.setItem('meetple.admin.access-token', 'access-token')
    sessionStorage.setItem('meetple.admin.refresh-token', 'refresh-token')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(apiResponse({
      content: [],
      page: 1,
      size: 20,
      totalElements: 0,
      totalPages: 0,
      first: false,
      last: true,
    }))

    await getPolicies({ policyCode: ' SAFETY ', active: 'false', page: 1 })

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/v1/admin/moderation-policies?page=1&size=20&policyCode=SAFETY&active=false',
    )
  })

  it('새 정책 버전 생성과 활성 상태 변경 계약을 그대로 전송한다', async () => {
    sessionStorage.setItem('meetple.admin.access-token', 'access-token')
    sessionStorage.setItem('meetple.admin.refresh-token', 'refresh-token')
    const policy = { policyId: 31, policyCode: 'SAFETY', version: 2 }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(apiResponse(policy, 201))
      .mockResolvedValueOnce(apiResponse({ ...policy, active: true }))
    const payload = {
      title: '안전 정책 개정',
      policyType: 'SAFETY' as const,
      targetType: 'ALL' as const,
      effectiveFrom: '2026-10-03',
      effectiveTo: null,
      clauses: [{ clauseCode: 'SAFETY_1', content: '위험 행위를 금지합니다.' }],
    }

    await createPolicyVersion(30, payload)
    await updatePolicyActivation(31, true)

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/admin/moderation-policies/30/versions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/admin/moderation-policies/31/activation', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ active: true }),
    }))
  })
})
