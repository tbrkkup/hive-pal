import { format } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ActionDateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  label?: string;
}

/**
 * Day and time for a timeline action.
 *
 * Actions have no all-day concept the way inspections do, so the time is
 * always editable. Picking a day deliberately keeps the time that is already
 * set — the calendar hands back midnight, and adopting that would silently
 * discard when the entry actually happened.
 */
export const ActionDateTimePicker: React.FC<ActionDateTimePickerProps> = ({
  value,
  onChange,
  label = 'Action Date',
}) => {
  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const next = new Date(day);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(next);
  };

  const handleTimeChange = (time: string) => {
    if (!time) return;
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(value);
    next.setHours(hours, minutes, 0, 0);
    onChange(next);
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'flex-1 justify-start text-left font-normal',
                !value && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value ? format(value, 'PPP') : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={value}
              onSelect={handleDaySelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Input
            type="time"
            className="w-32"
            aria-label="Action time"
            data-test="action-time"
            value={format(value, 'HH:mm')}
            onChange={e => handleTimeChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

export default ActionDateTimePicker;
