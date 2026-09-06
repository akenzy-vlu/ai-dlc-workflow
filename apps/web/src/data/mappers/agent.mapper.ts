import type { AgentActivity, AgentDefinition, AgentLogLine, AgentRun, AgentRunDetail, AgentThread } from '@domain/entities';
import type {
  AgentActivityModel,
  AgentDefinitionModel,
  AgentLogLineModel,
  AgentRunDetailModel,
  AgentRunModel,
  AgentThreadModel,
} from '../models';
import { toAgentActivityKind, toAgentRunStatus, toLogStream } from './enum.mapper';

export const toAgentDefinition = (model: AgentDefinitionModel): AgentDefinition => ({
  ...model,
  promptVia: model.promptVia === 'arg' ? 'arg' : 'stdin',
});

export const toAgentActivity = (model: AgentActivityModel): AgentActivity => ({
  at: model.at,
  kind: toAgentActivityKind(model.kind),
  tool: model.tool,
  detail: model.detail,
  text: model.text,
});

export const toAgentRun = (model: AgentRunModel): AgentRun => ({
  ...model,
  status: toAgentRunStatus(model.status),
  currentActivity: model.currentActivity ? toAgentActivity(model.currentActivity) : null,
});

export const toAgentLogLine = (model: AgentLogLineModel): AgentLogLine => ({
  at: model.at,
  stream: toLogStream(model.stream),
  text: model.text,
});

export const toAgentRunDetail = (model: AgentRunDetailModel): AgentRunDetail => ({
  ...toAgentRun(model),
  log: (model.log ?? []).map(toAgentLogLine),
});

export const toAgentThread = (model: AgentThreadModel): AgentThread => ({
  repositoryId: model.repositoryId,
  slug: model.slug,
  ticketId: model.ticketId,
  runs: (model.runs ?? []).map(toAgentRun),
  replyTo: model.replyTo,
  canReply: model.canReply,
  // Shown verbatim — the API's wording is the reason a person reads, not a template key.
  cannotReplyReason: model.cannotReplyReason,
});
