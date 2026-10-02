import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAction, login } from './api'

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
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    vi.restoreAllMocks()
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
})
