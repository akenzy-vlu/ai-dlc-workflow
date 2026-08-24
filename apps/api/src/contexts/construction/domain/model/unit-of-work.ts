import { Entity, Risk, UowId, WorkStatus } from '../../../../shared/kernel';
import { ChecklistItem } from './ticket';

export interface UnitOfWorkProps {
  id: UowId;
  title: string;
  slug: string;
  status: WorkStatus;
  risk: Risk;
  /** `demoable: true` is a hard G3 requirement — an undemoable slice is a layer. */
  demoable: boolean;
  duration: string;
  dependsOn: UowId[];
  verifies: string[];
  requirements: string[];
  rollback: string;
  /** The `## Demo script` body. Its absence fails G3. */
  demoScript: string | null;
  /** `- [ ]` boxes anywhere in uow.md — the definition of done, plus any verify evidence. */
  definitionOfDone: ChecklistItem[];
  directory: string;
  filePath: string;
  parseError: string | null;
}

/**
 * A vertical slice that can be demoed on its own.
 *
 * The distinction that matters and that the model enforces: a UoW is not a layer of the
 * system, it is a thin cut through all of them. `demoable` and the demo script are how
 * that is kept honest — you cannot write a demo script for "the repository layer".
 */
export class UnitOfWork extends Entity<UowId> {
  private constructor(private readonly props: UnitOfWorkProps) {
    super(props.id);
  }

  static create(props: UnitOfWorkProps): UnitOfWork {
    return new UnitOfWork(props);
  }

  get title(): string {
    return this.props.title;
  }
  get slug(): string {
    return this.props.slug;
  }
  get status(): WorkStatus {
    return this.props.status;
  }
  get risk(): Risk {
    return this.props.risk;
  }
  get isDemoable(): boolean {
    return this.props.demoable;
  }
  get duration(): string {
    return this.props.duration;
  }
  get dependsOn(): readonly UowId[] {
    return this.props.dependsOn;
  }
  get verifies(): readonly string[] {
    return this.props.verifies;
  }
  get requirements(): readonly string[] {
    return this.props.requirements;
  }
  get rollback(): string {
    return this.props.rollback;
  }
  get demoScript(): string | null {
    return this.props.demoScript;
  }
  get definitionOfDone(): readonly ChecklistItem[] {
    return this.props.definitionOfDone;
  }
  get directory(): string {
    return this.props.directory;
  }
  get filePath(): string {
    return this.props.filePath;
  }
  get parseError(): string | null {
    return this.props.parseError;
  }

  get untickedCount(): number {
    return this.props.definitionOfDone.filter((i) => !i.done).length;
  }

  /** Exactly what `check_g4` counts: unticked boxes block the gate. */
  get blocksConstructionClose(): boolean {
    return this.untickedCount > 0;
  }

  get hasRollback(): boolean {
    return this.props.rollback.trim().length > 0;
  }
}
