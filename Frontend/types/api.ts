export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;
export type DecimalValue = number | string;
export type CustomFieldValue = string | number | boolean;
export type CustomFields = Record<string, CustomFieldValue>;
export type JsonRecord = Record<string, unknown>;

export type UserRole =
  | "super_admin"
  | "sales_manager"
  | "sales_rep"
  | "marketing_manager"
  | "marketing_rep"
  | "customer_success"
  | "read_only";

export interface User {
  id: UUID;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface UserCreate {
  email: string;
  full_name: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface UserUpdate {
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
}

export type LeadStatus =
  "new" | "contacted" | "qualified" | "disqualified" | "converted";
export type LeadSource =
  "website" | "referral" | "social" | "cold_outreach" | "event" | "campaign";

export interface Lead {
  id: UUID;
  full_name: string;
  email: string;
  phone: string;
  company: string;
  source: LeadSource;
  score: number;
  status: LeadStatus;
  assigned_to: UUID;
  assigned_to_name?: string | null;
  campaign_id?: UUID | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  converted_at?: ISODateTime | null;
  is_active: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface LeadCreate {
  full_name: string;
  email: string;
  phone: string;
  company: string;
  source: LeadSource;
  score?: number;
  status?: LeadStatus;
  assigned_to?: UUID | null;
  campaign_id?: UUID | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
}

export interface LeadUpdate {
  full_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: LeadSource;
  score?: number;
  status?: LeadStatus;
  assigned_to?: UUID | null;
  campaign_id?: UUID | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  is_active?: boolean;
}

export interface LeadAssignRequest {
  user_id?: UUID | null;
  method?: "manual" | "round_robin" | "territory";
  territory?: string | null;
}

export interface LeadConvertRequest {
  account_id?: string | null;
  currency?: string;
  expected_close?: string | null;
  create_account: boolean;
  account_name?: string | null;
  create_deal?: boolean;
  deal_title?: string | null;
  deal_value?: DecimalValue | null;
  pipeline_id?: UUID | null;
}

export interface LeadConvertResponse {
  lead: Lead;
  contact_id: UUID;
  account_id?: UUID | null;
  deal_id?: UUID | null;
}

export interface LeadImportSummary {
  imported: number;
  skipped: number;
  errors: Array<{
    row: number;
    reason: string;
  }>;
}

export interface DuplicateLeadPair {
  lead_id: UUID;
  duplicate_lead_id: UUID;
  similarity_score: number;
  reason: string;
}

export interface LeadScoreResponse {
  lead_id: UUID;
  score: number;
}

export interface LeadMergeRequest {
  primary_lead_id: UUID;
  duplicate_lead_id: UUID;
}

export type AccountTier = "enterprise" | "smb" | "startup";
export type ContactSortBy = "created_at" | "last_name" | "company";

export interface Contact {
  email_opted_out_at?: string | null;
  id: UUID;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  account_id?: UUID | null;
  account_name?: string | null;
  owner_id: UUID;
  owner_name?: string | null;
  tags: string[];
  custom_fields: CustomFields;
  is_active: boolean;
  sms_opted_in_at?: ISODateTime | null;
  sms_opted_out_at?: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ContactCreate {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  account_id?: UUID | null;
  owner_id?: UUID | null;
  tags?: string[];
  custom_fields?: CustomFields;
  sms_opted_in_at?: ISODateTime | null;
  sms_opted_out_at?: ISODateTime | null;
}

export interface ContactUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  title?: string;
  account_id?: UUID | null;
  owner_id?: UUID | null;
  tags?: string[];
  custom_fields?: CustomFields;
  is_active?: boolean;
  sms_opted_in_at?: ISODateTime | null;
  sms_opted_out_at?: ISODateTime | null;
}

export interface ContactTimelineItem {
  id: UUID;
  type: "activity" | "task" | "note" | "deal";
  title: string;
  occurred_at: ISODateTime;
  description?: string | null;
  metadata: JsonRecord;
}

export interface ContactTagsUpdate {
  tags: string[];
}

export interface Account {
  id: UUID;
  name: string;
  industry: string;
  size: string;
  website: string;
  address: JsonRecord;
  tier: AccountTier;
  owner_id: UUID;
  owner_name?: string | null;
  custom_fields: CustomFields;
  is_active: boolean;
  linked_contact_count?: number;
  contact_count?: number;
  total_deal_value?: DecimalValue;
  deal_values_by_currency?: Record<string, DecimalValue>;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AccountDeal {
  id: UUID;
  title: string;
  value: DecimalValue;
  currency: string;
  status: DealStatus;
  expected_close: ISODate;
  contact_id: UUID;
  account_id: UUID;
  owner_id: UUID;
  stage_name?: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AccountCreate {
  name: string;
  industry: string;
  size: string;
  website: string;
  address?: JsonRecord;
  tier: AccountTier;
  owner_id?: UUID | null;
  custom_fields?: CustomFields;
}

export interface AccountUpdate {
  name?: string;
  industry?: string;
  size?: string;
  website?: string;
  address?: JsonRecord;
  tier?: AccountTier;
  owner_id?: UUID | null;
  custom_fields?: CustomFields;
  is_active?: boolean;
}

export type DealStatus = "open" | "won" | "lost";

export interface Pipeline {
  id: UUID;
  name: string;
  is_default: boolean;
  stages: PipelineStage[];
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface PipelineCreate {
  name: string;
  is_default?: boolean;
  stages?: PipelineStageCreate[];
}

export interface PipelineUpdate {
  name?: string;
  is_default?: boolean;
}

export interface PipelineStage {
  id: UUID;
  pipeline_id: UUID;
  name: string;
  probability: number;
  order_index: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface PipelineStageCreate {
  name: string;
  probability: number;
  order_index: number;
}

export interface PipelineStageUpdate {
  name?: string;
  probability?: number;
  order_index?: number;
}

export interface SmsSettings {
  id: UUID;
  api_key_set: boolean;
  api_key_preview: string | null;
  identifier_id: string | null;
  sender_name: string | null;
  base_url: string;
  send_path: string;
  method: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface SmsSettingsUpdate {
  api_key?: string | null;
  identifier_id?: string | null;
  sender_name?: string | null;
  base_url?: string;
  send_path?: string;
  method?: string;
}

export interface DealSummary {
  id: UUID;
  title: string;
  type: string;
  value: DecimalValue;
  currency: string;
  probability: number;
  expected_close: ISODate;
  status: DealStatus;
  owner_id: UUID;
  stage_id: UUID;
  account_id: UUID;
  contact_id: UUID;
}

export interface Deal extends DealSummary {
  pipeline_id: UUID;
  pipeline_name?: string | null;
  stage_name?: string | null;
  contact_name?: string | null;
  account_name?: string | null;
  owner_name?: string | null;
  lost_reason?: string | null;
  closed_at?: ISODateTime | null;
  is_active: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface DealCreate {
  title: string;
  type?: string;
  value: DecimalValue;
  currency?: string;
  pipeline_id: UUID;
  stage_id?: UUID | null;
  probability?: number | null;
  expected_close: ISODate;
  contact_id: UUID;
  account_id: UUID;
  owner_id?: UUID | null;
}

export interface DealUpdate {
  title?: string;
  type?: string;
  value?: DecimalValue;
  currency?: string;
  pipeline_id?: UUID;
  stage_id?: UUID;
  probability?: number | null;
  expected_close?: ISODate;
  contact_id?: UUID;
  account_id?: UUID;
  owner_id?: UUID | null;
  status?: DealStatus;
  lost_reason?: string | null;
  is_active?: boolean;
}

export interface DealActivity {
  id: UUID;
  type: ActivityType;
  subject: string;
  body: string;
  outcome?: string | null;
  scheduled_at?: ISODateTime | null;
  completed_at?: ISODateTime | null;
  created_at: ISODateTime;
}

export interface DealTask {
  id: UUID;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at?: ISODateTime | null;
  completed_at?: ISODateTime | null;
  created_at: ISODateTime;
}

export interface DealCollaborator {
  user_id: UUID;
  role: string;
  user_name?: string | null;
}

export interface DealStageHistory {
  id: UUID;
  deal_id: UUID;
  from_stage_id?: UUID | null;
  to_stage_id: UUID;
  changed_by?: UUID | null;
  note?: string | null;
  created_at: ISODateTime;
}

export interface DealDetailResponse extends Deal {
  activities: DealActivity[];
  tasks: DealTask[];
  collaborators: DealCollaborator[];
  stage_history: DealStageHistory[];
}

export interface DealMoveStageRequest {
  stage_id: UUID;
  lost_reason?: string | null;
}

export interface DealLostRequest {
  lost_reason: string;
}

export interface DealCollaboratorCreate {
  user_id: UUID;
  role?: string;
}

export interface KanbanStage {
  stage_id: UUID;
  name: string;
  probability: number;
  deals: DealSummary[];
}

export interface DealKanbanResponse {
  stages: KanbanStage[];
}

export interface ForecastStage {
  stage: string;
  count: number;
  value: number;
  weighted: number;
}

export interface DealForecastResponse {
  total_weighted: number;
  total_open: number;
  by_stage: ForecastStage[];
}

export type ActivityType = "call" | "email" | "meeting" | "note" | "task";
export type TaskStatus =
  "pending" | "in_progress" | "completed" | "cancelled" | "overdue";
export type StoredTaskStatus = Exclude<TaskStatus, "overdue">;
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface LinkedEntityIds {
  lead_id?: UUID | null;
  contact_id?: UUID | null;
  deal_id?: UUID | null;
  account_id?: UUID | null;
}

export interface Activity extends LinkedEntityIds {
  id: UUID;
  type: ActivityType;
  subject: string;
  body: string;
  outcome?: string | null;
  duration_minutes?: number | null;
  owner_id: UUID;
  owner_name?: string | null;
  scheduled_at?: ISODateTime | null;
  completed_at?: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ActivityCreate extends LinkedEntityIds {
  type: Exclude<ActivityType, "task">;
  subject: string;
  body: string;
  outcome?: string | null;
  duration_minutes?: number | null;
  owner_id?: UUID | null;
  scheduled_at?: ISODateTime | null;
  completed_at?: ISODateTime | null;
}

export interface ActivityUpdate extends Partial<ActivityCreate> {
  type?: Exclude<ActivityType, "task">;
}

export interface EmailLogCreate {
  from: string;
  to: string;
  subject: string;
  body: string;
  contact_email: string;
}

export interface Task extends LinkedEntityIds {
  id: UUID;
  title: string;
  description?: string | null;
  type?: ActivityType;
  status: TaskStatus;
  priority: TaskPriority;
  activity_id?: UUID | null;
  owner_id: UUID;
  owner_name?: string | null;
  assigned_to?: UUID;
  assigned_to_name?: string | null;
  lead_name?: string | null;
  contact_name?: string | null;
  deal_name?: string | null;
  account_name?: string | null;
  due_at?: ISODateTime | null;
  completed_at?: ISODateTime | null;
  snoozed_until?: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface TaskCreate extends LinkedEntityIds {
  title: string;
  description?: string | null;
  type?: ActivityType;
  status?: StoredTaskStatus;
  priority?: TaskPriority;
  due_at?: ISODateTime | null;
  activity_id?: UUID | null;
  owner_id?: UUID | null;
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  type?: ActivityType;
  status?: StoredTaskStatus;
  priority?: TaskPriority;
  due_at?: ISODateTime | null;
  completed_at?: ISODateTime | null;
  activity_id?: UUID | null;
  lead_id?: UUID | null;
  contact_id?: UUID | null;
  deal_id?: UUID | null;
  account_id?: UUID | null;
  owner_id?: UUID | null;
}

export interface TaskSnoozeRequest {
  new_due: ISODateTime;
}

export type CampaignType = "email" | "sms" | "event" | "social" | "cold_call";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type CampaignEnrollmentStatus = "active" | "completed" | "unsubscribed";
export type CampaignSequenceChannel =
  "email" | "sms" | "call" | "task" | "social";
export type CampaignMetricEventType =
  "sent" | "opened" | "clicked" | "replied" | "converted";

export interface CampaignMetrics {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  converted: number;
}

export interface Campaign {
  id: UUID;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  start_date: ISODate;
  end_date: ISODate;
  target_segment: JsonRecord;
  budget: DecimalValue;
  owner_id: UUID;
  owner_name?: string | null;
  enrollment_count: number;
  metrics: CampaignMetrics;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CampaignCreate {
  name: string;
  type: CampaignType;
  status?: CampaignStatus;
  start_date: ISODate;
  end_date: ISODate;
  target_segment?: JsonRecord;
  budget: DecimalValue;
  owner_id?: UUID | null;
}

export interface CampaignUpdate {
  name?: string;
  type?: CampaignType;
  status?: CampaignStatus;
  start_date?: ISODate;
  end_date?: ISODate;
  target_segment?: JsonRecord;
  budget?: DecimalValue;
  owner_id?: UUID | null;
}

export interface CampaignEnrollment {
  id: UUID;
  campaign_id: UUID;
  contact_id: UUID;
  contact_name?: string | null;
  contact_email?: string | null;
  enrolled_at: ISODateTime;
  step_index: number;
  status: CampaignEnrollmentStatus;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CampaignEnrollRequest {
  contact_ids: UUID[];
}

export interface CampaignSequenceStep {
  id: UUID;
  campaign_id: UUID;
  step_index: number;
  channel: CampaignSequenceChannel;
  subject: string;
  body?: string | null;
  delay_days: number;
  variant?: "A" | "B" | string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CampaignStepCreate {
  subject: string;
  body?: string | null;
  delay_days?: number;
  variant?: string | null;
  channel?: CampaignSequenceChannel;
}

export interface CampaignStepUpdate {
  subject?: string;
  body?: string | null;
  delay_days?: number;
  variant?: string | null;
  channel?: CampaignSequenceChannel;
}

export interface CampaignStepsReorderRequest {
  step_ids: UUID[];
}

export interface CampaignMetric {
  id: UUID;
  campaign_id: UUID;
  contact_id: UUID;
  step_id?: UUID | null;
  event_type: CampaignMetricEventType;
  created_at: ISODateTime;
}

export interface CampaignMetricCreate {
  contact_id: UUID;
  event_type: CampaignMetricEventType;
  step_id?: UUID | null;
}

export type ProjectHealth = "green" | "yellow" | "red";

export interface Project {
  portal_enabled: boolean;
  portal_expires_at: string | null;
  id: UUID;
  name: string;
  account_id: UUID;
  account_name?: string | null;
  deal_id?: UUID | null;
  status: string;
  start_date: ISODate;
  end_date?: ISODate | null;
  health: ProjectHealth;
  owner_id: UUID;
  owner_name?: string | null;
  portal_token: UUID;
  is_active: boolean;
  milestones: Milestone[];
  documents: ProjectDocument[];
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ProjectCreate {
  name: string;
  account_id: UUID;
  deal_id?: UUID | null;
  status?: string;
  start_date: ISODate;
  end_date: ISODate;
  health?: ProjectHealth;
  owner_id?: UUID | null;
}

export interface ProjectUpdate {
  portal_enabled?: boolean;
  portal_expires_at?: string | null;
  name?: string;
  status?: string;
  start_date?: ISODate;
  end_date?: ISODate;
  health?: ProjectHealth;
  owner_id?: UUID | null;
  is_active?: boolean;
}

export interface Milestone {
  id: UUID;
  project_id: UUID;
  title: string;
  due_date: ISODate;
  completed_at?: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface MilestoneCreate {
  title: string;
  due_date: ISODate;
}

export interface MilestoneUpdate {
  title?: string;
  due_date?: ISODate;
  completed_at?: ISODateTime | null;
}

export interface ProjectDocument {
  customer_visible: boolean;
  id: UUID;
  project_id: UUID;
  filename: string;
  file_size: number;
  mime_type?: string | null;
  storage_key: string;
  download_url: string;
  uploaded_by: UUID;
  description?: string | null;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface ProjectPortalMilestone {
  title: string;
  due_date: ISODate;
  completed: boolean;
}

export interface ProjectPortal {
  project_name: string;
  account_name?: string | null;
  health: ProjectHealth;
  milestones: ProjectPortalMilestone[];
  status: string;
  start_date: ISODate;
  end_date: ISODate;
}

export interface PipelineSummaryRow {
  stage_id?: UUID | null;
  stage: string;
  probability: number;
  count: number;
  total_value: number;
  weighted_value: number;
}

export interface DealVelocityRow {
  stage_id?: UUID | null;
  stage: string;
  avg_days: number;
}

export interface WinLossRow {
  group?: string | null;
  status: string;
  count: number;
  value: number;
}

export interface ForecastMonthRow {
  month: string;
  count: number;
  open_value: number;
  weighted_value: number;
}

export interface QuotaRow {
  user_id: UUID;
  rep_name?: string | null;
  quota: number;
  won_value: number;
  attainment_percent: number;
}

export interface LeadVolumeRow {
  group: string;
  count: number;
}

export interface LeadFunnelResponse {
  total_leads: number;
  qualified_leads: number;
  converted_leads: number;
  won_deals: number;
  qualification_rate: number;
  conversion_rate: number;
  win_rate: number;
}

export interface LeadResponseTimeRow {
  rep_id?: UUID | null;
  rep_name?: string | null;
  avg_hours?: number | null;
}

export interface ActivityVolumeRow {
  activity_type: string;
  rep_id?: UUID | null;
  rep_name?: string | null;
  count: number;
}

export interface OverdueTaskRow {
  id: UUID;
  title: string;
  due_at: ISODateTime;
  owner_id: UUID;
  assignee_name?: string | null;
  linked_to?: string | null;
  linked_type?: string | null;
}

export interface SequencePerformanceRow {
  campaign_id: UUID;
  campaign_name: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  converted: number;
}

export interface CustomerHealthRow {
  project_id: UUID;
  project_name: string;
  account_name?: string | null;
  owner_name?: string | null;
  health: string;
  status: string;
}

export interface RenewalPipelineRow {
  deal_id: UUID;
  title: string;
  account_name?: string | null;
  owner_name?: string | null;
  stage?: string | null;
  value: number;
  weighted_value: number;
  expected_close: ISODate;
}

export interface DashboardWidget {
  open_deals_count: number;
  open_deals_value: number;
  leads_this_month: number;
  leads_last_month: number;
  overdue_tasks_count: number;
  activities_this_week: number;
  pipeline_by_stage: PipelineSummaryRow[];
}

export type DashboardResponse = DashboardWidget;

export type CustomReportEntity = "deals" | "leads" | "contacts" | "activities";
export type CustomReportOperator =
  "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";

export interface CustomReportFilter {
  field: string;
  operator: CustomReportOperator;
  value: unknown;
}

export interface CustomReportDateRange {
  from?: ISODate | null;
  to?: ISODate | null;
  field: string;
}

export interface CustomReportRequest {
  entity: CustomReportEntity;
  fields: string[];
  filters?: CustomReportFilter[];
  group_by?: string | null;
  sort_by?: string | null;
  sort_dir?: "asc" | "desc";
  date_range?: CustomReportDateRange | null;
}

export interface CustomReportResponse {
  columns: string[];
  rows: unknown[][];
  total: number;
}

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  url: string;
}

export interface GlobalSearchResponse {
  contacts: SearchResult[];
  deals: SearchResult[];
  accounts: SearchResult[];
  leads: SearchResult[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface PageParams {
  page?: number;
  page_size?: number;
}

export interface ApiErrorPayload {
  status: number;
  detail: string;
  code: string;
}
