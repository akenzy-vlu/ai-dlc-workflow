import { Injectable } from '@nestjs/common';

import type { FeatureSnapshot } from '../../insight/domain/feature-snapshot';
import type { Ticket } from '../../construction/domain/model/ticket';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';

/**
 * Turns a ticket into the brief an agent is handed.
 *
 * This is the whole point of launching from here rather than from a terminal. An agent
 * started by hand gets whatever the human remembered to paste; started from the plan, it
 * gets the slice's demo script, the acceptance criteria the ticket claims, the files it
 * is allowed to touch, and the checklist it will be judged against — all of which already
 * exist, written down, reviewed.
 *
 * The last section is the important one. An agent that edits `.ai/` or runs `aidlc pass`
 * can fabricate the exact evidence the gates rely on, so the brief forbids both and says
 * why. That is a request, not an enforcement — the enforcement is that the console never
 * hands the agent a reason to be trusted about gate state, and a human still runs `accept`.
 */
@Injectable()
export class TicketBriefingBuilder {
  constructor(private readonly fs: FileSystem) {}

  async build(snapshot: FeatureSnapshot, ticket: Ticket): Promise<string> {
    const { repository, plan, construction, gateState } = snapshot;
    const uow = construction.unitsOfWork.find((u) => ticket.uow && u.id.equals(ticket.uow));
    const ticketBody = (await this.fs.readText(ticket.filePath)) ?? '';

    const criteria = plan.acceptanceCriteria
      .filter((ac) => ticket.verifies.includes(ac.id))
      .map((ac) => `- ${ac.id} — ${ac.title}${ac.gherkin ? `\n\`\`\`gherkin\n${ac.gherkin}\n\`\`\`` : ''}`);

    const blockingAssumptions = plan.assumptions
      .filter((a) => ticket.assumptions.includes(a.id))
      .map((a) => `- ${a.id} (${a.status.value}) — ${a.text}`);

    const sections: string[] = [
      `You are implementing one ticket from an AI-DLC plan in ${repository.absolutePath}.`,
      '',
      `## The ticket`,
      '',
      ticketBody.trim(),
      '',
      `## Where it sits`,
      '',
      `- Repository: ${repository.label} (${repository.absolutePath})`,
      `- Feature: ${gateState.ref.slug.value}${plan.intent.problem ? ` — ${this.firstLine(plan.intent.problem)}` : ''}`,
      uow ? `- Slice: ${uow.id.value} — ${uow.title}` : '- Slice: (none declared)',
      `- Layer vocabulary for this repo: ${repository.settings.layers.join(', ') || '(not declared)'}`,
      `- This ticket's layer: ${ticket.layer.name}${ticket.layer.isDeclared ? '' : '  ← NOT in the declared vocabulary; do not follow it, flag it'}`,
    ];

    if (ticket.writePaths.length > 0) {
      sections.push(
        '',
        '## Files this ticket declared it would touch',
        '',
        ...ticket.touches.map((t) => `- ${t}`),
        '',
        'Staying inside this list is what makes the ticket reviewable and what keeps parallel',
        'agents from overwriting each other. If the work genuinely needs a file outside it,',
        'say so in your final message instead of quietly widening the scope.',
      );
    }

    if (criteria.length > 0) {
      sections.push('', '## Acceptance criteria this ticket claims to verify', '', ...criteria);
    }

    if (uow?.demoScript) {
      sections.push(
        '',
        '## The slice must be demoable like this when it is finished',
        '',
        uow.demoScript,
      );
    }

    if (blockingAssumptions.length > 0) {
      sections.push('', '## Assumptions this ticket rests on', '', ...blockingAssumptions);
    }

    const unticked = ticket.doneWhen.filter((i) => !i.done);
    if (unticked.length > 0) {
      sections.push(
        '',
        '## Done when',
        '',
        ...unticked.map((i) => `- [ ] ${i.text}`),
        '',
        `Tick these in ${ticket.filePath} as you satisfy them. The controller refuses to move`,
        'this ticket to review while any box is unticked, so an untouched checklist means the',
        'work cannot be handed off.',
      );
    }

    sections.push(
      '',
      '## Rules for this run',
      '',
      '1. Do not edit anything under `.ai/` except this ticket file\'s own done-when checklist.',
      '   The plan documents are reviewed artifacts and other work depends on them.',
      '2. Do not run `aidlc pass`, `aidlc accept`, or edit `.aidlc-state.yaml`. Gate state is',
      '   a human approval; an agent writing it is the one failure this whole method exists to',
      '   prevent. The console moves the ticket for you.',
      '3. Do not run `uow_graph.py --write`. The generated files are regenerated on accept.',
      '4. When you are done, end with a short summary: what changed, which done-when items you',
      '   ticked, and anything you could not do. A person reads that before accepting.',
    );

    return sections.join('\n');
  }

  private firstLine(text: string): string {
    return text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
  }
}
