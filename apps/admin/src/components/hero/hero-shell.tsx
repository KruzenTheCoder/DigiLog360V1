import type { CSSProperties, ReactNode } from 'react';

/**
 * The frame every page hero sits in.
 *
 * Deliberately thin. The proposal's rule was that each page gets its own
 * composition rather than one component with different words in it, so this
 * owns only the things that must be identical everywhere:
 *
 *   • a reserved minimum height, so nothing below the hero moves as the
 *     entrance runs — a hero that animates into an unreserved box is the
 *     usual source of layout shift on a redesign;
 *   • `overflow-hidden` and `isolate`, so a hero's own depth layers can never
 *     widen the page or leak into the section beneath;
 *   • top padding that clears the floating nav, which sits over the hero
 *     rather than above it;
 *   • the scroll-linked exit, so the hero hands over to the first section
 *     instead of simply stopping.
 *
 * Everything visual is the page's own job.
 */
export function HeroShell({
  children,
  className,
  /** Painted behind the composition. Utility classes or an inline background. */
  ground,
  style,
  /** Shorter heroes (the quieter pages) do not need a full screen. */
  height = 'full',
  /** Lift and fade the whole composition as the visitor scrolls past it. */
  exit = true,
}: {
  children: ReactNode;
  className?: string;
  ground?: string;
  style?: CSSProperties;
  height?: 'full' | 'tall' | 'short';
  exit?: boolean;
}) {
  const min =
    height === 'full' ? 'min-h-[min(88svh,760px)]'
      : height === 'tall' ? 'min-h-[min(70svh,620px)]'
        : 'min-h-[min(52svh,460px)]';

  return (
    <section
      className={[
        'relative isolate w-full overflow-hidden',
        min,
        'flex flex-col justify-center',
        // The horizontal gutter belongs to `site-w` on the inner element —
        // setting it here as well would pad the page twice.
        'pb-16 pt-28 lg:pb-24 lg:pt-32',
        ground ?? '',
        className ?? '',
      ].join(' ')}
      style={style}
    >
      <div className={exit ? 'hero-exit relative z-10 site-w' : 'relative z-10 site-w'}>
        {children}
      </div>
    </section>
  );
}

/**
 * A stage in a choreographed entrance.
 *
 * `at` is the moment this stage begins, in milliseconds from the hero's first
 * frame. Expressing the choreography at the call site — rather than as a
 * delay baked into a keyframe — is what lets a hero be read top to bottom as
 * a sequence.
 */
export function Stage({
  at = 0, children, className, as: Tag = 'div',
}: {
  at?: number;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'p' | 'li' | 'span';
}) {
  return (
    <Tag className={`stage ${className ?? ''}`} style={{ '--t': `${at}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/**
 * A line of type lifted out from behind its own clip.
 *
 * The text is present and measurable from the first frame — only the wrapper
 * animates — so a masked headline never costs Largest Contentful Paint.
 */
export function MaskLine({
  at = 0, children, className,
}: {
  at?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className="line-mask">
      <span className={className} style={{ '--t': `${at}ms` } as CSSProperties}>
        {children}
      </span>
    </span>
  );
}
