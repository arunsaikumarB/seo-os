import { useQuery } from '@tanstack/react-query';
import { useApi } from './use-api';
import type { FeatureFlag } from '@seo-os/shared';

type FeatureFlags = Record<FeatureFlag, boolean>;

export function useFeatureFlags() {
  const { request } = useApi();

  const query = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => request<{ data: FeatureFlags }>('/v1/feature-flags'),
    staleTime: 60_000,
  });

  return {
    flags: query.data?.data,
    isEnabled: (flag: FeatureFlag) => query.data?.data?.[flag] ?? false,
    isLoading: query.isLoading,
  };
}
