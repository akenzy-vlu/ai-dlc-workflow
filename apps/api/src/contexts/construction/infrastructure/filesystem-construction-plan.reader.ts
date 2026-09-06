import { Injectable } from '@nestjs/common';
import * as path from 'node:path';

import { Estimate, FeatureRef, Layer, Risk, TicketId, TicketType, UowId, WorkStatus } from '../../../shared/kernel';
import { FileSystem } from '../../../shared/infrastructure/fs/file-system';
import { asList, asScalar, parseFrontmatter } from '../../../shared/infrastructure/text/frontmatter.parser';
import { checklistState, sectionBody } from '../../../shared/infrastructure/text/markdown.reader';
import { ConstructionPlan } from '../domain/model/construction-plan';
import { Ticket } from '../domain/model/ticket';
import { UnitOfWork } from '../domain/model/unit-of-work';
import { ConstructionPlanReaderPort } from '../domain/ports/plan-reader.port';

/**
 * Walks each `04-units-of-work/UOW-nn` directory for its `uow.md` and `tickets/T-*.md`,
 * mirroring `load_plan`.
 *
 * Directory names carry a slug (`UOW-01-webpage-identity`) but identity comes from the
 * frontmatter `id:`, exactly as the controller reads it — a directory renamed without
 * touching the file must not change what the graph believes.
 */
@Injectable()
export class FilesystemConstructionPlanReader implements ConstructionPlanReaderPort {
  constructor(private readonly fs: FileSystem) {}

  async read(
    ref: FeatureRef,
    featureDirectory: string,
    layerVocabulary: readonly string[],
  ): Promise<ConstructionPlan> {
    const uowRoot = path.join(featureDirectory, '04-units-of-work');
    const loadErrors: string[] = [];
    const unitsOfWork: UnitOfWork[] = [];
    const tickets: Ticket[] = [];

    if (!(await this.fs.isDirectory(uowRoot))) {
      return ConstructionPlan.create({ ref, unitsOfWork, tickets, loadErrors: [`missing directory: 04-units-of-work`] });
    }

    for (const entry of await this.fs.listDirectories(uowRoot)) {
      const directory = path.join(uowRoot, entry);
      const uowFile = path.join(directory, 'uow.md');
      const text = await this.fs.readText(uowFile);

      if (text === null) {
        loadErrors.push(`${entry}/ has no uow.md`);
        continue;
      }

      const { data, error } = parseFrontmatter(text);
      const id = UowId.tryCreate(asScalar(data['id']));
      if (!id) {
        loadErrors.push(`${entry}/uow.md: ${error ?? "frontmatter has no 'id'"}`);
        continue;
      }
      if (unitsOfWork.some((u) => u.id.equals(id))) {
        loadErrors.push(`duplicate UoW id ${id.value}`);
        continue;
      }

      unitsOfWork.push(
        UnitOfWork.create({
          id,
          title: asScalar(data['title']),
          slug: asScalar(data['slug']) || entry,
          status: WorkStatus.create(asScalar(data['status'])),
          risk: Risk.create(asScalar(data['risk'])),
          demoable: ['true', 'yes'].includes(asScalar(data['demoable']).toLowerCase()),
          duration: asScalar(data['duration']),
          dependsOn: asList(data['depends_on']).map(UowId.tryCreate).filter((u): u is UowId => u !== null),
          verifies: asList(data['verifies']),
          requirements: asList(data['requirements']),
          rollback: asScalar(data['rollback']),
          demoScript: sectionBody(text, 'Demo script'),
          definitionOfDone: checklistState(text).items,
          directory,
          filePath: uowFile,
          parseError: error,
        }),
      );

      const ticketDir = path.join(directory, 'tickets');
      if (!(await this.fs.isDirectory(ticketDir))) {
        loadErrors.push(`${id.value} has no tickets/ directory`);
        continue;
      }

      for (const filename of await this.fs.listFiles(ticketDir, '.md')) {
        const filePath = path.join(ticketDir, filename);
        const ticketText = await this.fs.readText(filePath);
        if (ticketText === null) continue;

        const parsed = parseFrontmatter(ticketText);
        const ticketId = TicketId.tryCreate(asScalar(parsed.data['id']));
        if (!ticketId) {
          loadErrors.push(`${filename}: ${parsed.error ?? "frontmatter has no 'id'"}`);
          continue;
        }
        if (tickets.some((t) => t.id.equals(ticketId))) {
          loadErrors.push(`duplicate ticket id ${ticketId.value}`);
          continue;
        }

        // The frontmatter `uow:` wins when present, mirroring load_plan; a mismatch with
        // the containing directory is a warning there, so it must not silently reassign.
        const declaredUow: UowId = UowId.tryCreate(asScalar(parsed.data['uow'])) ?? id;
        if (!declaredUow.equals(id)) {
          loadErrors.push(`${ticketId.value} sits in ${id.value} but declares uow: ${declaredUow.value}`);
        }

        tickets.push(
          Ticket.create({
            id: ticketId,
            uow: declaredUow,
            title: asScalar(parsed.data['title']),
            layer: Layer.create(asScalar(parsed.data['layer']), layerVocabulary),
            type: TicketType.create(asScalar(parsed.data['type'])),
            estimate: Estimate.parse(asScalar(parsed.data['estimate'])),
            status: WorkStatus.create(asScalar(parsed.data['status'])),
            dependsOn: asList(parsed.data['depends_on']).map(TicketId.tryCreate).filter((t): t is TicketId => t !== null),
            blocks: asList(parsed.data['blocks']).map(TicketId.tryCreate).filter((t): t is TicketId => t !== null),
            verifies: asList(parsed.data['verifies']),
            touches: asList(parsed.data['touches']),
            assumptions: asList(parsed.data['assumptions']),
            doneWhen: checklistState(ticketText).items,
            context: sectionBody(ticketText, 'Context'),
            implementationNotes: sectionBody(ticketText, 'Implementation notes'),
            filePath,
            parseError: parsed.error,
          }),
        );
      }
    }

    return ConstructionPlan.create({ ref, unitsOfWork, tickets, loadErrors });
  }
}
