import { CheckCircleFilled, CloseCircleFilled, RobotOutlined } from '@ant-design/icons';
import { Alert, Button, Space, Tooltip, Typography } from 'antd';

import { semantic, token } from '@app/theme';
import type { Ticket } from '@domain/entities';
import type { GateVerdictPanelViewProps } from './gate-verdict-panel.props';

export function GateVerdictPanelView({
  verdict,
  checkedAtLabel,
  ticketFor,
  onLaunch,
  pickableCount,
  onLaunchAll,
}: GateVerdictPanelViewProps) {
  if (verdict.error) {
    return (
      <Alert
        type="warning"
        showIcon
        title={`${verdict.gate}: ${verdict.error}`}
        style={{ flex: 1, minWidth: 320 }}
      />
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 320 }}>
      <Space size={6} style={{ marginBottom: 4 }}>
        {verdict.passed ? (
          <CheckCircleFilled style={{ color: semantic.success }} />
        ) : (
          <CloseCircleFilled style={{ color: semantic.danger }} />
        )}
        <Typography.Text strong>
          {verdict.gate} {verdict.passed ? 'preconditions pass' : 'is blocked'}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          checked {checkedAtLabel}
        </Typography.Text>
        {/* Only worth offering when the gate is actually blocked on unfinished tickets. */}
        {!verdict.passed && pickableCount > 0 ? (
          <Tooltip title="Launch an agent for every ticket whose dependencies are met, at once">
            <Button size="small" icon={<RobotOutlined />} onClick={onLaunchAll}>
              Start all {pickableCount}
            </Button>
          </Tooltip>
        ) : null}
      </Space>
      <div style={{ maxHeight: 160, overflow: 'auto' }}>
        {verdict.findings.map((finding, index) => {
          // Only a failing finding is worth acting on: a passing one names a ticket that
          // is already done, and offering to start it would be an invitation to redo work.
          const ticket = finding.level === 'ok' ? null : ticketFor(finding.message);

          return (
            <div
              key={index}
              style={{ fontSize: 12, padding: '1px 0', display: 'flex', gap: 6, alignItems: 'center' }}
            >
              <span style={{ color: finding.level === 'ok' ? token.textMuted : semantic.danger }}>
                {finding.level === 'ok' ? '·' : '×'}
              </span>
              <span
                style={{
                  color: finding.level === 'ok' ? token.textMuted : token.textPrimary,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {finding.message}
              </span>
              {ticket ? <LaunchFinding ticket={ticket} onLaunch={onLaunch} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Whether the launcher would accept this ticket.
 *
 * Deliberately not `ticket.ready`: that means "available to pick up fresh" and is false for
 * anything already `in_progress`, which is exactly the ticket an interrupted run leaves
 * behind. Gating on it disabled the one button that could finish the work. The launcher
 * refuses only a ticket that is done, and asks the controller to `start` only from `todo`,
 * so an in-progress ticket can simply be handed back.
 */
function canLaunch(ticket: Ticket): boolean {
  if (ticket.status === 'done' || ticket.status === 'blocked') return false;
  return ticket.unmetDependencies === 0;
}

/** Why the button is off, or what it will do, in the ticket's own terms. */
function reasonFor(ticket: Ticket): string {
  if (ticket.unmetDependencies > 0) {
    const n = ticket.unmetDependencies;
    return `${ticket.id} is waiting on ${n} unfinished dependenc${n === 1 ? 'y' : 'ies'} — the controller will refuse to start it`;
  }
  if (ticket.status === 'blocked') {
    return `${ticket.id} is marked blocked in its own frontmatter — clear that before an agent can pick it up`;
  }
  if (ticket.status === 'done') return `${ticket.id} is already done`;

  const unticked = ticket.doneWhen.filter((item) => !item.done).length;
  const resuming = ticket.status === 'in_progress' ? 'back ' : '';
  const tail = unticked
    ? ` — ${unticked} done-when item${unticked === 1 ? '' : 's'} still unticked, which is what is holding the hand-off to review`
    : '';
  return `Hand ${ticket.id} ${resuming}to an agent CLI: ${ticket.title}${tail}`;
}

/**
 * The way out of a blocked gate: hand the ticket the finding names to an agent.
 *
 * Disabled when the ticket is not ready, for the same reason the units-of-work table
 * disables it — the controller refuses to start a ticket whose dependencies are not done,
 * and a button that produces a refusal is worse than one that explains itself first.
 */
function LaunchFinding({ ticket, onLaunch }: { ticket: Ticket; onLaunch: (t: Ticket) => void }) {
  const unticked = ticket.doneWhen.filter((item) => !item.done).length;

  return (
    <Tooltip title={reasonFor(ticket)}>
      {/* A disabled antd Button swallows pointer events, so the wrapper is what keeps the
          tooltip — and therefore the reason — reachable. */}
      <span style={{ display: 'inline-flex' }}>
        {/* The count that explains the finding: a ticket sits in `in_progress` after a
            clean run precisely because the controller refuses to submit it while a
            done-when box is unticked. Showing it here saves opening the UoW table. */}
        {unticked > 0 && ticket.status !== 'todo' ? (
          <span style={{ fontSize: 11, color: token.textMuted }}>{unticked} unticked</span>
        ) : null}
        <Button
          size="small"
          type="text"
          icon={<RobotOutlined />}
          disabled={!canLaunch(ticket)}
          onClick={() => onLaunch(ticket)}
        >
          {ticket.status === 'in_progress' ? 'Continue' : 'Code'}
        </Button>
      </span>
    </Tooltip>
  );
}
