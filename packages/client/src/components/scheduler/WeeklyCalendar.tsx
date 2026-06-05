import type { CandidateSchedule } from '@/lib/scheduler';
import { parseTimeToMinutes, parseInterval } from '@/lib/score';
import { cn } from '@/lib/utils';

const colors = [
  'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300',
  'bg-green-500/20 border-green-500 text-green-700 dark:text-green-300',
  'bg-purple-500/20 border-purple-500 text-purple-700 dark:text-purple-300',
  'bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-300',
  'bg-red-500/20 border-red-500 text-red-700 dark:text-red-300',
  'bg-teal-500/20 border-teal-500 text-teal-700 dark:text-teal-300',
];

interface WeeklyCalendarProps {
  schedule: CandidateSchedule;
}

export default function WeeklyCalendar({ schedule }: WeeklyCalendarProps) {
  const days = ['M', 'T', 'W', 'R', 'F'];
  const dayLabels = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };

  // 8 AM to 9 PM
  const startHour = 8;
  const endHour = 21;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  // Helper to get block position — uses canonical parseTimeToMinutes from score.ts
  const getPosition = (timeStr: string) => {
    const minutes = parseTimeToMinutes(timeStr);
    if (minutes === -1) return 0;
    const minutesSinceStart = minutes - (startHour * 60);
    return (minutesSinceStart / (13 * 60)) * 100; // 13 hours total (8am to 9pm)
  };

  // Helper to get block height — uses canonical parseInterval from score.ts
  const getDuration = (intervalStr: string) => {
    const interval = parseInterval(intervalStr);
    if (!interval) return 0;
    const [start, end] = interval;
    return ((end - start) / (13 * 60)) * 100;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4">
      {/* Calendar Grid Header */}
      <div className="flex border-b border-border mb-2">
        <div className="w-16 shrink-0" />
        {days.map(d => (
          <div key={d} className="flex-1 text-center py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {dayLabels[d as keyof typeof dayLabels]}
          </div>
        ))}
      </div>

      {/* Scrollable Calendar Body */}
      <div className="flex-1 relative overflow-y-auto">
        <div className="flex h-[800px] relative">
          {/* Time axis */}
          <div className="w-16 shrink-0 flex flex-col">
            {hours.map(h => (
              <div key={h} className="flex-1 border-t border-transparent text-[10px] text-muted-foreground pr-2 text-right">
                {h > 12 ? `${h-12} PM` : h === 12 ? '12 PM' : `${h} AM`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 flex relative">
            {days.map(d => (
              <div key={d} className="flex-1 border-l border-muted/30 relative bg-muted/5">
                {/* Horizontal grid lines */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-muted/20"
                    style={{ top: `${((h - startHour) / 13) * 100}%` }}
                  />
                ))}
              </div>
            ))}

            {/* Course Blocks Overlay */}
            <div className="absolute inset-0 pointer-events-none flex">
              <div className="w-px shrink-0" /> {/* Match axis spacer */}
              {days.map(d => (
                <div key={d} className="flex-1 relative">
                  {schedule.sections.map((s, idx) => {
                    const meetings = s.meetings.filter(m => m.days?.includes(d));
                    return meetings.map((m, midx) => (
                      <div
                        key={`${s.unique}-${midx}`}
                        className={cn(
                          "absolute left-1 right-1 border rounded p-1 overflow-hidden pointer-events-auto",
                          colors[idx % colors.length]
                        )}
                        style={{
                          top: `${getPosition(m.time.split('-')[0])}%`,
                          height: `${getDuration(m.time)}%`,
                        }}
                      >
                        <p className="text-[10px] font-bold truncate leading-tight">{s.courseId}</p>
                        <p className="text-[9px] truncate leading-tight opacity-80">{s.instructor}</p>
                        <p className="text-[8px] truncate leading-tight opacity-60">{m.room}</p>
                      </div>
                    ));
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
