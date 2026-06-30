import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand-gradient text-white shadow-sm hover:opacity-90',
        // Explicit text colour so the button stays legible even inside a
        // coloured/`text-white` parent (e.g. the PageHeader banner) — without it
        // the button inherits white text on a white surface and disappears.
        secondary: 'border bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] hover:bg-slate-50 dark:hover:bg-slate-800',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        ghost: 'text-[hsl(var(--foreground))] hover:bg-slate-100 dark:hover:bg-slate-800',
        outline: 'border border-brand text-brand hover:bg-brand/10',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  // Default to type="button" — without this, any <Button> placed inside a
  // <form> implicitly becomes a submit button (HTML default) and triggers
  // a form submission on click, which is almost never what we want. Callers
  // that DO want a submit button still pass `type="submit"` explicitly.
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
