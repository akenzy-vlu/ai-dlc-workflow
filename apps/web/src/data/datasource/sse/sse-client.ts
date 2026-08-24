/**
 * Server-sent events.
 *
 * Nothing uses this yet, and that is deliberate rather than an omission: the console's
 * push channel is a socket, because agent transcripts and install logs are high-frequency
 * one-way streams that also need the client to *send* (cancel a run), and a socket does
 * both over one connection.
 *
 * SSE earns its place the day a stream has to survive a proxy that buffers websockets, or
 * the day a headless consumer wants to tail one feature's events with `curl`. The helper
 * is here so that day is a small change rather than a new dependency and a new pattern.
 */
export interface SseSubscription {
  close: () => void;
}

export function subscribeToSse<T>(
  url: string,
  onMessage: (payload: T) => void,
  onError?: (error: Event) => void,
): SseSubscription {
  const source = new EventSource(url, { withCredentials: false });

  source.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data) as T);
    } catch {
      // A frame the client cannot parse is dropped rather than allowed to tear down the
      // whole stream — one malformed event should not end the subscription.
    }
  };

  source.onerror = (event) => onError?.(event);

  return { close: () => source.close() };
}
