import { LayoutOutlined } from '@ant-design/icons';
import { Button, Checkbox, Popover, Segmented, Space, Switch, Typography } from 'antd';

import { ink, token } from '@app/theme';
import type { DisplayControlViewProps } from './display-control.props';

/**
 * Grouping, ordering and which properties a view shows.
 *
 * Grouping is the setting that actually changes what you can see: the same tickets
 * grouped by project answer "where is the work" and grouped by layer answer "what kind of
 * work is it". Everything else here is trim.
 */
export function DisplayControlView({
  schema,
  display,
  onChange,
  onReset,
  isCustomised,
  showBoardOptions,
}: DisplayControlViewProps) {
  return (
    <Popover
      trigger={['click']}
      placement="bottomRight"
      content={
        <div style={{ width: 268 }}>
          <Section label="Group by">
            <OptionList
              options={schema.groupBy}
              value={display.groupBy}
              onChange={(groupBy) => onChange({ groupBy })}
            />
          </Section>

          <Section label="Order by">
            <OptionList
              options={schema.orderBy}
              value={display.orderBy}
              onChange={(orderBy) => onChange({ orderBy })}
            />
          </Section>

          {schema.properties.length > 0 ? (
            <Section label="Show">
              <Space orientation="vertical" size={2} style={{ width: '100%' }}>
                {schema.properties.map((property) => (
                  <Checkbox
                    key={property.value}
                    checked={display.properties.includes(property.value)}
                    onChange={(event) =>
                      onChange({
                        properties: event.target.checked
                          ? [...display.properties, property.value]
                          : display.properties.filter((held) => held !== property.value),
                      })
                    }
                  >
                    <span style={{ fontSize: 12.5 }}>{property.label}</span>
                  </Checkbox>
                ))}
              </Space>
            </Section>
          ) : null}

          <Section label="Options">
            <Row
              label="Show empty groups"
              hint="Keeps a lane visible even with nothing in it, so the shape stays stable"
            >
              <Switch
                size="small"
                checked={display.showEmptyGroups}
                onChange={(showEmptyGroups) => onChange({ showEmptyGroups })}
              />
            </Row>
            {showBoardOptions ? (
              <>
                <Row label="Hide done" hint="Completed work is most of a finished board">
                  <Switch
                    size="small"
                    checked={display.hideCompleted}
                    onChange={(hideCompleted) => onChange({ hideCompleted })}
                  />
                </Row>
                <Row
                  label="Merge checkouts"
                  hint="Two clones of one project hold the same plan — off shows each copy"
                >
                  <Switch
                    size="small"
                    checked={display.mergeCheckouts}
                    onChange={(mergeCheckouts) => onChange({ mergeCheckouts })}
                  />
                </Row>
              </>
            ) : null}
          </Section>

          {isCustomised ? (
            <Button size="small" type="text" onClick={onReset} style={{ marginTop: 4, color: token.textSecondary }}>
              Reset to default
            </Button>
          ) : null}
        </div>
      }
    >
      <Button size="small" icon={<LayoutOutlined />}>
        Display
      </Button>
    </Popover>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text
        style={{
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: token.textMuted,
          fontWeight: 500,
          display: 'block',
          marginBottom: 5,
        }}
      >
        {label}
      </Typography.Text>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5 }}>{label}</span>
        {hint ? (
          <span style={{ display: 'block', fontSize: 10.5, color: token.textMuted }}>{hint}</span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

function OptionList({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  // A segmented control for two or three choices, a list beyond that: five segments in a
  // 268px popover truncate to initials.
  if (options.length <= 3) {
    return (
      <Segmented
        size="small"
        block
        value={value}
        onChange={(next) => onChange(next as string)}
        options={options.map((option) => ({ value: option.value, label: option.label }))}
      />
    );
  }

  return (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            border: 'none',
            borderRadius: 8,
            padding: '4px 7px',
            cursor: 'pointer',
            background: value === option.value ? ink[100] : 'transparent',
            fontSize: 12.5,
            fontWeight: value === option.value ? 500 : 400,
          }}
        >
          {option.label}
          {option.hint ? (
            <span style={{ display: 'block', fontSize: 10.5, color: token.textMuted, fontWeight: 400 }}>
              {option.hint}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
