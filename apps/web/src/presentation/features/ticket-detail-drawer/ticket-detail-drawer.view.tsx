import { Card, Descriptions, Drawer, Space, Tag, Typography } from 'antd';

import { accent, MONO_FONT, token } from '@app/theme';
import { TicketStatusTag } from '@presentation/components/ticket-status-tag';
import { TicketActions } from '@presentation/features/ticket-actions';
import type { TicketDetailDrawerViewProps } from './ticket-detail-drawer.props';

/** A structured list, or nothing at all — an empty "Verifies: —" row helps no one. */
function TicketList({ label, items }: { label: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <Typography.Text style={{ fontSize: 11.5, color: token.textSecondary }}>{label}</Typography.Text>
      <div style={{ marginTop: 2 }}>
        {items.map((item) => (
          <Tag key={item} style={{ marginBottom: 4, fontFamily: MONO_FONT, fontSize: 11.5 }}>
            {item}
          </Tag>
        ))}
      </div>
    </div>
  );
}

export function TicketDetailDrawerView({ repositoryId, slug, ticket, onClose }: TicketDetailDrawerViewProps) {
  return (
    <Drawer
      open={ticket !== null}
      onClose={onClose}
      styles={{ wrapper: { width: 640 } }}
      title={
        ticket ? (
          <Space size={8} wrap>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 500 }}>{ticket.id}</span>
            <TicketStatusTag status={ticket.status} />
          </Space>
        ) : (
          'Ticket'
        )
      }
    >
      {ticket ? (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          {/* Untruncated — the row's Title column is `ellipsis: true`, on purpose, for
              the table; the drawer is where the whole thing is meant to be read. */}
          <Typography.Title level={5} style={{ margin: 0 }}>
            {ticket.title}
          </Typography.Title>

          <Descriptions size="small" column={2} colon={false} labelStyle={{ color: token.textSecondary, fontSize: 11.5 }}>
            <Descriptions.Item label="Layer">
              {ticket.layerDeclared ? (
                <Tag style={{ marginInlineEnd: 0 }}>{ticket.layer}</Tag>
              ) : (
                <Tag color="error" style={{ marginInlineEnd: 0 }}>
                  {ticket.layer}
                </Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Type">{ticket.type}</Descriptions.Item>
            <Descriptions.Item label="Estimate">{ticket.estimateLabel}</Descriptions.Item>
            <Descriptions.Item label="UoW">{ticket.uow ?? '—'}</Descriptions.Item>
          </Descriptions>

          {ticket.context ? (
            <Card size="small" title="Context" styles={{ body: { padding: 12 } }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12.5, fontFamily: 'inherit' }}>
                {ticket.context}
              </pre>
            </Card>
          ) : null}

          {ticket.implementationNotes ? (
            <Card size="small" title="Implementation notes" styles={{ body: { padding: 12 } }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12.5, fontFamily: 'inherit' }}>
                {ticket.implementationNotes}
              </pre>
            </Card>
          ) : null}

          {ticket.doneWhen.length > 0 ? (
            <Card size="small" title="Done when" styles={{ body: { padding: 12 } }}>
              {ticket.doneWhen.map((item, index) => (
                <div key={index} style={{ fontSize: 12.5, padding: '2px 0' }}>
                  <span style={{ color: item.done ? token.textMuted : accent.fill, marginRight: 6 }}>
                    {item.done ? '[x]' : '[ ]'}
                  </span>
                  <span style={{ color: item.done ? token.textMuted : token.textPrimary }}>{item.text}</span>
                </div>
              ))}
            </Card>
          ) : null}

          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <TicketList label="Touches" items={ticket.touches} />
            <TicketList label="Verifies" items={ticket.verifies} />
            <TicketList label="Depends on" items={ticket.dependsOn} />
            <TicketList label="Blocks" items={ticket.blocks} />
            <TicketList label="Assumptions" items={ticket.assumptions} />
          </Space>

          {ticket.parseError ? (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              Parse error: {ticket.parseError}
            </Typography.Text>
          ) : null}

          <div style={{ paddingTop: 4, borderTop: `1px solid ${token.border}` }}>
            <TicketActions
              repositoryId={repositoryId}
              slug={slug}
              ticketId={ticket.id}
              status={ticket.status}
              untickedCount={ticket.doneWhen.filter((item) => !item.done).length}
              lastSubmittedBy={ticket.lastSubmittedBy}
            />
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}
