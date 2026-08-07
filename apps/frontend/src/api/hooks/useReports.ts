import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import { useApiaryStore } from '@/hooks/use-apiary';
import type { ApiaryStatistics, TrendData, ReportPeriod } from 'shared-schemas';

/**
 * The apiary the report covers: a single one, or every accessible apiary in
 * "view all" mode. The value is part of the query key because the cache is
 * persisted — without it one scope's result could be served for another.
 * The x-apiary-id header itself is set by the api client.
 */
const useReportScope = (apiaryId: string | undefined) => {
  const viewAllApiaries = useApiaryStore(state => state.viewAllApiaries);
  return viewAllApiaries ? 'all' : apiaryId;
};

export const useApiaryStatistics = (
  apiaryId: string | undefined,
  period: ReportPeriod = 'ytd',
) => {
  const scope = useReportScope(apiaryId);

  return useQuery({
    queryKey: ['reports', 'statistics', scope, period],
    queryFn: async () => {
      const response = await apiClient.get<ApiaryStatistics>(
        `/api/reports/statistics`,
        { params: { period } },
      );
      return response.data;
    },
    enabled: !!scope,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useApiaryTrends = (
  apiaryId: string | undefined,
  period: ReportPeriod = 'ytd',
) => {
  const scope = useReportScope(apiaryId);

  return useQuery({
    queryKey: ['reports', 'trends', scope, period],
    queryFn: async () => {
      const response = await apiClient.get<TrendData>(`/api/reports/trends`, {
        params: { period },
      });
      return response.data;
    },
    enabled: !!scope,
    staleTime: 5 * 60 * 1000,
  });
};
