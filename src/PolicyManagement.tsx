import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Typography,
} from '@mui/material'
import {
  createPolicy,
  createPolicyVersion,
  getPolicies,
  getPolicy,
  updatePolicyActivation,
} from './api'
import type {
  CreatePolicyRequest,
  CreatePolicyVersionRequest,
  ModerationPolicyTargetType,
  ModerationPolicyType,
  PolicyClauseRequest,
  PolicyDetail,
  PolicyFilters,
  PolicySummary,
} from './types'

const policyTypeLabels: Record<ModerationPolicyType, string> = {
  SPAM: '스팸',
  ABUSE_OR_HARASSMENT: '괴롭힘·모욕',
  INAPPROPRIATE_CONTENT: '부적절한 콘텐츠',
  FRAUD_OR_FALSE_INFORMATION: '허위 정보·사기',
  SAFETY: '안전',
  GENERAL: '일반',
}

const targetTypeLabels: Record<ModerationPolicyTargetType, string> = {
  ALL: '전체',
  MEMBER: '회원',
  MEETING: '모임',
  CHAT_MESSAGE: '채팅',
}

const auditLabels: Record<PolicyDetail['audits'][number]['action'], string> = {
  CREATED: '정책 등록',
  VERSION_CREATED: '새 버전 생성',
  ACTIVATED: '활성화',
  DEACTIVATED: '비활성화',
}

const policyTypes = Object.keys(policyTypeLabels) as ModerationPolicyType[]
const targetTypes = Object.keys(targetTypeLabels) as ModerationPolicyTargetType[]
const policyCodePattern = /^[A-Z][A-Z0-9_-]{2,99}$/
const clauseCodePattern = /^[A-Z][A-Z0-9_-]{0,99}$/

function localDate(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function formatDate(value: string | null | undefined): string {
  return value ? value.replace('T', ' ').slice(0, 16) : '-'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'
}

export function canActivatePolicy(
  policy: Pick<PolicyDetail, 'active' | 'missingEmbeddingCount'>,
): boolean {
  return !policy.active && policy.missingEmbeddingCount === 0
}

export function normalizePolicyVersionRequest(
  title: string,
  policyType: ModerationPolicyType,
  targetType: ModerationPolicyTargetType,
  effectiveFrom: string,
  effectiveTo: string,
  clauses: PolicyClauseRequest[],
): CreatePolicyVersionRequest {
  return {
    title: title.trim(),
    policyType,
    targetType,
    effectiveFrom,
    effectiveTo: effectiveTo || null,
    clauses: clauses.map((clause) => ({
      clauseCode: clause.clauseCode.trim(),
      content: clause.content.trim(),
    })),
  }
}

export function filtersForSavedPolicy(policyCode: string): PolicyFilters {
  return { policyCode, active: 'false', page: 0 }
}

export async function refreshPolicyCachesAfterActivation(
  queryClient: QueryClient,
  updated: PolicyDetail,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['policies'] }),
    queryClient.invalidateQueries({ queryKey: ['policy'] }),
  ])
  queryClient.setQueryData(['policy', updated.policyId], updated)
}

function PolicyEditorDialog({
  mode,
  source,
  open,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'version'
  source: PolicyDetail | null
  open: boolean
  onClose: () => void
  onSaved: (policy: PolicyDetail) => void
}) {
  const queryClient = useQueryClient()
  const [policyCode, setPolicyCode] = useState('')
  const [title, setTitle] = useState('')
  const [policyType, setPolicyType] = useState<ModerationPolicyType>('GENERAL')
  const [targetType, setTargetType] = useState<ModerationPolicyTargetType>('ALL')
  const [effectiveFrom, setEffectiveFrom] = useState(localDate)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [clauses, setClauses] = useState<PolicyClauseRequest[]>([{ clauseCode: '', content: '' }])

  const mutation = useMutation({
    mutationFn: async () => {
      const versionPayload = normalizePolicyVersionRequest(
        title,
        policyType,
        targetType,
        effectiveFrom,
        effectiveTo,
        clauses,
      )
      if (mode === 'version') {
        if (!source) throw new Error('새 버전을 만들 원본 정책이 없습니다.')
        return createPolicyVersion(source.policyId, versionPayload)
      }
      const payload: CreatePolicyRequest = {
        ...versionPayload,
        policyCode: policyCode.trim(),
      }
      return createPolicy(payload)
    },
    onSuccess: async (policy) => {
      await queryClient.invalidateQueries({ queryKey: ['policies'] })
      queryClient.setQueryData(['policy', policy.policyId], policy)
      onSaved(policy)
      onClose()
    },
  })

  useEffect(() => {
    if (!open) return
    setPolicyCode(mode === 'version' && source ? source.policyCode : '')
    setTitle(mode === 'version' && source ? source.title : '')
    setPolicyType(mode === 'version' && source ? source.policyType : 'GENERAL')
    setTargetType(mode === 'version' && source ? source.targetType : 'ALL')
    setEffectiveFrom(mode === 'version' && source ? source.effectiveFrom : localDate())
    setEffectiveTo(mode === 'version' && source ? source.effectiveTo ?? '' : '')
    setClauses(mode === 'version' && source
      ? source.clauses.map(({ clauseCode, content }) => ({ clauseCode, content }))
      : [{ clauseCode: '', content: '' }])
    mutation.reset()
  }, [open, mode, source?.policyId])

  const updateClause = (index: number, field: keyof PolicyClauseRequest, value: string) => {
    setClauses((current) => current.map((clause, clauseIndex) => (
      clauseIndex === index ? { ...clause, [field]: value } : clause
    )))
  }
  const clauseCodes = clauses.map((clause) => clause.clauseCode.trim())
  const valid = Boolean(
    (mode === 'version' || policyCodePattern.test(policyCode.trim()))
    && title.trim()
    && effectiveFrom
    && (!effectiveTo || effectiveTo >= effectiveFrom)
    && clauses.length
    && clauses.every((clause) => clauseCodePattern.test(clause.clauseCode.trim()) && clause.content.trim())
    && new Set(clauseCodes).size === clauseCodes.length,
  )

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{mode === 'create' ? '운영 정책 등록' : `${source?.policyCode ?? ''} 새 버전 생성`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            정책 원문은 덮어쓰지 않습니다. 새 정책과 새 버전은 임베딩 동기화 전까지 비활성 상태로 저장됩니다.
          </Alert>
          {mutation.error && <Alert severity="error">{errorMessage(mutation.error)}</Alert>}
          <TextField
            label="정책 코드"
            value={policyCode}
            onChange={(event) => setPolicyCode(event.target.value.toUpperCase())}
            disabled={mode === 'version'}
            required
            slotProps={{ htmlInput: { maxLength: 100, pattern: '[A-Z][A-Z0-9_-]{2,99}' } }}
          />
          <TextField
            label="정책 제목"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="policy-type-label">정책 유형</InputLabel>
              <Select
                labelId="policy-type-label"
                label="정책 유형"
                value={policyType}
                onChange={(event) => setPolicyType(event.target.value as ModerationPolicyType)}
              >
                {policyTypes.map((type) => <MenuItem key={type} value={type}>{policyTypeLabels[type]}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="policy-target-label">적용 대상</InputLabel>
              <Select
                labelId="policy-target-label"
                label="적용 대상"
                value={targetType}
                onChange={(event) => setTargetType(event.target.value as ModerationPolicyTargetType)}
              >
                {targetTypes.map((type) => <MenuItem key={type} value={type}>{targetTypeLabels[type]}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="적용 시작일"
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
              required
            />
            <TextField
              label="적용 종료일"
              type="date"
              value={effectiveTo}
              onChange={(event) => setEffectiveTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: effectiveFrom } }}
              fullWidth
            />
          </Stack>
          <Typography variant="h6">정책 조항</Typography>
          {clauses.map((clause, index) => (
            <Paper variant="outlined" className="clause-editor" key={index}>
              <Stack spacing={1.5}>
                <TextField
                  label={`조항 코드 ${index + 1}`}
                  value={clause.clauseCode}
                  onChange={(event) => updateClause(index, 'clauseCode', event.target.value.toUpperCase())}
                  required
                  slotProps={{ htmlInput: { maxLength: 100, pattern: '[A-Z][A-Z0-9_-]{0,99}' } }}
                />
                <TextField
                  label="조항 원문"
                  value={clause.content}
                  onChange={(event) => updateClause(index, 'content', event.target.value)}
                  multiline
                  minRows={3}
                  required
                  slotProps={{ htmlInput: { maxLength: 4000 } }}
                  helperText={`${clause.content.length}/4000`}
                />
                {clauses.length > 1 && (
                  <Button color="error" onClick={() => setClauses((current) => current.filter((_, item) => item !== index))}>
                    조항 삭제
                  </Button>
                )}
              </Stack>
            </Paper>
          ))}
          <Button
            variant="outlined"
            disabled={clauses.length >= 50}
            onClick={() => setClauses((current) => [...current, { clauseCode: '', content: '' }])}
          >
            조항 추가
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>취소</Button>
        <Button variant="contained" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
          {mutation.isPending ? '저장 중…' : '비활성 상태로 저장'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function ActivationDialog({
  policy,
  open,
  onClose,
}: {
  policy: PolicyDetail
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const nextActive = !policy.active
  const mutation = useMutation({
    mutationFn: () => updatePolicyActivation(policy.policyId, nextActive),
    onSuccess: async (updated) => {
      await refreshPolicyCachesAfterActivation(queryClient, updated)
      onClose()
    },
  })

  useEffect(() => {
    if (open) mutation.reset()
  }, [open, policy.policyId])

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>정책 {nextActive ? '활성화' : '비활성화'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity={nextActive ? 'warning' : 'info'}>
            {nextActive
              ? '활성화하면 유효 기간과 대상 조건에 따라 AI 정책 검색에 즉시 사용됩니다. 같은 정책 코드의 다른 활성 버전은 자동으로 비활성화됩니다.'
              : '비활성화하면 새로운 신고 분석의 정책 검색에서 제외됩니다. 기존 분석 이력은 유지됩니다.'}
          </Alert>
          {mutation.error && <Alert severity="error">{errorMessage(mutation.error)}</Alert>}
          <Typography><strong>{policy.policyCode}</strong> · {policy.title} · v{policy.version}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>취소</Button>
        <Button
          variant="contained"
          color={nextActive ? 'warning' : 'primary'}
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || (nextActive && !canActivatePolicy(policy))}
        >
          {mutation.isPending ? '처리 중…' : nextActive ? '활성화' : '비활성화'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function PolicyTable({
  policies,
  selectedId,
  onSelect,
}: {
  policies: PolicySummary[]
  selectedId: number | null
  onSelect: (policyId: number) => void
}) {
  if (!policies.length) return <Box className="empty-state">조건에 맞는 운영 정책이 없습니다.</Box>
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>정책</TableCell>
            <TableCell>대상</TableCell>
            <TableCell>버전</TableCell>
            <TableCell>임베딩</TableCell>
            <TableCell>상태</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {policies.map((policy) => (
            <TableRow
              key={policy.policyId}
              hover
              selected={policy.policyId === selectedId}
              onClick={() => onSelect(policy.policyId)}
              className="report-row"
            >
              <TableCell>
                <strong>{policy.policyCode}</strong>
                <Typography variant="body2" color="text.secondary">{policy.title}</Typography>
              </TableCell>
              <TableCell>{targetTypeLabels[policy.targetType]}</TableCell>
              <TableCell>v{policy.version}</TableCell>
              <TableCell>{policy.missingEmbeddingCount ? `${policy.missingEmbeddingCount}개 누락` : '완료'}</TableCell>
              <TableCell><Chip size="small" color={policy.active ? 'success' : 'default'} label={policy.active ? '활성' : '비활성'} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function PolicyDetailPanel({
  policy,
  onCreateVersion,
  onChangeActivation,
}: {
  policy: PolicyDetail
  onCreateVersion: () => void
  onChangeActivation: () => void
}) {
  return (
    <Paper className="detail-panel" elevation={0}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6">{policy.policyCode} · v{policy.version}</Typography>
          <Typography color="text.secondary">{policy.title}</Typography>
        </Box>
        <Chip color={policy.active ? 'success' : 'default'} label={policy.active ? '활성' : '비활성'} />
      </Stack>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Chip size="small" label={policyTypeLabels[policy.policyType]} />
        <Chip size="small" label={`대상: ${targetTypeLabels[policy.targetType]}`} />
        <Chip size="small" label={`${policy.effectiveFrom} ~ ${policy.effectiveTo ?? '종료일 없음'}`} />
      </Stack>
      {policy.missingEmbeddingCount > 0 ? (
        <Alert severity="warning">
          임베딩이 없는 조항이 {policy.missingEmbeddingCount}개 있습니다. 동기화 스크립트를 실행하기 전에는 활성화할 수 없습니다.
        </Alert>
      ) : (
        <Alert severity="success">모든 조항이 {policy.embeddingModel} 임베딩을 가지고 있습니다.</Alert>
      )}
      <Box className="detail-section">
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>정책 조항</Typography>
        {policy.clauses.map((clause) => (
          <Paper variant="outlined" className="policy-clause" key={clause.policyChunkId}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{clause.clauseCode}</strong>
              <Chip size="small" color={clause.embedded ? 'success' : 'warning'} label={clause.embedded ? '임베딩 완료' : '임베딩 필요'} />
            </Stack>
            <Typography className="policy-content">{clause.content}</Typography>
          </Paper>
        ))}
      </Box>
      <Box className="detail-section">
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>변경 이력</Typography>
        {policy.audits.map((audit) => (
          <Box className="history-row" key={audit.auditId}>
            <Typography sx={{ fontWeight: 700 }}>{auditLabels[audit.action]}</Typography>
            <Typography variant="body2" color="text.secondary">
              {audit.administratorNickname} · {formatDate(audit.createdAt)}
            </Typography>
          </Box>
        ))}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="outlined" onClick={onCreateVersion}>새 버전 생성</Button>
        <Button
          variant="contained"
          color={policy.active ? 'primary' : 'warning'}
          onClick={onChangeActivation}
          disabled={!policy.active && !canActivatePolicy(policy)}
        >
          {policy.active ? '비활성화' : '활성화'}
        </Button>
      </Stack>
    </Paper>
  )
}

export default function PolicyManagement() {
  const [filters, setFilters] = useState<PolicyFilters>({ policyCode: '', active: '', page: 0 })
  const [policyCodeInput, setPolicyCodeInput] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editorMode, setEditorMode] = useState<'create' | 'version'>('create')
  const [editorOpen, setEditorOpen] = useState(false)
  const [activationOpen, setActivationOpen] = useState(false)
  const policiesQuery = useQuery({
    queryKey: ['policies', filters],
    queryFn: () => getPolicies(filters),
  })
  const detailQuery = useQuery({
    queryKey: ['policy', selectedId],
    queryFn: () => getPolicy(selectedId!),
    enabled: selectedId !== null,
  })

  useEffect(() => {
    if (policiesQuery.isPending) return
    const policies = policiesQuery.data?.content ?? []
    if (!policies.length) {
      setSelectedId(null)
      return
    }
    if (!policies.some((policy) => policy.policyId === selectedId)) {
      setSelectedId(policies[0].policyId)
    }
  }, [policiesQuery.data, selectedId])

  useEffect(() => {
    const totalPages = policiesQuery.data?.totalPages
    if (totalPages === undefined) return
    setFilters((current) => {
      const page = Math.max(0, Math.min(current.page, totalPages - 1))
      return page === current.page ? current : { ...current, page }
    })
  }, [policiesQuery.data?.totalPages])

  const detail = detailQuery.data ?? null
  return (
    <>
      <Container maxWidth="xl" className="page-container">
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h5">운영 정책 관리</Typography>
            <Typography color="text.secondary">정책 버전과 조항 임베딩 상태를 확인하고 AI 검색에 사용할 버전을 활성화합니다.</Typography>
          </Box>
          <Button
            variant="contained"
            onClick={() => {
              setEditorMode('create')
              setEditorOpen(true)
            }}
          >
            새 정책 등록
          </Button>
        </Stack>
        {policiesQuery.error && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage(policiesQuery.error)}</Alert>}
        <Box className="console-grid">
          <Paper className="list-panel" elevation={0}>
            <Stack direction={{ xs: 'column', sm: 'row' }} className="filter-bar" spacing={1.5}>
              <TextField
                size="small"
                label="정책 코드"
                value={policyCodeInput}
                onChange={(event) => setPolicyCodeInput(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setFilters((current) => ({ ...current, policyCode: policyCodeInput, page: 0 }))
                }}
              />
              <Button variant="outlined" onClick={() => setFilters((current) => ({ ...current, policyCode: policyCodeInput, page: 0 }))}>
                검색
              </Button>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel id="policy-active-filter-label">활성 상태</InputLabel>
                <Select
                  labelId="policy-active-filter-label"
                  label="활성 상태"
                  value={filters.active}
                  onChange={(event) => setFilters((current) => ({ ...current, active: event.target.value as PolicyFilters['active'], page: 0 }))}
                >
                  <MenuItem value="">전체</MenuItem>
                  <MenuItem value="true">활성</MenuItem>
                  <MenuItem value="false">비활성</MenuItem>
                </Select>
              </FormControl>
              <Typography color="text.secondary" sx={{ alignSelf: 'center', ml: { sm: 'auto' } }}>
                총 {policiesQuery.data?.totalElements ?? 0}건
              </Typography>
            </Stack>
            {policiesQuery.isPending
              ? <Box className="loading"><CircularProgress size={30} /></Box>
              : <PolicyTable policies={policiesQuery.data?.content ?? []} selectedId={selectedId} onSelect={setSelectedId} />}
            {(policiesQuery.data?.totalPages ?? 0) > 1 && (
              <Pagination
                page={filters.page + 1}
                count={policiesQuery.data?.totalPages ?? 1}
                onChange={(_, page) => setFilters((current) => ({ ...current, page: page - 1 }))}
                className="pagination"
              />
            )}
          </Paper>
          <Box>
            {detailQuery.isPending && selectedId && <Box className="loading"><CircularProgress size={30} /></Box>}
            {detailQuery.error && <Alert severity="error">{errorMessage(detailQuery.error)}</Alert>}
            {detail && (
              <PolicyDetailPanel
                policy={detail}
                onCreateVersion={() => {
                  setEditorMode('version')
                  setEditorOpen(true)
                }}
                onChangeActivation={() => setActivationOpen(true)}
              />
            )}
          </Box>
        </Box>
      </Container>
      <PolicyEditorDialog
        mode={editorMode}
        source={detail}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={(policy) => {
          setPolicyCodeInput(policy.policyCode)
          setFilters(filtersForSavedPolicy(policy.policyCode))
          setSelectedId(policy.policyId)
        }}
      />
      {detail && (
        <ActivationDialog policy={detail} open={activationOpen} onClose={() => setActivationOpen(false)} />
      )}
    </>
  )
}
