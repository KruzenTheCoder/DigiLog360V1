/**
 * A faint constellation for the roles section — points joined into a loose
 * network, standing in for a team spread across sites.
 *
 * The points are a fixed list rather than generated, so the server and the
 * client always draw the same figure and nothing shifts on hydration. Only
 * three nodes pulse; the rest are static, which keeps this to a handful of
 * animated layers rather than one per point.
 */

// x, y in the viewBox's own coordinate space.
const NODES: [number, number][] = [
  [80, 90], [210, 40], [330, 120], [190, 190], [70, 250],
  [450, 70], [560, 160], [430, 230], [700, 50], [820, 140],
  [690, 210], [950, 90], [1080, 180], [900, 250], [1140, 60],
];

// Index pairs — drawn as thin lines between neighbours.
const LINKS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [3, 0], [1, 5], [5, 6], [6, 7],
  [7, 3], [5, 8], [8, 9], [9, 10], [10, 6], [9, 11], [11, 12],
  [12, 13], [13, 10], [11, 14],
];

// Nodes that get a slow pulse, chosen to be spread across the width.
const PULSING = new Set([1, 6, 12]);

export function Constellation() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1200 300"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g stroke="rgba(255,255,255,0.09)" strokeWidth="1">
          {LINKS.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={NODES[a]![0]}
              y1={NODES[a]![1]}
              x2={NODES[b]![0]}
              y2={NODES[b]![1]}
            />
          ))}
        </g>
        <g>
          {NODES.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={PULSING.has(i) ? 3 : 2}
              fill={PULSING.has(i) ? 'rgba(165,180,252,0.55)' : 'rgba(255,255,255,0.18)'}
            >
              {PULSING.has(i) && (
                <animate
                  attributeName="opacity"
                  values="0.35;1;0.35"
                  dur={`${6 + i * 1.5}s`}
                  repeatCount="indefinite"
                />
              )}
            </circle>
          ))}
        </g>
      </svg>
    </div>
  );
}
