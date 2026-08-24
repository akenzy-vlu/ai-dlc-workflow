import { Alert, Card, Space, Tag, Typography } from 'antd';

import { MONO_FONT } from '@app/theme';
import type { IntentPanelViewProps } from './intent-panel.props';

export function IntentPanelView({
  architectureMap,
  missingSections,
  todoCount,
  sections,
  decisions,
}: IntentPanelViewProps) {
  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      {architectureMap.verifiedBy ? (
        <Alert type="success" showIcon message={`Architecture map signed by ${architectureMap.verifiedBy}`} />
      ) : (
        <Alert
          type="warning"
          showIcon
          message="Architecture map is unsigned"
          description={
            architectureMap.present
              ? 'A human has not read the discovery draft and set `verified_by`. Heuristics can guess a layer convention from filenames; they cannot tell a live convention from a legacy one. This is a hard G0 blocker and the cheapest one to clear.'
              : 'No architecture map has been generated for this repository yet.'
          }
        />
      )}

      {missingSections.length > 0 ? (
        <Alert
          type="error"
          showIcon
          message="Required sections missing"
          description={<span style={{ fontSize: 12 }}>{missingSections.join(' · ')}</span>}
        />
      ) : null}

      {todoCount > 0 ? (
        <Alert type="warning" showIcon message={`${todoCount} TODO placeholder(s) left from the scaffold`} />
      ) : null}

      {sections.map((section) => (
        <Card key={section.title} size="small" title={section.title}>
          {section.body ? (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5 }}>
              {section.body}
            </pre>
          ) : (
            <Typography.Text type="secondary">Not written</Typography.Text>
          )}
        </Card>
      ))}

      <Card size="small" title={`Architecture decisions · ${decisions.length}`}>
        {decisions.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            No ADR recorded. A design with no hard-to-reverse decision is either trivial or
            under-examined — G2 refuses it.
          </Typography.Text>
        ) : (
          decisions.map((decision) => (
            <div key={decision.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <Space size={8}>
                <span style={{ fontFamily: MONO_FONT, fontWeight: 500, fontSize: 12 }}>{decision.id}</span>
                <Tag
                  color={decision.unresolved ? 'warning' : decision.status === 'accepted' ? 'success' : undefined}
                >
                  {decision.status}
                </Tag>
                <span style={{ fontSize: 12.5 }}>{decision.title}</span>
              </Space>
            </div>
          ))
        )}
      </Card>
    </Space>
  );
}
