export type ReportReviewStatus = 'PENDING' | 'RESOLVED'
export type AnalysisStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT'
export type ReportTargetType = 'MEMBER' | 'CHAT_MESSAGE' | 'MEETING'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ModerationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type RecommendedAction =
  | 'DISMISS'
  | 'WARNING'
  | 'SUSPEND_1_DAY'
  | 'SUSPEND_3_DAYS'
  | 'SUSPEND_7_DAYS'
  | 'PERMANENT_SUSPENSION'
  | 'FORCE_DELETE_MEETING'
  | 'MANUAL_REVIEW'
export type ModerationAction =
  | 'DISMISS'
  | 'WARNING'
  | 'SUSPEND_1_DAY'
  | 'SUSPEND_3_DAYS'
  | 'SUSPEND_7_DAYS'
  | 'PERMANENT_SUSPENSION'
  | 'FORCE_DELETE_MEETING'
  | 'RELEASE_SUSPENSION'
  | 'RESTORE_MEETING'
export type SuspensionAction =
  | 'SUSPEND_1_DAY'
  | 'SUSPEND_3_DAYS'
  | 'SUSPEND_7_DAYS'
  | 'PERMANENT_SUSPENSION'

export interface ApiResponse<T> {
  status: number
  success: boolean
  code: number
  message: string
  data: T
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  accessTokenExpiresIn: number
  refreshTokenExpiresIn: number
}

export interface ReportSummary {
  reportId: number
  targetType: ReportTargetType
  targetId: number
  targetMemberId: number | null
  targetNickname: string | null
  reason: string
  reviewStatus: ReportReviewStatus
  analysisStatus: AnalysisStatus | null
  riskLevel: RiskLevel | null
  priority: ModerationPriority | null
  confidence: number | null
  recommendedAction: RecommendedAction | null
  automaticWarningIssued: boolean
  createdAt: string
  resolvedAt: string | null
}

export interface AnalysisDetail {
  status: AnalysisStatus
  reportType: string | null
  riskLevel: RiskLevel | null
  priority: ModerationPriority | null
  summary: string | null
  rationale: string | null
  confidence: number | null
  recommendedAction: RecommendedAction | null
  failureCode: string | null
  completedAt: string | null
}

export interface PolicyBasis {
  policyId: number
  policyCode: string
  title: string
  version: number
}

export interface WarningHistory {
  reportId: number
  targetMemberId: number
  createdAt: string
}

export interface ActionHistory {
  actionId: number
  reportId: number
  administratorMemberId: number
  administratorNickname: string
  actionType: ModerationAction
  targetMemberId: number | null
  targetMeetingId: number | null
  reason: string
  effectiveUntil: string | null
  createdAt: string
}

export interface TargetState {
  memberId: number | null
  suspendedUntil: string | null
  permanentlySuspendedAt: string | null
  suspensionReportId: number | null
  meetingId: number | null
  meetingDeletedAt: string | null
  meetingDeletionReportId: number | null
}

export interface ReportDetail {
  report: ReportSummary
  reporterMemberId: number
  reporterNickname: string
  otherDescription: string | null
  evidenceContent: string | null
  analysis: AnalysisDetail | null
  policyBasis: PolicyBasis[]
  warnings: WarningHistory[]
  actions: ActionHistory[]
  targetState: TargetState
}

export interface ReportFilters {
  reviewStatus: ReportReviewStatus | ''
  analysisStatus: AnalysisStatus | ''
  page: number
}

export type ModerationPolicyType =
  | 'SPAM'
  | 'ABUSE_OR_HARASSMENT'
  | 'INAPPROPRIATE_CONTENT'
  | 'FRAUD_OR_FALSE_INFORMATION'
  | 'SAFETY'
  | 'GENERAL'
export type ModerationPolicyTargetType = 'ALL' | 'MEMBER' | 'MEETING' | 'CHAT_MESSAGE'
export type PolicyAuditAction = 'CREATED' | 'VERSION_CREATED' | 'ACTIVATED' | 'DEACTIVATED'

export interface PolicyFilters {
  policyCode: string
  active: '' | 'true' | 'false'
  page: number
}

export interface PolicySummary {
  policyId: number
  policyCode: string
  title: string
  policyType: ModerationPolicyType
  targetType: ModerationPolicyTargetType
  effectiveFrom: string
  effectiveTo: string | null
  active: boolean
  version: number
  clauseCount: number
  missingEmbeddingCount: number
  createdAt: string
  updatedAt: string
}

export interface PolicyClause {
  policyChunkId: number
  clauseCode: string
  chunkOrder: number
  content: string
  contentHash: string
  embedded: boolean
}

export interface PolicyAudit {
  auditId: number
  administratorMemberId: number
  administratorNickname: string
  action: PolicyAuditAction
  createdAt: string
}

export interface PolicyDetail extends Omit<PolicySummary, 'clauseCount'> {
  embeddingModel: string
  clauses: PolicyClause[]
  audits: PolicyAudit[]
}

export interface PolicyClauseRequest {
  clauseCode: string
  content: string
}

export interface CreatePolicyVersionRequest {
  title: string
  policyType: ModerationPolicyType
  targetType: ModerationPolicyTargetType
  effectiveFrom: string
  effectiveTo: string | null
  clauses: PolicyClauseRequest[]
}

export interface CreatePolicyRequest extends CreatePolicyVersionRequest {
  policyCode: string
}
