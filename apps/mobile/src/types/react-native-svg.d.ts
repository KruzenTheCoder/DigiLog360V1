// Ambient stub so the signature canvas typechecks before `npm install`.
declare module 'react-native-svg' {
  import type { ComponentType, ReactNode } from 'react';
  interface PathProps {
    d: string; stroke?: string; strokeWidth?: number;
    fill?: string; strokeLinecap?: string; strokeLinejoin?: string;
  }
  export const Path: ComponentType<PathProps>;
  export interface SvgProps {
    width?: number | string; height?: number | string;
    viewBox?: string; style?: unknown;
    children?: ReactNode;
  }
  const Svg: ComponentType<SvgProps>;
  export default Svg;
}
