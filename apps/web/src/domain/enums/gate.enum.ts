/**
 * The six AI-DLC gates, in the only order they can be passed.
 *
 * `none` is a feature that has been initialised but has not cleared G0. A feature
 * directory with no state file at all is *unmanaged*, which is a different thing and is
 * carried on the entity, not here.
 */
export const GATE_ORDER = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'] as const;

export type GateCode = (typeof GATE_ORDER)[number];
export type GateValue = GateCode | 'none';

export const GATE_TITLES: Record<GateValue, string> = {
  none: 'Initialised, G0 not passed',
  G0: 'Discovery and intent',
  G1: 'Elaboration — assumptions and requirements',
  G2: 'Logical design',
  G3: 'Decomposition — units of work and ticket graph',
  G4: 'Construction complete',
  G5: 'Close',
};

/** Short forms for a track where the full title will not fit. */
export const GATE_SHORT_TITLES: Record<GateCode, string> = {
  G0: 'Discovery and intent',
  G1: 'Elaboration',
  G2: 'Logical design',
  G3: 'Decomposition',
  G4: 'Construction complete',
  G5: 'Close',
};
