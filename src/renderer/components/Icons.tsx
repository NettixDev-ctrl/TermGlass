import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 14,
  height: 14,
  viewBox: '0 0 14 14',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
};

export const PlusIcon = () => (
  <svg {...base}>
    <path d="M7 2.5v9M2.5 7h9" />
  </svg>
);
export const CloseIcon = ({ size = 12 }: { size?: number }) => (
  <svg {...base} width={size} height={size}>
    <path d="M3 3l8 8M11 3l-8 8" />
  </svg>
);
export const MinimizeIcon = () => (
  <svg {...base} strokeWidth={1.2}>
    <path d="M3 7h8" />
  </svg>
);
export const MaximizeIcon = () => (
  <svg {...base} strokeWidth={1.2}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
  </svg>
);
export const RestoreIcon = () => (
  <svg {...base} strokeWidth={1.2}>
    <rect x="3" y="5" width="6" height="6" rx="1.2" />
    <path d="M5.5 5V4a1.2 1.2 0 0 1 1.2-1.2H10A1.2 1.2 0 0 1 11.2 4v3.3A1.2 1.2 0 0 1 10 8.5H9" />
  </svg>
);
export const SidebarIcon = () => (
  <svg {...base}>
    <rect x="2" y="2.8" width="10" height="8.4" rx="2" />
    <path d="M5.3 3v8" />
  </svg>
);
export const ChevronUpIcon = () => (
  <svg {...base} width={12} height={12}>
    <path d="M3 8.5L7 4.5l4 4" />
  </svg>
);
export const ChevronDownIcon = () => (
  <svg {...base} width={12} height={12}>
    <path d="M3 5.5l4 4 4-4" />
  </svg>
);
export const GearIcon = () => (
  <svg {...base}>
    <circle cx="7" cy="7" r="1.8" />
    <path d="M7 1.8v1.4M7 10.8v1.4M1.8 7h1.4M10.8 7h1.4M3.3 3.3l1 1M9.7 9.7l1 1M10.7 3.3l-1 1M4.3 9.7l-1 1" />
  </svg>
);
