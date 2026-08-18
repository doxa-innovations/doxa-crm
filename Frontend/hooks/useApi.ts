"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

import { api, type QueryParams } from "@/lib/api";
import type {
  Account,
  AccountCreate,
  AccountTier,
  AccountUpdate,
  Activity,
  ActivityCreate,
  ActivityType,
  Campaign,
  CampaignCreate,
  CampaignEnrollment,
  CampaignEnrollRequest,
  CampaignMetrics,
  CampaignSequenceStep,
  CampaignStatus,
  CampaignStepCreate,
  CampaignStepsReorderRequest,
  CampaignStepUpdate,
  CampaignType,
  CampaignUpdate,
  Contact,
  ContactCreate,
  ContactSortBy,
  ContactTimelineItem,
  ContactUpdate,
  DashboardResponse,
  Deal,
  DealCreate,
  DealForecastResponse,
  DealDetailResponse,
  DealKanbanResponse,
  DealLostRequest,
  DealMoveStageRequest,
  DealStatus,
  DealUpdate,
  GlobalSearchResponse,
  Lead,
  LeadConvertRequest,
  LeadConvertResponse,
  LeadFunnelResponse,
  LeadImportSummary,
  LeadSource,
  LeadStatus,
  LeadUpdate,
  LeadCreate,
  LeadVolumeRow,
  Pipeline,
  PipelineSummaryRow,
  Project,
  ProjectHealth,
  ProjectUpdate,
  Task,
  TaskSnoozeRequest,
  TaskStatus,
  User,
  UserCreate,
  UserUpdate,
  UUID,
} from "@/types/api";

export interface LeadsParams extends PageParams {
  status?: LeadStatus;
  source?: LeadSource;
  score?: number;
  min_score?: number;
  max_score?: number;
  assigned_to?: UUID;
  exclude_converted?: boolean;
}

export interface ContactsParams extends PageParams {
  search?: string;
  account_id?: UUID;
  owner_id?: UUID;
  tag?: string;
  sort_by?: ContactSortBy;
}

export interface AccountsParams extends PageParams {
  tier?: AccountTier;
  owner_id?: UUID;
}

export interface DealsParams extends PageParams {
  pipeline_id?: UUID;
  stage_id?: UUID;
  owner_id?: UUID;
  status?: DealStatus;
  date_from?: string;
  date_to?: string;
}

export interface DealForecastParams {
  pipeline_id?: UUID;
  date_from?: string;
  date_to?: string;
  owner_id?: UUID;
}

export interface TasksParams extends PageParams {
  status?: TaskStatus;
  owner_id?: UUID;
  overdue?: boolean;
  lead_id?: UUID;
  contact_id?: UUID;
  deal_id?: UUID;
  account_id?: UUID;
}

export interface ActivitiesParams extends PageParams {
  type?: ActivityType;
  owner_id?: UUID;
  lead_id?: UUID;
  contact_id?: UUID;
  deal_id?: UUID;
  account_id?: UUID;
  date_from?: string;
  date_to?: string;
}

export interface CampaignsParams extends PageParams {
  type?: CampaignType;
  status?: CampaignStatus;
  owner_id?: UUID;
}

export interface ProjectsParams extends PageParams {
  health?: ProjectHealth;
  owner_id?: UUID;
  account_id?: UUID;
}

export interface ReportsParams {
  pipeline_id?: UUID;
  owner_id?: UUID;
  date_from?: string;
  date_to?: string;
}

export interface LeadVolumeParams {
  date_from?: string;
  date_to?: string;
  group_by?: "source" | "campaign" | "week" | "month";
}

export interface PageParams {
  page?: number;
  page_size?: number;
}

interface UpdateVariables<TData> {
  id: UUID;
  data: TData;
}

interface ConvertLeadVariables {
  id: UUID;
  data: LeadConvertRequest;
}

interface ImportLeadsVariables {
  file: File;
}

interface MoveStageVariables {
  id: UUID;
  data: DealMoveStageRequest;
}

interface LoseDealVariables {
  id: UUID;
  data: DealLostRequest;
}

interface SnoozeTaskVariables {
  id: UUID;
  data: TaskSnoozeRequest;
}

interface CreateProjectFromDealVariables {
  dealId: UUID;
}

interface CampaignStepVariables<TData> {
  campaignId: UUID;
  data: TData;
}

interface UpdateCampaignStepVariables<TData> extends CampaignStepVariables<TData> {
  stepId: UUID;
}

const queryKeys = {
  account: (id: UUID) => ["accounts", "detail", id] as const,
  accountContacts: (id: UUID) => ["accounts", "contacts", id] as const,
  accounts: (params?: AccountsParams) => ["accounts", "list", params] as const,
  activities: (params?: ActivitiesParams) => ["activities", "list", params] as const,
  campaign: (id: UUID) => ["campaigns", "detail", id] as const,
  campaignMetrics: (id: UUID) => ["campaigns", "metrics", id] as const,
  campaignSteps: (id: UUID) => ["campaigns", "steps", id] as const,
  campaigns: (params?: CampaignsParams) => ["campaigns", "list", params] as const,
  contact: (id: UUID) => ["contacts", "detail", id] as const,
  contactTimeline: (id: UUID) => ["contacts", "timeline", id] as const,
  contacts: (params?: ContactsParams) => ["contacts", "list", params] as const,
  dashboard: () => ["reports", "dashboard"] as const,
  deal: (id: UUID) => ["deals", "detail", id] as const,
  dealForecast: (params?: DealForecastParams) => ["deals", "forecast", params] as const,
  deals: (params?: DealsParams) => ["deals", "list", params] as const,
  globalSearch: (q: string) => ["search", "global", q] as const,
  lead: (id: UUID) => ["leads", "detail", id] as const,
  leadFunnel: (params?: ReportsParams) => ["reports", "lead-funnel", params] as const,
  leadVolume: (params?: LeadVolumeParams) => ["reports", "lead-volume", params] as const,
  leads: (params?: LeadsParams) => ["leads", "list", params] as const,
  overdueTasks: () => ["tasks", "overdue"] as const,
  pipeline: (id: UUID) => ["pipelines", "detail", id] as const,
  pipelineSummary: (params?: ReportsParams) => ["reports", "pipeline-summary", params] as const,
  pipelines: () => ["pipelines", "list"] as const,
  project: (id: UUID) => ["projects", "detail", id] as const,
  projects: (params?: ProjectsParams) => ["projects", "list", params] as const,
  tasks: (params?: TasksParams) => ["tasks", "list", params] as const,
  users: () => ["users", "list"] as const,
};

function isQueryPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function toQueryParams<TParams extends object>(params?: TParams): QueryParams | undefined {
  if (!params) {
    return undefined;
  }

  const cleanParams: QueryParams = {};

  Object.entries(params).forEach(([key, value]) => {
    if (isQueryPrimitive(value)) {
      cleanParams[key] = value;
      return;
    }

    if (Array.isArray(value)) {
      cleanParams[key] = value.filter(isQueryPrimitive);
    }
  });

  return cleanParams;
}

function invalidate(queryClient: QueryClient, keys: QueryKey[]): void {
  keys.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey });
  });
}

export function useLeads(params?: LeadsParams) {
  return useQuery({
    queryFn: () => api.get<Lead[]>("/leads/", toQueryParams(params)),
    queryKey: queryKeys.leads(params),
  });
}

export function useLead(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<Lead>(`/leads/${id}`),
    queryKey: queryKeys.lead(id),
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LeadCreate) => api.post<Lead, LeadCreate>("/leads/", data),
    onSuccess: () => invalidate(queryClient, [queryKeys.leads(), queryKeys.dashboard()]),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: UpdateVariables<LeadUpdate>) => api.patch<Lead, LeadUpdate>(`/leads/${id}`, data),
    onSuccess: (lead) => invalidate(queryClient, [queryKeys.leads(), queryKeys.lead(lead.id), queryKeys.dashboard()]),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => api.delete<void>(`/leads/${id}`),
    onSuccess: () => invalidate(queryClient, [queryKeys.leads(), queryKeys.dashboard()]),
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: ConvertLeadVariables) => api.post<LeadConvertResponse, LeadConvertRequest>(`/leads/${id}/convert`, data),
    onSuccess: (response) =>
      invalidate(queryClient, [
        queryKeys.leads(),
        queryKeys.lead(response.lead.id),
        queryKeys.contacts(),
        queryKeys.accounts(),
        queryKeys.deals(),
        queryKeys.dashboard(),
      ]),
  });
}

export function useImportLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file }: ImportLeadsVariables) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.postForm<LeadImportSummary>("/leads/import", formData);
    },
    onSuccess: () => invalidate(queryClient, [queryKeys.leads(), queryKeys.dashboard()]),
  });
}

export function useContacts(params?: ContactsParams) {
  return useQuery({
    queryFn: () => api.get<Contact[]>("/contacts/", toQueryParams(params)),
    queryKey: queryKeys.contacts(params),
  });
}

export function useContact(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<Contact>(`/contacts/${id}`),
    queryKey: queryKeys.contact(id),
  });
}

export function useContactTimeline(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<ContactTimelineItem[]>(`/contacts/${id}/timeline`),
    queryKey: queryKeys.contactTimeline(id),
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ContactCreate) => api.post<Contact, ContactCreate>("/contacts/", data),
    onSuccess: () => invalidate(queryClient, [queryKeys.contacts(), queryKeys.accounts(), queryKeys.dashboard()]),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: UpdateVariables<ContactUpdate>) => api.patch<Contact, ContactUpdate>(`/contacts/${id}`, data),
    onSuccess: (contact) => invalidate(queryClient, [queryKeys.contacts(), queryKeys.contact(contact.id), queryKeys.accounts()]),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => api.delete<void>(`/contacts/${id}`),
    onSuccess: () => invalidate(queryClient, [queryKeys.contacts(), queryKeys.accounts(), queryKeys.dashboard()]),
  });
}

export function useAccounts(params?: AccountsParams) {
  return useQuery({
    queryFn: () => api.get<Account[]>("/accounts/", toQueryParams(params)),
    queryKey: queryKeys.accounts(params),
  });
}

export function useAccount(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<Account>(`/accounts/${id}`),
    queryKey: queryKeys.account(id),
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AccountCreate) => api.post<Account, AccountCreate>("/accounts/", data),
    onSuccess: () => invalidate(queryClient, [queryKeys.accounts(), queryKeys.dashboard()]),
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: UpdateVariables<AccountUpdate>) => api.patch<Account, AccountUpdate>(`/accounts/${id}`, data),
    onSuccess: (account) => invalidate(queryClient, [queryKeys.accounts(), queryKeys.account(account.id)]),
  });
}

export function useDeals(params?: DealsParams) {
  return useQuery({
    queryFn: () => api.get<Deal[]>("/deals/", toQueryParams(params)),
    queryKey: queryKeys.deals(params),
  });
}

export function useDealsKanban(pipeline_id: UUID) {
  return useQuery({
    enabled: Boolean(pipeline_id),
    queryFn: () => api.get<DealKanbanResponse>("/deals/kanban", { pipeline_id }),
    queryKey: ["deals", "kanban", pipeline_id] as const,
  });
}

export function useDeal(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<DealDetailResponse>(`/deals/${id}`),
    queryKey: queryKeys.deal(id),
  });
}

export function useDealForecast(params?: DealForecastParams) {
  return useQuery({
    queryFn: () => api.get<DealForecastResponse>("/deals/forecast", toQueryParams(params)),
    queryKey: queryKeys.dealForecast(params),
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DealCreate) => api.post<Deal, DealCreate>("/deals/", data),
    onSuccess: () => invalidate(queryClient, [queryKeys.deals(), queryKeys.dealForecast(), queryKeys.dashboard()]),
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: UpdateVariables<DealUpdate>) => api.patch<Deal, DealUpdate>(`/deals/${id}`, data),
    onSuccess: (deal) => invalidate(queryClient, [queryKeys.deals(), queryKeys.deal(deal.id), queryKeys.dealForecast(), queryKeys.dashboard()]),
  });
}

export function useMoveStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: MoveStageVariables) => api.post<Deal, DealMoveStageRequest>(`/deals/${id}/stage`, data),
    onSuccess: (deal) => invalidate(queryClient, [queryKeys.deals(), queryKeys.deal(deal.id), queryKeys.dealForecast(), queryKeys.dashboard()]),
  });
}

export function useWinDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => api.post<Deal>(`/deals/${id}/won`),
    onSuccess: (deal) => invalidate(queryClient, [queryKeys.deals(), queryKeys.deal(deal.id), queryKeys.dealForecast(), queryKeys.dashboard()]),
  });
}

export function useLoseDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: LoseDealVariables) => api.post<Deal, DealLostRequest>(`/deals/${id}/lost`, data),
    onSuccess: (deal) => invalidate(queryClient, [queryKeys.deals(), queryKeys.deal(deal.id), queryKeys.dealForecast(), queryKeys.dashboard()]),
  });
}

export function usePipelines() {
  return useQuery({
    queryFn: () => api.get<Pipeline[]>("/pipelines/"),
    queryKey: queryKeys.pipelines(),
  });
}

export function usePipeline(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<Pipeline>(`/pipelines/${id}`),
    queryKey: queryKeys.pipeline(id),
  });
}

export function useTasks(params?: TasksParams) {
  return useQuery({
    queryFn: () => api.get<Task[]>("/tasks/", toQueryParams(params)),
    queryKey: queryKeys.tasks(params),
  });
}

export function useOverdueTasks() {
  return useQuery({
    queryFn: () => api.get<Task[]>("/tasks/overdue"),
    queryKey: queryKeys.overdueTasks(),
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => api.post<Task>(`/tasks/${id}/complete`),
    onSuccess: () => invalidate(queryClient, [queryKeys.tasks(), queryKeys.overdueTasks(), queryKeys.dashboard()]),
  });
}

export function useSnoozeTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: SnoozeTaskVariables) => api.post<Task, TaskSnoozeRequest>(`/tasks/${id}/snooze`, data),
    onSuccess: () => invalidate(queryClient, [queryKeys.tasks(), queryKeys.overdueTasks(), queryKeys.dashboard()]),
  });
}

export function useActivities(params?: ActivitiesParams) {
  return useQuery({
    queryFn: () => api.get<Activity[]>("/activities/", toQueryParams(params)),
    queryKey: queryKeys.activities(params),
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ActivityCreate) => api.post<Activity, ActivityCreate>("/activities/", data),
    onSuccess: () => invalidate(queryClient, [queryKeys.activities(), queryKeys.dashboard()]),
  });
}

export function useCampaigns(params?: CampaignsParams) {
  return useQuery({
    queryFn: () => api.get<Campaign[]>("/campaigns/", toQueryParams(params)),
    queryKey: queryKeys.campaigns(params),
  });
}

export function useCampaign(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<Campaign>(`/campaigns/${id}`),
    queryKey: queryKeys.campaign(id),
  });
}

export function useCampaignMetrics(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<CampaignMetrics>(`/campaigns/${id}/metrics`),
    queryKey: queryKeys.campaignMetrics(id),
  });
}

export function useCampaignSteps(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<CampaignSequenceStep[]>(`/campaigns/${id}/steps`),
    queryKey: queryKeys.campaignSteps(id),
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CampaignCreate) => api.post<Campaign, CampaignCreate>("/campaigns/", data),
    onSuccess: () => invalidate(queryClient, [queryKeys.campaigns(), queryKeys.dashboard()]),
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: UpdateVariables<CampaignUpdate>) => api.patch<Campaign, CampaignUpdate>(`/campaigns/${id}`, data),
    onSuccess: (campaign) => invalidate(queryClient, [queryKeys.campaigns(), queryKeys.campaign(campaign.id)]),
  });
}

export function useActivateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => api.post<Campaign>(`/campaigns/${id}/activate`),
    onSuccess: (campaign) => invalidate(queryClient, [queryKeys.campaigns(), queryKeys.campaign(campaign.id)]),
  });
}

export function usePauseCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => api.post<Campaign>(`/campaigns/${id}/pause`),
    onSuccess: (campaign) => invalidate(queryClient, [queryKeys.campaigns(), queryKeys.campaign(campaign.id)]),
  });
}

export function useEnrollCampaignContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, data }: CampaignStepVariables<CampaignEnrollRequest>) =>
      api.post<CampaignEnrollment[], CampaignEnrollRequest>(`/campaigns/${campaignId}/enroll`, data),
    onSuccess: (_enrollments, variables) =>
      invalidate(queryClient, [
        queryKeys.campaign(variables.campaignId),
        queryKeys.campaignMetrics(variables.campaignId),
        queryKeys.campaigns(),
      ]),
  });
}

export function useCreateCampaignStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, data }: CampaignStepVariables<CampaignStepCreate>) =>
      api.post<CampaignSequenceStep, CampaignStepCreate>(`/campaigns/${campaignId}/steps`, data),
    onSuccess: (_step, variables) => invalidate(queryClient, [queryKeys.campaign(variables.campaignId), queryKeys.campaignSteps(variables.campaignId)]),
  });
}

export function useUpdateCampaignStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, data, stepId }: UpdateCampaignStepVariables<CampaignStepUpdate>) =>
      api.patch<CampaignSequenceStep, CampaignStepUpdate>(`/campaigns/${campaignId}/steps/${stepId}`, data),
    onSuccess: (_step, variables) => invalidate(queryClient, [queryKeys.campaign(variables.campaignId), queryKeys.campaignSteps(variables.campaignId)]),
  });
}

export function useReorderCampaignSteps() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, data }: CampaignStepVariables<CampaignStepsReorderRequest>) =>
      api.post<CampaignSequenceStep[], CampaignStepsReorderRequest>(`/campaigns/${campaignId}/steps/reorder`, data),
    onSuccess: (_steps, variables) => invalidate(queryClient, [queryKeys.campaign(variables.campaignId), queryKeys.campaignSteps(variables.campaignId)]),
  });
}

export function useProjects(params?: ProjectsParams) {
  return useQuery({
    queryFn: () => api.get<Project[]>("/projects/", toQueryParams(params)),
    queryKey: queryKeys.projects(params),
  });
}

export function useProject(id: UUID) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => api.get<Project>(`/projects/${id}`),
    queryKey: queryKeys.project(id),
  });
}

export function useCreateProjectFromDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId }: CreateProjectFromDealVariables) => api.post<Project>(`/projects/from-deal/${dealId}`),
    onSuccess: (project) => invalidate(queryClient, [queryKeys.projects(), queryKeys.project(project.id), queryKeys.dashboard()]),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: UpdateVariables<ProjectUpdate>) => api.patch<Project, ProjectUpdate>(`/projects/${id}`, data),
    onSuccess: (project) => invalidate(queryClient, [queryKeys.projects(), queryKeys.project(project.id), queryKeys.dashboard()]),
  });
}

export function useDashboard() {
  return useQuery({
    queryFn: () => api.get<DashboardResponse>("/reports/dashboard"),
    queryKey: queryKeys.dashboard(),
  });
}

export function usePipelineSummary(params?: ReportsParams) {
  return useQuery({
    queryFn: () => api.get<PipelineSummaryRow[]>("/reports/pipeline-summary", toQueryParams(params)),
    queryKey: queryKeys.pipelineSummary(params),
  });
}

export function useLeadFunnel(params?: ReportsParams) {
  return useQuery({
    queryFn: () => api.get<LeadFunnelResponse>("/reports/lead-funnel", toQueryParams(params)),
    queryKey: queryKeys.leadFunnel(params),
  });
}

export function useLeadVolume(params?: LeadVolumeParams) {
  return useQuery({
    queryFn: () => api.get<LeadVolumeRow[]>("/reports/lead-volume", toQueryParams(params)),
    queryKey: queryKeys.leadVolume(params),
  });
}

export function useGlobalSearch(q: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && q.trim().length > 0,
    queryFn: () => api.get<GlobalSearchResponse>("/search/global", { q, limit: 20 }),
    queryKey: queryKeys.globalSearch(q),
  });
}

export function useUsers() {
  return useQuery({
    queryFn: () => api.get<User[]>("/users/"),
    queryKey: queryKeys.users(),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UserCreate) => api.post<User, UserCreate>("/users/", data),
    onSuccess: () => invalidate(queryClient, [queryKeys.users()]),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, id }: UpdateVariables<UserUpdate>) => api.patch<User, UserUpdate>(`/users/${id}`, data),
    onSuccess: () => invalidate(queryClient, [queryKeys.users()]),
  });
}
