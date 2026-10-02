import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material'
import {
  ApiError,
  SESSION_EXPIRED_EVENT,
  applyAction,
  clearSession,
  getReport,
  getReports,
  hasSession,
  login,
  logout,
} from './api'
import type {
  AnalysisStatus,
  ModerationAction,
  ReportDetail,
  ReportFilters,
  ReportReviewStatus,
  ReportSummary,
  RiskLevel,
} from './types'
import PolicyManagement from './PolicyManagement'

const labels: Record<string, string> = {
  PENDING: '대기',
  PROCESSING: '분석 중',
  COMPLETED: '완료',
  FAILED_RETRYABLE: '재시도 필요',
  FAILED_PERMANENT: '분석 실패',
  RESOLVED: '처리 완료',
  MEMBER: '회원',
  CHAT_MESSAGE: '채팅',
  MEETING: '모임',
  LOW: '낮음',
  NORMAL: '보통',
  MEDIUM: '중간',
  HIGH: '높음',
  CRITICAL: '매우 높음',
  URGENT: '긴급',
  DISMISS: '신고 기각',
  WARNING: '경고',
  SUSPEND_1_DAY: '1일 이용 정지',
  SUSPEND_3_DAYS: '3일 이용 정지',
  SUSPEND_7_DAYS: '7일 이용 정지',
  PERMANENT_SUSPENSION: '영구 정지',
  FORCE_DELETE_MEETING: '모임 강제 삭제',
  RELEASE_SUSPENSION: '제재 해제',
  RESTORE_MEETING: '모임 복구',
  MANUAL_REVIEW: '관리자 검토',
  SPAM: '스팸',
  ABUSE_OR_HARASSMENT: '괴롭힘·모욕',
  INAPPROPRIATE_CONTENT: '부적절한 콘텐츠',
  FRAUD_OR_FALSE_INFORMATION: '허위 정보·사기',
  SAFETY: '안전',
  OTHER: '기타',
}

const initialActions: ModerationAction[] = [
  'DISMISS',
  'WARNING',
  'SUSPEND_1_DAY',
  'SUSPEND_3_DAYS',
  'SUSPEND_7_DAYS',
  'PERMANENT_SUSPENSION',
]

const destructiveActions = new Set<ModerationAction>([
  'SUSPEND_1_DAY',
  'SUSPEND_3_DAYS',
  'SUSPEND_7_DAYS',
  'PERMANENT_SUSPENSION',
  'FORCE_DELETE_MEETING',
])

export function isDestructiveAction(action: ModerationAction): boolean {
  return destructiveActions.has(action)
}

export function clampPage(page: number, totalPages: number): number {
  return Math.max(0, Math.min(page, totalPages - 1))
}

export function getAvailableActions(
  detail: Pick<ReportDetail, 'report' | 'targetState'>,
): ModerationAction[] {
  if (detail.report.reviewStatus === 'PENDING') {
    return detail.report.targetType === 'MEETING'
      ? [...initialActions, 'FORCE_DELETE_MEETING']
      : initialActions
  }

  const actions: ModerationAction[] = []
  if (detail.targetState.suspendedUntil || detail.targetState.permanentlySuspendedAt) {
    actions.push('RELEASE_SUSPENSION')
  }
  if (detail.targetState.meetingDeletedAt) actions.push('RESTORE_MEETING')
  return actions
}

function display(value: string | null | undefined): string {
  return value ? labels[value] ?? value : '-'
}

function formatDate(value: string | null | undefined): string {
  return value ? value.replace('T', ' ').slice(0, 16) : '-'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'
}

function RiskChip({ risk }: { risk: RiskLevel | null }) {
  const color = risk === 'CRITICAL' || risk === 'HIGH' ? 'error' : risk === 'MEDIUM' ? 'warning' : 'default'
  return <Chip size="small" label={display(risk)} color={color} variant={risk ? 'filled' : 'outlined'} />
}

function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const mutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess,
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (email.trim() && password) mutation.mutate()
  }

  return (
    <Box className="login-shell">
      <Paper className="login-card" elevation={0} component="form" onSubmit={submit}>
        <Box className="brand-mark">M</Box>
        <Typography variant="h5">Meetple 운영센터</Typography>
        <Typography color="text.secondary">관리자 계정으로 신고를 검토하고 제재를 승인합니다.</Typography>
        {mutation.error && <Alert severity="error">{errorMessage(mutation.error)}</Alert>}
        <TextField
          label="이메일"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" disabled={mutation.isPending}>
          {mutation.isPending ? '로그인 중…' : '관리자 로그인'}
        </Button>
      </Paper>
    </Box>
  )
}

function ReportTable({
  reports,
  selectedId,
  onSelect,
}: {
  reports: ReportSummary[]
  selectedId: number | null
  onSelect: (reportId: number) => void
}) {
  if (!reports.length) {
    return <Box className="empty-state">조건에 맞는 신고가 없습니다.</Box>
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>신고</TableCell>
            <TableCell>대상</TableCell>
            <TableCell>위험도</TableCell>
            <TableCell>추천 처리</TableCell>
            <TableCell>접수 시각</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {reports.map((report) => (
            <TableRow
              key={report.reportId}
              hover
              selected={selectedId === report.reportId}
              onClick={() => onSelect(report.reportId)}
              className="report-row"
            >
              <TableCell>
                <Typography sx={{ fontWeight: 700 }}>#{report.reportId}</Typography>
                <Typography variant="caption" color="text.secondary">{display(report.reason)}</Typography>
              </TableCell>
              <TableCell>
                {display(report.targetType)} · {report.targetNickname ?? `#${report.targetId}`}
              </TableCell>
              <TableCell><RiskChip risk={report.riskLevel} /></TableCell>
              <TableCell>{display(report.recommendedAction)}</TableCell>
              <TableCell>{formatDate(report.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box className="detail-section">
      <Typography variant="subtitle2" color="text.secondary">{title}</Typography>
      {children}
    </Box>
  )
}

function ReportDetailPanel({ detail, onAction }: { detail: ReportDetail; onAction: () => void }) {
  const actions = getAvailableActions(detail)
  const analysis = detail.analysis
  const hasActiveTargetState = Boolean(
    detail.targetState.permanentlySuspendedAt
      || detail.targetState.suspendedUntil
      || detail.targetState.meetingDeletedAt,
  )

  return (
    <Paper className="detail-panel" elevation={0}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}
      >
        <Box>
          <Typography variant="overline" color="primary">신고 #{detail.report.reportId}</Typography>
          <Typography variant="h6">{display(detail.report.targetType)} 신고 상세</Typography>
        </Box>
        <Chip label={display(detail.report.reviewStatus)} color={detail.report.reviewStatus === 'PENDING' ? 'warning' : 'success'} />
      </Stack>
      <Divider />
      <DetailSection title="신고 정보">
        <Typography>신고자: {detail.reporterNickname} (#{detail.reporterMemberId})</Typography>
        <Typography>신고 대상: {detail.report.targetNickname ?? '-'} (#{detail.report.targetId})</Typography>
        <Typography>사유: {display(detail.report.reason)}</Typography>
        {detail.otherDescription && <Typography>설명: {detail.otherDescription}</Typography>}
      </DetailSection>
      <DetailSection title="보존된 증거">
        <Paper variant="outlined" className="evidence-box">{detail.evidenceContent || '보존된 증거가 없습니다.'}</Paper>
      </DetailSection>
      <DetailSection title="AI 분석">
        {analysis ? (
          <Stack spacing={1}>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Chip size="small" label={`분류 ${display(analysis.reportType)}`} variant="outlined" />
              <RiskChip risk={analysis.riskLevel} />
              <Chip size="small" label={`우선순위 ${display(analysis.priority)}`} variant="outlined" />
              <Chip size="small" label={`확신도 ${analysis.confidence == null ? '-' : `${Math.round(analysis.confidence * 100)}%`}`} variant="outlined" />
              {detail.report.automaticWarningIssued && (
                <Chip size="small" label="자동 경고 발송됨" color="info" />
              )}
            </Stack>
            <Typography sx={{ fontWeight: 700 }}>{analysis.summary || display(analysis.status)}</Typography>
            <Typography color="text.secondary">{analysis.rationale || analysis.failureCode || '판단 근거가 없습니다.'}</Typography>
            <Typography>추천 처리: <strong>{display(analysis.recommendedAction)}</strong></Typography>
          </Stack>
        ) : <Typography color="text.secondary">아직 AI 분석 결과가 없습니다.</Typography>}
      </DetailSection>
      <DetailSection title="운영 정책 근거">
        {detail.policyBasis.length ? detail.policyBasis.map((policy) => (
          <Paper variant="outlined" className="policy-row" key={policy.policyId}>
            <strong>{policy.policyCode}</strong> · {policy.title} <span>v{policy.version}</span>
          </Paper>
        )) : <Typography color="text.secondary">연결된 정책 근거가 없습니다.</Typography>}
      </DetailSection>
      <DetailSection title="경고·제재 이력">
        {!detail.warnings.length && !detail.actions.length && (
          <Typography color="text.secondary">처리 이력이 없습니다.</Typography>
        )}
        {detail.warnings.map((warning) => (
          <Typography key={`warning-${warning.reportId}-${warning.createdAt}`}>
            자동 경고 · {formatDate(warning.createdAt)}
          </Typography>
        ))}
        {detail.actions.map((action) => (
          <Box className="history-row" key={action.actionId}>
            <Typography sx={{ fontWeight: 700 }}>{display(action.actionType)}</Typography>
            <Typography variant="body2" color="text.secondary">
              {action.administratorNickname} · {formatDate(action.createdAt)} · {action.reason}
            </Typography>
          </Box>
        ))}
      </DetailSection>
      <DetailSection title="현재 대상 상태">
        {!hasActiveTargetState && (
          <Typography color="text.secondary">현재 적용 중인 정지 또는 강제 삭제가 없습니다.</Typography>
        )}
        {detail.targetState.permanentlySuspendedAt && (
          <Alert severity="error">영구 정지 · {formatDate(detail.targetState.permanentlySuspendedAt)}</Alert>
        )}
        {detail.targetState.suspendedUntil && (
          <Alert severity="warning">이용 정지 종료 예정 · {formatDate(detail.targetState.suspendedUntil)}</Alert>
        )}
        {detail.targetState.meetingDeletedAt && (
          <Alert severity="warning">모임 강제 삭제 · {formatDate(detail.targetState.meetingDeletedAt)}</Alert>
        )}
      </DetailSection>
      {actions.length > 0 && (
        <Button variant="contained" size="large" onClick={onAction}>처리 승인</Button>
      )}
    </Paper>
  )
}

function ActionDialog({
  detail,
  open,
  onClose,
}: {
  detail: ReportDetail
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const actions = getAvailableActions(detail)
  const availableActionKey = actions.join('|')
  const [action, setAction] = useState<ModerationAction>(actions[0] ?? 'DISMISS')
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => applyAction(detail.report.reportId, action, reason.trim()),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
        queryClient.invalidateQueries({ queryKey: ['report', detail.report.reportId] }),
      ])
      setReason('')
      onClose()
    },
  })

  useEffect(() => {
    if (!open) return
    setAction(actions[0] ?? 'DISMISS')
    setReason('')
    mutation.reset()
  }, [open, detail.report.reportId, availableActionKey])

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>신고 #{detail.report.reportId} 처리 승인</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="warning">AI 추천은 참고 정보입니다. 증거와 정책 근거를 확인한 관리자가 최종 승인해야 합니다.</Alert>
          {mutation.error && <Alert severity="error">{errorMessage(mutation.error)}</Alert>}
          <FormControl fullWidth>
            <InputLabel id="action-label">처리 유형</InputLabel>
            <Select
              labelId="action-label"
              label="처리 유형"
              value={action}
              onChange={(event) => setAction(event.target.value as ModerationAction)}
            >
              {actions.map((item) => <MenuItem key={item} value={item}>{display(item)}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            label="처리 사유"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            helperText={`${reason.length}/500`}
            required
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>취소</Button>
        <Button
          variant="contained"
          color={isDestructiveAction(action) ? 'error' : 'primary'}
          onClick={() => mutation.mutate()}
          disabled={!reason.trim() || mutation.isPending}
        >
          {mutation.isPending ? '처리 중…' : '승인' }
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function ModerationConsole({ onSignedOut }: { onSignedOut: () => void }) {
  const [section, setSection] = useState<'reports' | 'policies'>('reports')
  const [filters, setFilters] = useState<ReportFilters>({ reviewStatus: 'PENDING', analysisStatus: '', page: 0 })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const reportsQuery = useQuery({
    queryKey: ['reports', filters],
    queryFn: () => getReports(filters),
  })
  const detailQuery = useQuery({
    queryKey: ['report', selectedId],
    queryFn: () => getReport(selectedId!),
    enabled: selectedId !== null,
  })

  useEffect(() => {
    const firstId = reportsQuery.data?.content[0]?.reportId
    if (firstId && !reportsQuery.data?.content.some((report) => report.reportId === selectedId)) {
      setSelectedId(firstId)
    }
    if (!reportsQuery.data?.content.length) setSelectedId(null)
  }, [reportsQuery.data, selectedId])

  useEffect(() => {
    const totalPages = reportsQuery.data?.totalPages
    if (totalPages === undefined) return
    setFilters((current) => {
      const page = clampPage(current.page, totalPages)
      return page === current.page ? current : { ...current, page }
    })
  }, [reportsQuery.data?.totalPages])

  const updateFilter = (key: 'reviewStatus' | 'analysisStatus', value: string) => {
    setFilters((current) => ({ ...current, [key]: value, page: 0 }))
  }
  const detail = detailQuery.data
  const accessDenied = reportsQuery.error instanceof ApiError && reportsQuery.error.status === 403

  return (
    <Box>
      <AppBar position="static" elevation={0} color="inherit" className="top-bar">
        <Toolbar>
          <Box className="brand-mark small">M</Box>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Meetple 운영센터</Typography>
          <Stack direction="row" spacing={0.5} className="top-navigation">
            <Button
              color="inherit"
              variant={section === 'reports' ? 'contained' : 'text'}
              onClick={() => setSection('reports')}
            >
              신고 검토
            </Button>
            <Button
              color="inherit"
              variant={section === 'policies' ? 'contained' : 'text'}
              onClick={() => setSection('policies')}
            >
              운영 정책
            </Button>
          </Stack>
          <Button
            color="inherit"
            onClick={async () => {
              try {
                await logout()
              } finally {
                onSignedOut()
              }
            }}
          >
            로그아웃
          </Button>
        </Toolbar>
      </AppBar>
      {section === 'reports' ? <Container maxWidth="xl" className="page-container">
        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography variant="h5">신고 검토</Typography>
          <Typography color="text.secondary">AI 분석과 운영 정책 근거를 확인하고 최종 처리를 승인합니다.</Typography>
        </Stack>
        {accessDenied && <Alert severity="error" sx={{ mb: 2 }}>이 계정에는 관리자 권한이 없습니다.</Alert>}
        {reportsQuery.error && !accessDenied && (
          <Alert severity="error" sx={{ mb: 2 }}>{errorMessage(reportsQuery.error)}</Alert>
        )}
        <Box className="console-grid">
          <Paper className="list-panel" elevation={0}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ gap: 1.5 }}
              className="filter-bar"
            >
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id="review-filter-label">처리 상태</InputLabel>
                <Select
                  labelId="review-filter-label"
                  label="처리 상태"
                  value={filters.reviewStatus}
                  onChange={(event) => updateFilter('reviewStatus', event.target.value)}
                >
                  <MenuItem value="">전체</MenuItem>
                  {(['PENDING', 'RESOLVED'] as ReportReviewStatus[]).map((status) => (
                    <MenuItem key={status} value={status}>{display(status)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="analysis-filter-label">분석 상태</InputLabel>
                <Select
                  labelId="analysis-filter-label"
                  label="분석 상태"
                  value={filters.analysisStatus}
                  onChange={(event) => updateFilter('analysisStatus', event.target.value)}
                >
                  <MenuItem value="">전체</MenuItem>
                  {(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT'] as AnalysisStatus[]).map((status) => (
                    <MenuItem key={status} value={status}>{display(status)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography color="text.secondary" sx={{ alignSelf: 'center', ml: { sm: 'auto' } }}>
                총 {reportsQuery.data?.totalElements ?? 0}건
              </Typography>
            </Stack>
            {reportsQuery.isPending ? (
              <Box className="loading"><CircularProgress size={30} /></Box>
            ) : (
              <ReportTable reports={reportsQuery.data?.content ?? []} selectedId={selectedId} onSelect={setSelectedId} />
            )}
            {(reportsQuery.data?.totalPages ?? 0) > 1 && (
              <Pagination
                page={filters.page + 1}
                count={reportsQuery.data?.totalPages ?? 1}
                onChange={(_, page) => setFilters((current) => ({ ...current, page: page - 1 }))}
                className="pagination"
              />
            )}
          </Paper>
          <Box>
            {detailQuery.isPending && selectedId && <Box className="loading"><CircularProgress size={30} /></Box>}
            {detailQuery.error && <Alert severity="error">{errorMessage(detailQuery.error)}</Alert>}
            {detail && <ReportDetailPanel detail={detail} onAction={() => setActionOpen(true)} />}
          </Box>
        </Box>
      </Container> : <PolicyManagement />}
      {section === 'reports' && detail && (
        <ActionDialog detail={detail} open={actionOpen} onClose={() => setActionOpen(false)} />
      )}
    </Box>
  )
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(hasSession)
  const queryClient = useQueryClient()
  const signedOut = useCallback(() => {
    clearSession()
    queryClient.clear()
    setAuthenticated(false)
  }, [queryClient])

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, signedOut)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, signedOut)
  }, [signedOut])

  return authenticated
    ? <ModerationConsole onSignedOut={signedOut} />
    : <LoginPage onSuccess={() => setAuthenticated(true)} />
}
