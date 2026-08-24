import { useMemo, useState } from 'react';
import { ArrowLeftOutlined, CloseOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Popover, Segmented, Space, Tag } from 'antd';

import { token } from '@app/theme';
import type { Facet, FilterOperator, ViewFilter } from '@domain/value-objects';
import type { FilterControlViewProps } from './filter-control.props';

/**
 * A filter bar: a chip per active filter, plus a two-step picker for new ones.
 *
 * Property first, then values, because that is the order the question arrives in — you
 * know you want to narrow by layer before you know which layers exist. Every value shows
 * its count, so a filter that would empty the board is visible as such before it is
 * applied rather than after.
 */
export function FilterControlView({
  active,
  available,
  onOperatorChange,
  onValuesChange,
  onRemove,
  onClear,
}: FilterControlViewProps) {
  return (
    <Space size={6} wrap>
      {active.map(({ filter, facet }) => (
        <FilterChip
          key={filter.property}
          facet={facet}
          filter={filter}
          onOperator={(operator) => onOperatorChange(filter.property, operator)}
          onValues={(values) => onValuesChange(filter.property, values)}
          onRemove={() => onRemove(filter.property)}
        />
      ))}

      <AddFilter facets={available} onPick={onValuesChange} hasActive={active.length > 0} />

      {active.length > 0 ? (
        <Button size="small" type="text" onClick={onClear} style={{ color: token.textSecondary }}>
          Clear
        </Button>
      ) : null}
    </Space>
  );
}

/**
 * Property list, then value list, inside one popover.
 *
 * Two steps in one surface rather than a menu that spawns a second popup: picking `layer`
 * and then picking `api` is one decision with two halves, and a chain of popups makes
 * going back to change the first half awkward.
 */
function AddFilter({
  facets,
  onPick,
  hasActive,
}: {
  facets: Facet[];
  onPick: (property: string, values: string[]) => void;
  hasActive: boolean;
}) {
  const [property, setProperty] = useState<string | null>(null);
  const [staged, setStaged] = useState<string[]>([]);
  const facet = facets.find((candidate) => candidate.property === property) ?? null;

  return (
    <Popover
      // Open/closed is left to antd; only the two-step property/value state is held here.
      // Controlling both would mean re-implementing outside-click and escape handling to
      // no benefit — nothing outside this component needs to know whether it is open.
      trigger={['click']}
      placement="bottomLeft"
      onOpenChange={(next) => {
        if (!next) {
          setProperty(null);
          setStaged([]);
        }
      }}
      content={
        facet ? (
          <div style={{ width: 250 }}>
            <button
              type="button"
              onClick={() => {
                setProperty(null);
                setStaged([]);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '0 0 6px',
                fontSize: 11.5,
                color: token.textSecondary,
              }}
            >
              <ArrowLeftOutlined /> {facet.label}
            </button>
            <ValueList
              facet={facet}
              selected={staged}
              onChange={(values) => {
                setStaged(values);
                onPick(facet.property, values);
              }}
            />
          </div>
        ) : (
          <div style={{ width: 200, maxHeight: 320, overflowY: 'auto' }}>
            {facets.length === 0 ? (
              <div style={{ padding: 6, fontSize: 12, color: token.textMuted }}>
                Everything is already filtered
              </div>
            ) : (
              facets.map((option) => (
                <button
                  key={option.property}
                  type="button"
                  onClick={() => setProperty(option.property)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    gap: 10,
                    alignItems: 'center',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '5px 6px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ flex: 1 }}>{option.label}</span>
                  <span style={{ color: token.textMuted, fontSize: 11 }}>{option.values.length}</span>
                </button>
              ))
            )}
          </div>
        )
      }
    >
      <Button size="small" icon={hasActive ? <PlusOutlined /> : <FilterOutlined />}>
        {hasActive ? '' : 'Filter'}
      </Button>
    </Popover>
  );
}

function FilterChip({
  facet,
  filter,
  onOperator,
  onValues,
  onRemove,
}: {
  facet: Facet;
  filter: ViewFilter;
  onOperator: (operator: FilterOperator) => void;
  onValues: (values: string[]) => void;
  onRemove: () => void;
}) {
  const labels = filter.values
    .map((value) => facet.values.find((candidate) => candidate.value === value)?.label ?? value)
    .slice(0, 2);
  const extra = filter.values.length - labels.length;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 24,
        borderRadius: 8,
        border: `1px solid ${token.border}`,
        background: token.bgSurface,
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <span style={{ padding: '0 7px', color: token.textSecondary }}>{facet.label}</span>
      <Segmented
        size="small"
        value={filter.operator}
        onChange={(value) => onOperator(value as FilterOperator)}
        options={[
          { value: 'is', label: 'is' },
          { value: 'is-not', label: 'is not' },
        ]}
      />
      <Popover
        trigger={['click']}
        placement="bottomLeft"
        content={<ValueList facet={facet} selected={filter.values} onChange={onValues} width={250} />}
      >
        <button
          type="button"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '0 8px',
            fontSize: 12,
            color: token.textPrimary,
            fontWeight: 500,
          }}
        >
          {labels.join(', ')}
          {extra > 0 ? ` +${extra}` : ''}
        </button>
      </Popover>
      <button
        type="button"
        onClick={onRemove}
        style={{
          border: 'none',
          borderLeft: `1px solid ${token.border}`,
          background: 'transparent',
          cursor: 'pointer',
          padding: '0 6px',
          height: '100%',
          color: token.textMuted,
        }}
      >
        <CloseOutlined style={{ fontSize: 9 }} />
      </button>
    </span>
  );
}

function ValueList({
  facet,
  selected,
  onChange,
  width,
}: {
  facet: Facet;
  selected: string[];
  onChange: (values: string[]) => void;
  width?: number;
}) {
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? facet.values.filter((value) => value.label.toLowerCase().includes(term)) : facet.values;
  }, [facet.values, search]);

  return (
    <div style={{ width }}>
      {facet.values.length > 8 ? (
        <Input
          size="small"
          autoFocus
          placeholder={`Filter ${facet.label.toLowerCase()}…`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ marginBottom: 8 }}
        />
      ) : null}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {visible.map((value) => (
          <label
            key={value.value}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', cursor: 'pointer' }}
          >
            <Checkbox
              checked={selected.includes(value.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, value.value]
                    : selected.filter((held) => held !== value.value),
                )
              }
            />
            <span
              style={{
                flex: 1,
                fontSize: 12.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {value.label}
            </span>
            <Tag style={{ marginInlineEnd: 0, fontSize: 10.5 }}>{value.count}</Tag>
          </label>
        ))}
        {visible.length === 0 ? (
          <div style={{ padding: 8, fontSize: 12, color: token.textMuted }}>No matches</div>
        ) : null}
      </div>
    </div>
  );
}
