import { useEffect } from 'react';
import { APIARY_SELECTION, VIEW_ALL_APIARIES } from '@/context/auth-context';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useApiaries } from '@/api/hooks';
import { ApiaryResponse } from 'shared-schemas';

interface ApiaryState {
  activeApiaryId: string | null;
  // When true, the app shows data across ALL of the user's apiaries instead of
  // filtering to a single one. The concrete activeApiaryId is still kept around
  // as the default write target (creating hives etc. needs a target apiary).
  viewAllApiaries: boolean;
  setActiveApiaryId: (id: string) => void;
  clearActiveApiaryId: () => void;
  setViewAllApiaries: (value: boolean) => void;
}

// SSR-safe localStorage access (the store module can be imported during the
// static prerender, where `localStorage` does not exist).
const hasLocalStorage = typeof localStorage !== 'undefined';
const readLS = (key: string): string | null =>
  hasLocalStorage ? localStorage.getItem(key) : null;
const writeLS = (key: string, value: string): void => {
  if (hasLocalStorage) localStorage.setItem(key, value);
};
const removeLS = (key: string): void => {
  if (hasLocalStorage) localStorage.removeItem(key);
};

export const useApiaryStore = create<ApiaryState>(set => {
  // Initialize from localStorage
  const apiaryFromLocalStorage = readLS(APIARY_SELECTION);
  const viewAllFromLocalStorage = readLS(VIEW_ALL_APIARIES) === 'true';

  return {
    activeApiaryId: apiaryFromLocalStorage || null,
    viewAllApiaries: viewAllFromLocalStorage,
    setActiveApiaryId: (id: string) => {
      // Always update localStorage first to ensure the interceptor has access to the latest value.
      // Note: this is the low-level setter for the concrete apiary (also used as
      // the write target). It intentionally does NOT change viewAllApiaries, so
      // the auto-select effect below can refresh the write target without
      // leaving the "all apiaries" view. Use setViewAllApiaries to toggle mode.
      writeLS(APIARY_SELECTION, id);
      set({ activeApiaryId: id });
    },
    clearActiveApiaryId: () => {
      removeLS(APIARY_SELECTION);
      set({ activeApiaryId: null });
    },
    setViewAllApiaries: (value: boolean) => {
      if (value) {
        writeLS(VIEW_ALL_APIARIES, 'true');
      } else {
        removeLS(VIEW_ALL_APIARIES);
      }
      set({ viewAllApiaries: value });
    },
  };
});

export const useApiary = () => {
  const { data: apiaries, isSuccess: apiariesLoaded } = useApiaries();
  const {
    activeApiaryId,
    viewAllApiaries,
    setActiveApiaryId,
    clearActiveApiaryId,
    setViewAllApiaries,
  } = useApiaryStore(
    useShallow(state => ({
      activeApiaryId: state.activeApiaryId,
      viewAllApiaries: state.viewAllApiaries,
      setActiveApiaryId: state.setActiveApiaryId,
      clearActiveApiaryId: state.clearActiveApiaryId,
      setViewAllApiaries: state.setViewAllApiaries,
    })),
  );

  // Validate activeApiaryId against user's apiaries and auto-select.
  useEffect(() => {
    // Only act on a *definitively loaded* apiaries list. While the query is
    // loading or rehydrating, `apiaries` may momentarily be undefined/empty —
    // acting on that transient state would wrongly clear the persisted
    // "view all" mode (turning it into the first single apiary on reload).
    if (!apiariesLoaded || !apiaries) return;

    if (apiaries.length === 0) {
      // User genuinely has no apiaries — clear any stale selection and leave
      // all-view (there is nothing to view across).
      if (activeApiaryId) {
        clearActiveApiaryId();
      }
      if (viewAllApiaries) {
        setViewAllApiaries(false);
      }
    } else if (!activeApiaryId || !apiaries.some(a => a.id === activeApiaryId)) {
      // No selection or stale selection — set to first available. This keeps a
      // valid write target even while viewing all apiaries. It deliberately
      // does NOT touch viewAllApiaries, so a persisted "view all" choice
      // survives across reloads.
      setActiveApiaryId(apiaries[0].id);
    }
  }, [
    apiariesLoaded,
    apiaries,
    activeApiaryId,
    viewAllApiaries,
    setActiveApiaryId,
    clearActiveApiaryId,
    setViewAllApiaries,
  ]);

  // Find the active apiary object
  const activeApiary = apiaries?.find(
    (apiary: ApiaryResponse) => apiary.id === activeApiaryId,
  );

  return {
    activeApiary,
    setActiveApiaryId,
    setViewAllApiaries,
    viewAllApiaries,
    apiaries,
    activeApiaryId,
  };
};
