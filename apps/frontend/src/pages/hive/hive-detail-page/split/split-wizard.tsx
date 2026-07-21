import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Split, Minus, Plus, Crown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useSplitHive, useUndoSplit } from '@/api/hooks';
import type { HiveDetailResponse } from 'shared-schemas';

type QueenDisposition = 'STAYED_WITH_SOURCE' | 'MOVED_TO_NEW';

interface SplitWizardProps {
  hive: HiveDetailResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = ['Frames', 'New hive', 'Queen', 'Confirm'] as const;

export const SplitWizard = ({ hive, open, onOpenChange }: SplitWizardProps) => {
  const broodBoxes = useMemo(
    () =>
      (hive.boxes ?? [])
        .filter((b) => b.type === 'BROOD')
        .sort((a, b) => a.position - b.position),
    [hive.boxes],
  );
  const broodBox = broodBoxes[0];
  const maxFrames = broodBox?.frameCount ?? 0;

  const [step, setStep] = useState(0);
  const [frames, setFrames] = useState(Math.min(3, maxFrames || 3));
  const [name, setName] = useState(
    `${hive.name} · Ableger ${format(new Date(), 'yyyy-MM-dd')}`,
  );
  const [queen, setQueen] = useState<QueenDisposition>('STAYED_WITH_SOURCE');
  const [followUpDays, setFollowUpDays] = useState(24);

  const split = useSplitHive();
  const undo = useUndoSplit();
  const hasQueen = Boolean(hive.activeQueen);

  const reset = () => {
    setStep(0);
    setFrames(Math.min(3, maxFrames || 3));
    setName(`${hive.name} · Ableger ${format(new Date(), 'yyyy-MM-dd')}`);
    setQueen('STAYED_WITH_SOURCE');
    setFollowUpDays(24);
  };

  const close = (openState: boolean) => {
    if (!openState) reset();
    onOpenChange(openState);
  };

  const queenlessSide =
    queen === 'MOVED_TO_NEW' ? hive.name : 'the new hive';

  const handleConfirm = async () => {
    if (!broodBox?.id) return;
    try {
      const res = await split.mutateAsync({
        id: hive.id,
        apiaryId: hive.apiaryId ?? undefined,
        data: {
          date: new Date().toISOString(),
          newHiveName: name.trim(),
          framesMoved: [{ boxId: broodBox.id, count: frames }],
          queenDisposition: queen,
          followUpDays,
        },
      });
      close(false);
      toast.success(`Split done — created "${name.trim()}"`, {
        action: {
          label: 'Undo',
          onClick: () =>
            undo
              .mutateAsync({
                hiveId: hive.id,
                splitId: res.splitId,
                apiaryId: hive.apiaryId ?? undefined,
              })
              .then(() => toast.success('Split undone'))
              .catch(() => toast.error('Could not undo the split')),
        },
      });
    } catch {
      toast.error('Split failed. Please check the values and try again.');
    }
  };

  const canNext =
    step === 0
      ? frames >= 1 && frames <= maxFrames
      : step === 1
        ? name.trim().length > 0
        : true;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-4 w-4" /> Split colony — {hive.name}
          </DialogTitle>
        </DialogHeader>

        {/* step progress */}
        <div className="flex gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1 text-center">
              <div
                className={cn(
                  'h-1 rounded-full mb-1.5 transition-colors',
                  i <= step ? 'bg-primary' : 'bg-muted',
                )}
              />
              <span
                className={cn(
                  'text-[11px]',
                  i === step
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {!broodBox ? (
          <p className="py-6 text-sm text-muted-foreground">
            This hive has no brood box to take frames from.
          </p>
        ) : (
          <div className="py-2 min-h-[200px]">
            {/* STEP 1 — frames */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium">
                    How many brood frames to move?
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    The new colony starts with exactly these frames.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="inline-flex items-center rounded-md border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-10 rounded-none"
                      aria-label="Fewer frames"
                      onClick={() => setFrames((f) => Math.max(1, f - 1))}
                      disabled={frames <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-12 text-center font-semibold tabular-nums">
                      {frames}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-10 rounded-none"
                      aria-label="More frames"
                      onClick={() =>
                        setFrames((f) => Math.min(maxFrames, f + 1))
                      }
                      disabled={frames >= maxFrames}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    of {maxFrames} frames
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border bg-muted/30 p-4">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">
                      {hive.name} after
                    </div>
                    <div className="text-xl font-semibold tabular-nums">
                      {maxFrames - frames}
                    </div>
                  </div>
                  <div className="text-primary">→</div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">New hive</div>
                    <div className="text-xl font-semibold tabular-nums">
                      {frames}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 — new hive */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium">New colony</h4>
                  <p className="text-sm text-muted-foreground">
                    It inherits the mother&apos;s settings and stays in the same
                    apiary.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="split-name">Name</Label>
                  <Input
                    id="split-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* STEP 3 — queen */}
            {step === 2 && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium">Who keeps the queen?</h4>
                  <p className="text-sm text-muted-foreground">
                    The queenless side gets a follow-up reminder automatically.
                  </p>
                </div>
                <QueenOption
                  selected={queen === 'STAYED_WITH_SOURCE'}
                  onSelect={() => setQueen('STAYED_WITH_SOURCE')}
                  title="Queen stays with the mother"
                  desc="The new hive is queenless and will raise (or be given) a queen."
                />
                <QueenOption
                  selected={queen === 'MOVED_TO_NEW'}
                  onSelect={() => hasQueen && setQueen('MOVED_TO_NEW')}
                  disabled={!hasQueen}
                  title="Move the queen to the new hive"
                  desc={
                    hasQueen
                      ? 'The mother becomes queenless.'
                      : 'No active queen recorded on this hive.'
                  }
                />
                <div className="flex items-center gap-2 rounded-md border border-dashed p-2.5 text-sm text-muted-foreground">
                  <span>Remind me to check requeening in</span>
                  <Input
                    type="number"
                    min={0}
                    value={followUpDays}
                    onChange={(e) =>
                      setFollowUpDays(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="h-8 w-16 tabular-nums"
                  />
                  <span>days</span>
                </div>
              </div>
            )}

            {/* STEP 4 — confirm */}
            {step === 3 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Summary</h4>
                <div className="rounded-lg border divide-y text-sm">
                  <Row k={`Moved from ${hive.name}`} v={`${frames} brood frames`} />
                  <Row k={`${hive.name} after`} v={`${maxFrames - frames} frames`} />
                  <Row k="New hive" v={name.trim()} />
                  <Row
                    k="Queen"
                    v={
                      queen === 'MOVED_TO_NEW'
                        ? 'moves to the new hive'
                        : 'stays with the mother'
                    }
                  />
                  <Row
                    k="Reminder"
                    v={
                      followUpDays > 0
                        ? `in ${followUpDays} days (${queenlessSide})`
                        : 'none'
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {step === 0 ? (
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!broodBox || !canNext}
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={split.isPending || !broodBox}
            >
              <Split className="mr-1.5 h-4 w-4" />
              {split.isPending ? 'Splitting…' : 'Split colony'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between px-3.5 py-2.5">
    <span className="text-muted-foreground">{k}</span>
    <span className="font-medium">{v}</span>
  </div>
);

const QueenOption = ({
  selected,
  onSelect,
  title,
  desc,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onSelect}
    disabled={disabled}
    className={cn(
      'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
      selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
      disabled && 'cursor-not-allowed opacity-60',
    )}
  >
    <span
      className={cn(
        'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border',
        selected ? 'border-primary' : 'border-muted-foreground/40',
      )}
    >
      {selected && <Crown className="h-3 w-3 text-primary" />}
    </span>
    <span>
      <span className="block text-sm font-medium">{title}</span>
      <span className="block text-xs text-muted-foreground">{desc}</span>
    </span>
  </button>
);
