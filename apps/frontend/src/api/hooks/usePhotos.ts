import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { useApiaryStore } from '@/hooks/use-apiary';
import { apiaryHeaderConfig } from './useHives';
import {
  PhotoResponse,
  PhotoFilter,
} from 'shared-schemas';

export const PHOTO_KEYS = {
  all: ['photos'] as const,
  // Scope ('all' or the selected apiary id) keeps single- and cross-apiary
  // results in separate cache entries.
  list: (scope: string | null, filters?: PhotoFilter) =>
    [...PHOTO_KEYS.all, 'list', scope, filters] as const,
  detail: (id: string) => [...PHOTO_KEYS.all, 'detail', id] as const,
  downloadUrl: (id: string) =>
    [...PHOTO_KEYS.all, 'download-url', id] as const,
};

export const usePhotos = (
  filters?: PhotoFilter,
  options?: { enabled?: boolean },
) => {
  const activeApiaryId = useApiaryStore(state => state.activeApiaryId);
  const viewAllApiaries = useApiaryStore(state => state.viewAllApiaries);
  const scope = filters?.apiaryId ?? (viewAllApiaries ? 'all' : activeApiaryId);
  return useQuery<PhotoResponse[]>({
    queryKey: PHOTO_KEYS.list(scope, filters),
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
      const response = await apiClient.get<PhotoResponse[]>(
        `/api/photos${query ? `?${query}` : ''}`,
        config,
      );
      return response.data;
    },
    enabled: options?.enabled !== false,
  });
};

export const useCreatePhoto = () => {
  const queryClient = useQueryClient();

  return useMutation<PhotoResponse, Error, FormData>({
    mutationFn: async formData => {
      const response = await apiClient.post<PhotoResponse>(
        '/api/photos',
        formData,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PHOTO_KEYS.all,
      });
    },
  });
};

export const useDeletePhoto = () => {
  const queryClient = useQueryClient();

  // Accepts either a bare id (single-apiary mode) or { id, apiaryId } so that
  // cross-apiary deletes in "view all" mode target the photo's own apiary.
  return useMutation<void, Error, string | { id: string; apiaryId?: string }>({
    mutationFn: async arg => {
      const { id, apiaryId } =
        typeof arg === 'string' ? { id: arg, apiaryId: undefined } : arg;
      await apiClient.delete(`/api/photos/${id}`, apiaryHeaderConfig(apiaryId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PHOTO_KEYS.all,
      });
    },
  });
};

// --- Inspection Photo Hooks ---

export const INSPECTION_PHOTO_KEYS = {
  all: (inspectionId: string) =>
    ['inspection-photos', inspectionId] as const,
  downloadUrl: (inspectionId: string, photoId: string) =>
    ['inspection-photos', inspectionId, 'download-url', photoId] as const,
};

export const useInspectionPhotos = (
  inspectionId?: string,
  options?: { enabled?: boolean },
) => {
  return useQuery<PhotoResponse[]>({
    queryKey: INSPECTION_PHOTO_KEYS.all(inspectionId!),
    queryFn: async () => {
      const response = await apiClient.get<PhotoResponse[]>(
        `/api/inspections/${inspectionId}/photos`,
      );
      return response.data;
    },
    enabled: !!inspectionId && options?.enabled !== false,
  });
};

export const useUploadInspectionPhoto = (inspectionId: string) => {
  const queryClient = useQueryClient();

  return useMutation<PhotoResponse, Error, FormData>({
    mutationFn: async formData => {
      const response = await apiClient.post<PhotoResponse>(
        `/api/inspections/${inspectionId}/photos`,
        formData,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: INSPECTION_PHOTO_KEYS.all(inspectionId),
      });
    },
  });
};

export const useDeleteInspectionPhoto = (inspectionId: string) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async photoId => {
      await apiClient.delete(
        `/api/inspections/${inspectionId}/photos/${photoId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: INSPECTION_PHOTO_KEYS.all(inspectionId),
      });
    },
  });
};

export const useInspectionPhotoDownloadUrl = (
  inspectionId: string,
  photoId: string,
  options?: { enabled?: boolean },
) => {
  return useQuery<{ downloadUrl: string; expiresIn: number }>({
    queryKey: INSPECTION_PHOTO_KEYS.downloadUrl(inspectionId, photoId),
    queryFn: async () => {
      const response = await apiClient.get<{
        downloadUrl: string;
        expiresIn: number;
      }>(
        `/api/inspections/${inspectionId}/photos/${photoId}/download-url`,
      );
      return response.data;
    },
    enabled: options?.enabled !== false && !!inspectionId && !!photoId,
    staleTime: 1000 * 60 * 50,
  });
};

export const getInspectionPhotoDownloadUrl = async (
  inspectionId: string,
  photoId: string,
): Promise<string> => {
  const response = await apiClient.get<{
    downloadUrl: string;
    expiresIn: number;
  }>(
    `/api/inspections/${inspectionId}/photos/${photoId}/download-url`,
  );
  return response.data.downloadUrl;
};

export const useStandalonePhotoDownloadUrl = (
  id: string,
  options?: { enabled?: boolean },
) => {
  return useQuery<{ downloadUrl: string; expiresIn: number }>({
    queryKey: PHOTO_KEYS.downloadUrl(id),
    queryFn: async () => {
      const response = await apiClient.get<{ downloadUrl: string; expiresIn: number }>(
        `/api/photos/${id}/download-url`,
      );
      return response.data;
    },
    enabled: options?.enabled !== false && !!id,
    staleTime: 1000 * 60 * 50,
  });
};
