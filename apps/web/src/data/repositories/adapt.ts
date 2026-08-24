import type { CommandResult, QueryResult } from '@domain/repositories';
import { describeError } from '../datasource/remote/api';

/**
 * Narrows an RTK Query result to the domain's `QueryResult`.
 *
 * The point of the narrowing is containment: presentation should be able to render a list
 * without knowing which library fetched it. Passing RTK's own result object straight
 * through would let a component reach for `currentData` or `fulfilledTimeStamp` and
 * quietly weld the view layer to the fetching library.
 */
export function adaptQuery<T>(result: {
  data?: T;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => unknown;
}): QueryResult<T> {
  return {
    data: result.data,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: describeError(result.error),
    refetch: () => {
      void result.refetch();
    },
  };
}

/**
 * Narrows an RTK Query mutation tuple to the domain's `CommandResult`.
 *
 * `run` resolves with the payload or throws with the API's own sentence — which, for this
 * console, is usually the controller's refusal verbatim and names the file to go and fix.
 */
export function adaptCommand<TInput, TOutput>(
  trigger: (input: TInput) => { unwrap: () => Promise<TOutput> },
  state: { isLoading: boolean; isError: boolean; error?: unknown; reset: () => void },
): CommandResult<TInput, TOutput> {
  return {
    run: async (input: TInput) => {
      try {
        return await trigger(input).unwrap();
      } catch (error) {
        throw new Error(describeError(error) ?? 'The request failed');
      }
    },
    isPending: state.isLoading,
    isError: state.isError,
    error: describeError(state.error),
    reset: state.reset,
  };
}
