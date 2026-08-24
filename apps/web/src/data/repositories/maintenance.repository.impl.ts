import type { MaintenanceRepository } from '@domain/repositories';
import {
  useGetMaintenanceStatusQuery,
  useRefreshCachesMutation,
  useSweepGatesMutation,
} from '../datasource/remote';
import { adaptCommand, adaptQuery } from './adapt';

export const maintenanceRepository: MaintenanceRepository = {
  useStatus: () => adaptQuery(useGetMaintenanceStatusQuery()),
  useRefresh: () => {
    const [trigger, state] = useRefreshCachesMutation();
    return adaptCommand(() => trigger(), state);
  },
  useSweepGates: () => {
    const [trigger, state] = useSweepGatesMutation();
    return adaptCommand(() => trigger(), state);
  },
};
