# Requirements — agent-chat-console

## US-01 — Reply to an agent instead of relaunching it

As the person who launched an agent against a ticket, I want to answer its finished run in
its own session, so that I correct one thing instead of re-explaining the whole ticket.

**AC-01** — a reply continues the same conversation
```gherkin
Given a finished run against T-01-01 whose telemetry carries a sessionId
When I post a reply to that run
Then a new run starts with --resume <that sessionId>
And its prompt contains only my reply, not the ticket brief again
And the new run reports the same sessionId when it finishes
```

**AC-02** — an agent that cannot resume says so rather than pretending
```gherkin
Given a finished run whose telemetry carries no sessionId
Or a run by an agent whose definition declares no resume invocation
When I open its thread
Then the reply box is disabled with the reason stated
And a fresh launch is offered in its place
And no run is started under a new session while being presented as a continuation
```

**AC-03** — a reply respects the one-run-per-ticket rule
```gherkin
Given a run is already active against T-01-01
When I post a reply to any run on that ticket
Then the console refuses with the same conflict message `launch` already returns
And no process is spawned
```

## US-02 — See a ticket's agent work as one conversation

As a reviewer, I want a ticket's runs and my replies in one thread, so that I can read what
happened without opening a drawer per run.

**AC-04** — runs and replies interleave chronologically
```gherkin
Given T-01-01 has two runs and one reply between them
When I open the ticket's agent thread
Then all three appear in the order they occurred
And each entry names the agent and the human it is attributed to
```

**AC-05** — a running agent streams into the thread
```gherkin
Given a run against T-01-01 is in progress
When the agent starts a tool call
Then the thread shows that activity without a page refresh
And the entry stops being shown as current once the run reaches a terminal status
```

## US-03 — Know what a run cost in tokens

As the person paying for it, I want a run's token counts, so that "expensive" is a number
rather than an impression.

**AC-06** — the translator keeps the usage block
```gherkin
Given a stream-json result event carrying a usage object
When the translator processes it
Then input, output, cache-read and cache-write token counts reach the run's telemetry
And a result event with no usage object leaves those counts null
```

**AC-07** — the run view reports them honestly
```gherkin
Given a finished run whose telemetry carries token counts
When I open its thread
Then input, output, cache read and cache write are each shown
And a run that reported no counts shows them as unavailable rather than as zero
```

## US-04 — Chat cannot route around the gates

As the person who owns the method, I want chat to be powerless over plan state, so that
steering an agent never becomes a way to approve its work.

**AC-08** — nothing in a thread changes a ticket's status
```gherkin
Given any thread in any state
When I post a reply, or a resumed run finishes cleanly
Then the ticket's status is unchanged except by the controller's own start transition
And no file under .ai/ is written by the console
And submit and accept remain separate, human, explicit actions
```

**AC-09** — every message is attributed to a person and an agent both
```gherkin
Given I post a reply as Akenzy to a run by Claude Code
When the message is stored
Then it records the human name and the agent label
And the resumed run's actingAs matches the format an initial launch uses
```

## US-05 — Sessions exist to be resumed

As an operator, I want the default `claude` invocation to report a session id, so that
resume is available without hand-editing `agents.json`.

**AC-10** — the built-in entry emits stream-json
```gherkin
Given a machine with no agents.json override
When I launch Claude Code against a ticket
Then the run's telemetry carries a sessionId when the run finishes
And the transcript stays readable prose rather than raw JSON
```
