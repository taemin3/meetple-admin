import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  canActivatePolicy,
  filtersForSavedPolicy,
  normalizePolicyVersionRequest,
  refreshPolicyCachesAfterActivation,
} from './PolicyManagement'
import type { PolicyDetail } from './types'

describe('policy management helpers', () => {
  it('모든 조항의 임베딩이 준비된 비활성 정책만 활성화할 수 있다', () => {
    expect(canActivatePolicy({ active: false, missingEmbeddingCount: 0 })).toBe(true)
    expect(canActivatePolicy({ active: false, missingEmbeddingCount: 1 })).toBe(false)
    expect(canActivatePolicy({ active: true, missingEmbeddingCount: 0 })).toBe(false)
  })

  it('정책 입력 공백을 정리하고 빈 종료일을 null로 전송한다', () => {
    expect(normalizePolicyVersionRequest(
      ' 안전 정책 ',
      'SAFETY',
      'ALL',
      '2026-10-03',
      '',
      [{ clauseCode: ' SAFETY_1 ', content: ' 위험 행위를 금지합니다. ' }],
    )).toEqual({
      title: '안전 정책',
      policyType: 'SAFETY',
      targetType: 'ALL',
      effectiveFrom: '2026-10-03',
      effectiveTo: null,
      clauses: [{ clauseCode: 'SAFETY_1', content: '위험 행위를 금지합니다.' }],
    })
  })

  it('비활성 정책 저장 후 해당 정책의 비활성 목록 첫 페이지로 이동한다', () => {
    expect(filtersForSavedPolicy('SAFETY')).toEqual({
      policyCode: 'SAFETY',
      active: 'false',
      page: 0,
    })
  })

  it('정책 활성화 후 다른 버전의 상세 캐시도 무효화한다', async () => {
    const queryClient = new QueryClient()
    const previousVersion = { policyId: 10, policyCode: 'SAFETY', active: true } as PolicyDetail
    const updatedVersion = { policyId: 11, policyCode: 'SAFETY', active: true } as PolicyDetail
    queryClient.setQueryData(['policy', 10], previousVersion)
    queryClient.setQueryData(['policy', 11], { ...updatedVersion, active: false })

    await refreshPolicyCachesAfterActivation(queryClient, updatedVersion)

    expect(queryClient.getQueryState(['policy', 10])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryData(['policy', 11])).toEqual(updatedVersion)
  })
})
