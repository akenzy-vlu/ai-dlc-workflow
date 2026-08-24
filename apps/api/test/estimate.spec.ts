import { describe, expect, it } from 'vitest';

import { Estimate, Gate, WorkStatus } from '../src/shared/kernel';

describe('Estimate', () => {
  it('normalises the units uow_graph.py accepts', () => {
    expect(Estimate.parse('3h').hours).toBe(3);
    expect(Estimate.parse('30m').hours).toBe(0.5);
    expect(Estimate.parse('1d').hours).toBe(8);
    expect(Estimate.parse('2').hours).toBe(2);
    expect(Estimate.parse('1.5h').hours).toBe(1.5);
  });

  it('yields zero rather than throwing on junk', () => {
    // The console has to be able to render a plan the validator would reject; refusing
    // to display it would hide exactly the plans that need attention.
    expect(Estimate.parse('soon').hours).toBe(0);
    expect(Estimate.parse(undefined).hours).toBe(0);
  });
});

describe('Gate', () => {
  it('orders gates and names the next one', () => {
    expect(Gate.create('G3').index).toBe(3);
    expect(Gate.create('G3').next?.value).toBe('G4');
    expect(Gate.create('G5').next).toBeNull();
    expect(Gate.NONE.index).toBe(-1);
    expect(Gate.NONE.next?.value).toBe('G0');
  });

  it('knows what has been passed', () => {
    expect(Gate.create('G4').hasPassed(Gate.create('G3'))).toBe(true);
    expect(Gate.create('G2').hasPassed(Gate.create('G3'))).toBe(false);
  });

  it('falls back to none for unreadable input rather than throwing', () => {
    expect(Gate.tryCreate('nonsense').isNone).toBe(true);
    expect(() => Gate.create('G9')).toThrow();
  });
});

describe('WorkStatus', () => {
  it('normalises markdown emphasis found in hand-written files', () => {
    expect(WorkStatus.create('**done**').value).toBe('done');
    expect(WorkStatus.create('DONE').value).toBe('done');
  });

  it('treats an unrecognised status as todo', () => {
    expect(WorkStatus.create('almost').value).toBe('todo');
  });
});
