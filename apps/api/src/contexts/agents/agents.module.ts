import { Module, forwardRef } from '@nestjs/common';

import { loadAidlcConfig } from '../../config/aidlc.config';
import { ConstructionModule } from '../construction/construction.module';
import { InsightModule } from '../insight/insight.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AgentLauncherService } from './application/agent-launcher.service';
import { LaunchReadyTickets } from './application/launch-ready.use-case';
import { TicketBriefingBuilder } from './application/ticket-briefing.builder';
import { AGENT_DEFINITION_SOURCE } from './domain/ports/agent-definition-source.port';
import { AGENT_CATALOG, AGENT_PROCESS, AGENT_RUN_STORE } from './domain/ports/agent.ports';
import { FileAgentDefinitionSource } from './infrastructure/file-agent-definition.source';
import { FileAgentRunStore } from './infrastructure/file-agent-run.store';
import { PgAgentRunStore } from './infrastructure/pg-agent-run.store';
import { PathAgentCatalog } from './infrastructure/path-agent.catalog';
import { SpawnAgentProcess } from './infrastructure/spawn-agent.process';
import { AgentsController } from './interface/agents.controller';

const postgres = loadAidlcConfig().store === 'postgres';

@Module({
  imports: [PortfolioModule, forwardRef(() => InsightModule), forwardRef(() => ConstructionModule)],
  controllers: [AgentsController],
  providers: [
    AgentLauncherService,
    TicketBriefingBuilder,
    LaunchReadyTickets,
    { provide: AGENT_CATALOG, useClass: PathAgentCatalog },
    { provide: AGENT_PROCESS, useClass: SpawnAgentProcess },
    { provide: AGENT_RUN_STORE, useClass: postgres ? PgAgentRunStore : FileAgentRunStore },
    // Always the file. Agent definitions are configuration, like the built-in table
    // above is — they are hand-edited, nothing in the console writes them, and holding
    // them in Postgres only meant an existing agents.json stopped being read.
    { provide: AGENT_DEFINITION_SOURCE, useClass: FileAgentDefinitionSource },
  ],
  exports: [AgentLauncherService],
})
export class AgentsModule {}
