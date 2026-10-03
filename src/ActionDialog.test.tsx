// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAction } from './api'
import { ActionDialog } from './App'
import type { ReportDetail } from './types'

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, applyAction: vi.fn() }
})

const applyActionMock = vi.mocked(applyAction)

function reportDetail(state: Partial<ReportDetail['targetState']> = {}): ReportDetail {
  return {
    report: {
      reportId: 3,
      targetType: 'MEETING',
      targetId: 20,
      targetMemberId: 2,
      targetNickname: '모임장',
      reason: '허위 정보·사기',
      reviewStatus: 'PENDING',
      analysisStatus: 'COMPLETED',
      riskLevel: 'HIGH',
      priority: 'HIGH',
      confidence: 0.87,
      recommendedAction: 'FORCE_DELETE_MEETING',
      automaticWarningIssued: false,
      createdAt: '2026-10-03T14:42:00',
      resolvedAt: null,
    },
    reporterMemberId: 1,
    reporterNickname: '신고자',
    otherDescription: null,
    evidenceContent: '증거',
    analysis: null,
    policyBasis: [],
    warnings: [],
    actions: [],
    targetState: {
      memberId: 2,
      suspendedUntil: null,
      permanentlySuspendedAt: null,
      suspensionReportId: null,
      meetingId: 20,
      meetingDeletedAt: null,
      meetingDeletionReportId: null,
      ...state,
    },
  }
}

function renderDialog(detail = reportDetail(), open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  const view = render(
    <QueryClientProvider client={client}>
      <ActionDialog detail={detail} open={open} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { ...view, client, onClose }
}

async function chooseOption(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(screen.getByRole('option', { name: option }))
}

afterEach(() => {
  cleanup()
  applyActionMock.mockReset()
})

describe('ActionDialog', () => {
  it('강제 삭제에서만 추가 제재를 표시하고 선택 변경과 재오픈 때 입력을 초기화한다', async () => {
    const user = userEvent.setup()
    const detail = reportDetail()
    const { rerender, client, onClose } = renderDialog(detail)

    expect(screen.queryByRole('combobox', { name: '모임장 추가 제재' })).toBeNull()
    await chooseOption(user, '처리 유형', '모임 강제 삭제')
    await chooseOption(user, '모임장 추가 제재', '3일 이용 정지')
    expect(screen.getByText(/모임 강제 삭제와 3일 이용 정지가/)).toBeTruthy()

    await chooseOption(user, '처리 유형', '신고 기각')
    expect(screen.queryByRole('combobox', { name: '모임장 추가 제재' })).toBeNull()
    await chooseOption(user, '처리 유형', '모임 강제 삭제')
    expect((screen.getByRole('combobox', { name: '모임장 추가 제재' }).parentElement
      ?.querySelector('input') as HTMLInputElement).value).toBe('')
    await chooseOption(user, '모임장 추가 제재', '영구 정지')
    await user.type(screen.getByRole('textbox', { name: /처리 사유/ }), '검토 사유')

    rerender(
      <QueryClientProvider client={client}>
        <ActionDialog detail={detail} open={false} onClose={onClose} />
      </QueryClientProvider>,
    )
    rerender(
      <QueryClientProvider client={client}>
        <ActionDialog detail={detail} open onClose={onClose} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect((screen.getByRole('textbox', { name: /처리 사유/ }) as HTMLTextAreaElement).value).toBe(''))
    expect(screen.queryByRole('combobox', { name: '모임장 추가 제재' })).toBeNull()
    await chooseOption(user, '처리 유형', '모임 강제 삭제')
    expect((screen.getByRole('combobox', { name: '모임장 추가 제재' }).parentElement
      ?.querySelector('input') as HTMLInputElement).value).toBe('')
  })

  it('이미 정지된 모임장에게 추가 제재 선택지를 표시하지 않는다', async () => {
    const user = userEvent.setup()
    renderDialog(reportDetail({ suspendedUntil: '2999-10-04T09:00:00' }))

    await chooseOption(user, '처리 유형', '모임 강제 삭제')

    expect(screen.queryByRole('combobox', { name: '모임장 추가 제재' })).toBeNull()
    expect(screen.getByText(/이미 정지 중이어서 추가 정지를/)).toBeTruthy()
  })

  it('처리 중에는 중복 승인을 막고 성공 후 신고 목록과 모든 상세 캐시를 갱신한다', async () => {
    const user = userEvent.setup()
    let resolveAction!: () => void
    applyActionMock.mockReturnValue(new Promise<void>((resolve) => { resolveAction = resolve }))
    const { client, onClose } = renderDialog()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await user.type(screen.getByRole('textbox', { name: /처리 사유/ }), '관리자 확인 완료')
    const approve = screen.getByRole('button', { name: '승인' })
    await user.click(approve)
    approve.click()

    expect(applyActionMock).toHaveBeenCalledTimes(1)
    expect(approve.hasAttribute('disabled')).toBe(true)
    resolveAction()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reports'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['report'] })
  })
})
