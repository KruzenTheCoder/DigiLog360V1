import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  SEVERITY_COLORS, SEVERITY_LABELS, STATUS_COLORS, STATUS_LABELS,
  type SeverityLevel, type OccurrenceStatus,
} from '@digilog/shared';

export function Badge({
  className, color, children, ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={color ? { backgroundColor: `${color}1a`, color } : undefined}
      {...props}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  return <Badge color={SEVERITY_COLORS[severity]}>{SEVERITY_LABELS[severity]}</Badge>;
}

export function StatusBadge({ status }: { status: OccurrenceStatus }) {
  return <Badge color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>;
}
