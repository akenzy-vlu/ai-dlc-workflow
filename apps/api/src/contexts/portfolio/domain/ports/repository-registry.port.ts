import { RepositoryId } from '../../../../shared/kernel';
import { TrackedRepository } from '../model/tracked-repository';

export const REPOSITORY_REGISTRY = Symbol('REPOSITORY_REGISTRY');

/** Persistence port for the one aggregate the console owns. */
export interface RepositoryRegistryPort {
  findAll(): Promise<TrackedRepository[]>;
  findById(id: RepositoryId): Promise<TrackedRepository | null>;
  findByPath(absolutePath: string): Promise<TrackedRepository | null>;
  save(repository: TrackedRepository): Promise<void>;
  remove(id: RepositoryId): Promise<void>;
}
