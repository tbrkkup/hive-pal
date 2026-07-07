import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { useApiaryStore } from '@/hooks/use-apiary';
import { apiaryHeaderConfig } from './useHives';
import {
  DocumentResponse,
  DocumentFilter,
} from 'shared-schemas';

export const DOCUMENT_KEYS = {
  all: ['documents'] as const,
  // Scope ('all' or the selected apiary id) keeps single- and cross-apiary
  // results in separate cache entries.
  list: (scope: string | null, filters?: DocumentFilter) =>
    [...DOCUMENT_KEYS.all, 'list', scope, filters] as const,
  detail: (id: string) => [...DOCUMENT_KEYS.all, 'detail', id] as const,
  downloadUrl: (id: string) =>
    [...DOCUMENT_KEYS.all, 'download-url', id] as const,
};

export const useDocuments = (
  filters?: DocumentFilter,
  options?: { enabled?: boolean },
) => {
  const activeApiaryId = useApiaryStore(state => state.activeApiaryId);
  const viewAllApiaries = useApiaryStore(state => state.viewAllApiaries);
  const scope = filters?.apiaryId ?? (viewAllApiaries ? 'all' : activeApiaryId);
  return useQuery<DocumentResponse[]>({
    queryKey: DOCUMENT_KEYS.list(scope, filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.hiveId) params.set('hiveId', filters.hiveId);
      if (filters?.apiaryId) params.set('apiaryId', filters.apiaryId);
      if (filters?.startDate) params.set('startDate', filters.startDate);
      if (filters?.endDate) params.set('endDate', filters.endDate);
      const query = params.toString();
      // An explicit apiary filter forces that apiary regardless of view-all,
      // so it wins over the interceptor's cross-apiary header.
      const config = filters?.apiaryId
        ? { headers: { 'x-apiary-id': filters.apiaryId } }
        : undefined;
      const response = await apiClient.get<DocumentResponse[]>(
        `/api/documents${query ? `?${query}` : ''}`,
        config,
      );
      return response.data;
    },
    enabled: options?.enabled !== false,
  });
};

export const useCreateDocument = () => {
  const queryClient = useQueryClient();

  return useMutation<DocumentResponse, Error, FormData>({
    mutationFn: async formData => {
      const response = await apiClient.post<DocumentResponse>(
        '/api/documents',
        formData,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: DOCUMENT_KEYS.all,
      });
    },
  });
};

export const useDeleteDocument = () => {
  const queryClient = useQueryClient();

  // Accepts either a bare id (single-apiary mode) or { id, apiaryId } so that
  // cross-apiary deletes in "view all" mode target the document's own apiary.
  return useMutation<void, Error, string | { id: string; apiaryId?: string }>({
    mutationFn: async arg => {
      const { id, apiaryId } =
        typeof arg === 'string' ? { id: arg, apiaryId: undefined } : arg;
      await apiClient.delete(
        `/api/documents/${id}`,
        apiaryHeaderConfig(apiaryId),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: DOCUMENT_KEYS.all,
      });
    },
  });
};

export const useDocumentDownloadUrl = (
  id: string,
  options?: { enabled?: boolean },
) => {
  return useQuery<{ downloadUrl: string; expiresIn: number }>({
    queryKey: DOCUMENT_KEYS.downloadUrl(id),
    queryFn: async () => {
      const response = await apiClient.get<{ downloadUrl: string; expiresIn: number }>(
        `/api/documents/${id}/download-url`,
      );
      return response.data;
    },
    enabled: options?.enabled !== false && !!id,
    staleTime: 1000 * 60 * 50,
  });
};
