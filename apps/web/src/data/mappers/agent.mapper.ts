import type { AgentDefinition, AgentLogLine, AgentRun, AgentRunDetail } from '@domain/entities';
import type { AgentDefinitionModel, AgentLogLineModel, AgentRunDetailModel, AgentRunModel } from '../models';
import { toAgentRunStatus, toLogStream } from './enum.mapper';

export const toAgentDefinition = (model: AgentDefinitionModel): AgentDefinition => ({
  ...model,
  promptVia: model.promptVia === 'arg' ? 'arg' : 'stdin',
});

export const toAgentRun = (model: AgentRunModel): AgentRun => ({
  ...model,
  status: toAgentRunStatus(model.status),
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
