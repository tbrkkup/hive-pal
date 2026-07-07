import { useState } from 'react';
import { formatDistance } from 'date-fns';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { useDismissAlert, useResolveAlert } from '@/api/hooks';
import { useHiveApiaryLookup } from '@/api/hooks/useHives';
import type { AlertResponse } from 'shared-schemas';

export const severityConfig = {
  LOW: {
    icon: Info,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
  MEDIUM: {
    icon: AlertTriangle,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  HIGH: {
    icon: AlertCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/30',
    borderColor: 'border-red-200 dark:border-red-800',
  },
};

export function useAlertActions(alert: AlertResponse) {
  const [isLoading, setIsLoading] = useState(false);
  const dismissAlert = useDismissAlert();
  const resolveAlert = useResolveAlert();
  const lookupApiaryId = useHiveApiaryLookup();
  // Target the alert's own apiary (via its hive) so dismiss/resolve work on a
  // foreign apiary's alert in cross-apiary "view all" mode.
  const apiaryId = lookupApiaryId(alert.hiveId ?? undefined);

  const config = severityConfig[alert.severity];
  const Icon = config.icon;

  const handleDismiss = async () => {
    setIsLoading(true);
    try {
      await dismissAlert.mutateAsync({ id: alert.id, apiaryId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async () => {
    setIsLoading(true);
    try {
      await resolveAlert.mutateAsync({ id: alert.id, apiaryId });
    } finally {
      setIsLoading(false);
    }
  };

  const timeAgo = formatDistance(new Date(alert.createdAt), new Date(), {
    addSuffix: true,
  });

  return { isLoading, config, Icon, handleDismiss, handleResolve, timeAgo };
}
