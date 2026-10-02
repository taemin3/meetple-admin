import { describe, expect, it } from 'vitest'
import { canActivatePolicy, normalizePolicyVersionRequest } from './PolicyManagement'

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
})
