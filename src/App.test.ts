import { describe, expect, it } from 'vitest'
import { getAvailableActions } from './App'
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
