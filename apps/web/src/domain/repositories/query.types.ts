/**
 * The shape every read returns, whatever fetches it.
 *
 * Deliberately narrower than RTK Query's own result: presentation only ever needs "do I
 * have it, is it moving, did it break, let me ask again". Exposing the full result object
 * would let component code reach for RTK-specific fields and quietly tie the view layer
 * to the fetching library.
 */
export interface QueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  /** True while any fetch is in flight, including a background refetch. */
  isFetching: boolean;
  isError: boolean;
  error: string | null;
  refetch: () => void;
}

/** The shape every write returns. `run` resolves with the result or throws. */
export interface CommandResult<TInput, TOutput> {
  run: (input: TInput) => Promise<TOutput>;
  isPending: boolean;
  isError: boolean;
  error: string | null;
  reset: () => void;
}
