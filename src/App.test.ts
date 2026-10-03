import { describe, expect, it } from 'vitest'
import {
  clampPage,
  getAvailableActions,
  getAvailableAdditionalSuspensions,
  isDestructiveAction,
} from './App'
import type { ReportDetail } from './types'

function detail(
  targetType: ReportDetail['report']['targetType'],
  reviewStatus: ReportDetail['report']['reviewStatus'],
  state: Partial<ReportDetail['targetState']> = {},
) {
  return {
    report: { targetType, reviewStatus },
    targetState: {
      memberId: null,
      suspendedUntil: null,
      permanentlySuspendedAt: null,
      suspensionReportId: null,
      meetingId: null,
      meetingDeletedAt: null,
      meetingDeletionReportId: null,
      ...state,
    },
  } as Pick<ReportDetail, 'report' | 'targetState'>
}

describe('getAvailableActions', () => {
  it('모임 신고의 최초 처리에 강제 삭제를 제공한다', () => {
    expect(getAvailableActions(detail('MEETING', 'PENDING'))).toContain('FORCE_DELETE_MEETING')
  })

  it('정지된 회원의 처리 완료 신고에는 제재 해제만 제공한다', () => {
    expect(getAvailableActions(detail('MEMBER', 'RESOLVED', {
      suspendedUntil: '2026-10-03T09:00:00',
    }))).toEqual(['RELEASE_SUSPENSION'])
  })

  it('강제 삭제된 모임의 처리 완료 신고에는 복구만 제공한다', () => {
    expect(getAvailableActions(detail('MEETING', 'RESOLVED', {
      meetingDeletedAt: '2026-10-02T09:00:00',
    }))).toEqual(['RESTORE_MEETING'])
  })
})

describe('moderation console helpers', () => {
  it('결과 페이지 수가 줄면 마지막 유효 페이지로 이동한다', () => {
    expect(clampPage(4, 3)).toBe(2)
    expect(clampPage(2, 0)).toBe(0)
  })

  it('영구 정지를 파괴적 처리로 표시한다', () => {
    expect(isDestructiveAction('PERMANENT_SUSPENSION')).toBe(true)
    expect(isDestructiveAction('DISMISS')).toBe(false)
  })

  it('이미 정지 중인 모임장에게 추가 정지 선택지를 제공하지 않는다', () => {
    expect(getAvailableAdditionalSuspensions(
      detail('MEETING', 'PENDING', { suspendedUntil: '2026-10-04T09:00:00' }),
      new Date('2026-10-03T09:00:00'),
    )).toEqual([])
    expect(getAvailableAdditionalSuspensions(
      detail('MEETING', 'PENDING', { suspendedUntil: '2026-10-02T09:00:00' }),
      new Date('2026-10-03T09:00:00'),
    )).toContain('SUSPEND_3_DAYS')
  })
})
