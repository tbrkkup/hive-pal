import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApiaries, useRelocateHives } from '@/api/hooks';
import { useApiary } from '@/hooks/use-apiary';
import { toLocalInputValue } from '@/utils/datetime-input';
import type { RelocateHive } from 'shared-schemas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The colonies to move. One for the detail page, many for a bulk move. */
  hiveIds: string[];
  /**
   * Hidden from the destination list because moving there would be a no-op.
   * Only meaningful when every selected colony shares an apiary.
   */
  currentApiaryId?: string | null;
  onMoved?: () => void;
}

type Reason = NonNullable<RelocateHive['reason']>;
type When = 'now' | 'custom';

export function RelocateDialog({
  open,
  onOpenChange,
  hiveIds,
  currentApiaryId,
  onMoved,
}: Props) {
  const { t } = useTranslation(['hive', 'common']);
  const { data: apiaries } = useApiaries();
  const relocate = useRelocateHives();
  const { activeApiaryId, setActiveApiaryId } = useApiary();

  const [toApiaryId, setToApiaryId] = useState<string>('');
  const [reason, setReason] = useState<Reason | ''>('');
  const [when, setWhen] = useState<When>('now');
  const [customDate, setCustomDate] = useState(() =>
    toLocalInputValue(new Date()),
  );
  const [notes, setNotes] = useState('');

  // Moving a colony to where it already stands is a no-op the backend rejects,
  // so the current site is not offered.
  const destinations = useMemo(
    () => (apiaries ?? []).filter(a => a.id !== currentApiaryId),
    [apiaries, currentApiaryId],
  );

  const plannedDate = when === 'custom' ? new Date(customDate) : null;
  const isPlanned = plannedDate ? plannedDate.getTime() > Date.now() : false;

  const reset = () => {
    setToApiaryId('');
    setReason('');
    setWhen('now');
    setCustomDate(toLocalInputValue(new Date()));
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!toApiaryId || hiveIds.length === 0) return;
    try {
      const result = await relocate.mutateAsync({
        hiveIds,
        toApiaryId,
        ...(when === 'custom' && { date: new Date(customDate).toISOString() }),
        ...(reason && { reason }),
        ...(notes.trim() && { notes: notes.trim() }),
      });
      const applied = result.moved.some(m => m.applied);
      // Views are scoped to the active apiary via the x-apiary-id header. Once
      // the colonies have actually left, keeping the old apiary selected would
      // make the page the user is standing on fail to load them.
      if (applied && activeApiaryId !== toApiaryId) {
        setActiveApiaryId(toApiaryId);
      }
      const count = result.moved.length;
      toast.success(
        applied
          ? t('hive:relocate.toastMoved', {
              defaultValue: 'Moved {{count}} colony',
              defaultValue_other: 'Moved {{count}} colonies',
              count,
            })
          : t('hive:relocate.toastScheduled', {
              defaultValue: 'Move scheduled for {{count}} colony',
              defaultValue_other: 'Move scheduled for {{count}} colonies',
              count,
            }),
      );
      reset();
      onMoved?.();
      onOpenChange(false);
    } catch {
      toast.error(
        t('hive:relocate.toastError', {
          defaultValue: 'Could not move the colony. Please try again.',
        }),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-test="relocate-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {t('hive:relocate.title', {
              defaultValue: 'Move to another apiary',
            })}
            {hiveIds.length > 1 && (
              <span className="text-sm font-normal text-muted-foreground">
                {t('hive:relocate.countSuffix', {
                  defaultValue: '({{count}} colonies)',
                  count: hiveIds.length,
                })}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {t('hive:relocate.description', {
              defaultValue:
                'An apiary is a location, so moving the colony there is recorded on its timeline.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              {t('hive:relocate.destination', { defaultValue: 'Destination' })}
            </Label>
            <Select value={toApiaryId} onValueChange={setToApiaryId}>
              <SelectTrigger data-test="relocate-destination">
                <SelectValue
                  placeholder={t('hive:relocate.selectDestination', {
                    defaultValue: 'Select an apiary',
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {destinations.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.location ? ` (${a.location})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {destinations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('hive:relocate.noOtherApiary', {
                  defaultValue:
                    'You have no other apiary yet — create one to move colonies there.',
                })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('hive:relocate.when', { defaultValue: 'When' })}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={when === 'now' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setWhen('now')}
                data-test="relocate-when-now"
              >
                {t('hive:relocate.now', { defaultValue: 'Now' })}
              </Button>
              <Button
                type="button"
                variant={when === 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setWhen('custom')}
                data-test="relocate-when-custom"
              >
                {t('hive:relocate.pickDateTime', {
                  defaultValue: 'Date and time',
                })}
              </Button>
            </div>
            {when === 'custom' && (
              <Input
                type="datetime-local"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                data-test="relocate-date"
              />
            )}
            {isPlanned && (
              <p className="text-sm text-muted-foreground" data-test="relocate-planned-hint">
                {t('hive:relocate.plannedHint', {
                  defaultValue:
                    'This date is in the future: the move is recorded now and takes effect on that day.',
                })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('hive:relocate.reason', { defaultValue: 'Reason' })}</Label>
            <Select
              value={reason}
              onValueChange={v => setReason(v as Reason)}
            >
              <SelectTrigger data-test="relocate-reason">
                <SelectValue
                  placeholder={t('hive:relocate.reasonOptional', {
                    defaultValue: 'Optional',
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FORAGE">
                  {t('hive:relocate.reasons.FORAGE', { defaultValue: 'Forage' })}
                </SelectItem>
                <SelectItem value="OVERWINTERING">
                  {t('hive:relocate.reasons.OVERWINTERING', {
                    defaultValue: 'Overwintering',
                  })}
                </SelectItem>
                <SelectItem value="OTHER">
                  {t('hive:relocate.reasons.OTHER', { defaultValue: 'Other' })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              {t('hive:relocate.notes', { defaultValue: 'Notes (optional)' })}
            </Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              data-test="relocate-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!toApiaryId || relocate.isPending}
            data-test="relocate-submit"
          >
            {t('hive:relocate.submit', {
              defaultValue: 'Move colony',
              defaultValue_other: 'Move {{count}} colonies',
              count: hiveIds.length,
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RelocateDialog;
