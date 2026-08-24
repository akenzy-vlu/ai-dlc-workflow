/** A command: changes state, and in this system that always means a controller call. */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

/** A query: reads only. Never touches the write path. */
export interface Query<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
