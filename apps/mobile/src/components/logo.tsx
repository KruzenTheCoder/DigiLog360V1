// ---------------------------------------------------------------------------
// Logo — the DigiLog360 wordmark, drawn as gradient-filled vector text so it
// stays crisp at any size and needs no raster asset. "DigiLog" is metallic
// blue; "360" is brushed silver — matching the web wordmark
// (apps/admin/src/components/brand/logo.tsx).
// ---------------------------------------------------------------------------
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
  TSpan,
} from 'react-native-svg';

export function Logo({
  width = 240,
  onDark = true,
}: {
  width?: number;
  /** Lighten the gradients so the wordmark reads on a dark backdrop. */
  onDark?: boolean;
}) {
  // The artwork is laid out in a 280×72 viewBox; height follows the width.
  const height = Math.round((width * 72) / 280);

  const blue = onDark
    ? ['#d6ecff', '#7fc1f0', '#3f86d6']
    : ['#7fc1f0', '#2f6fb0', '#173f73'];
  const silver = onDark
    ? ['#ffffff', '#cfd8e2', '#9aa6b2']
    : ['#eef2f6', '#aab4bf', '#788490'];

  return (
    <Svg width={width} height={height} viewBox="0 0 280 72">
      <Defs>
        <LinearGradient id="dl-blue" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={blue[0]} />
          <Stop offset="0.5" stopColor={blue[1]} />
          <Stop offset="1" stopColor={blue[2]} />
        </LinearGradient>
        <LinearGradient id="dl-silver" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={silver[0]} />
          <Stop offset="0.5" stopColor={silver[1]} />
          <Stop offset="1" stopColor={silver[2]} />
        </LinearGradient>
      </Defs>
      <SvgText
        x="0"
        y="54"
        fontSize="52"
        fontWeight="bold"
        letterSpacing="-1"
      >
        <TSpan fill="url(#dl-blue)">DigiLog</TSpan>
        <TSpan fill="url(#dl-silver)">360</TSpan>
      </SvgText>
    </Svg>
  );
}
