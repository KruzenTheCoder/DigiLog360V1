// Lightweight signature pad using react-native-svg paths.
// Exposes a `getDataUrl` ref so callers can grab the signature as an
// inline SVG data URL (suitable for storing in *_signature_data_url cols).
import {
  forwardRef, useImperativeHandle, useRef, useState,
} from 'react';
import {
  View, PanResponder, StyleSheet, GestureResponderEvent, ViewStyle,
  TouchableOpacity, Text,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme, radius } from '@/lib/theme';

export interface SignatureCanvasHandle {
  clear: () => void;
  getDataUrl: () => string | null;
  isEmpty: () => boolean;
}

interface Props {
  height?: number;
  style?: ViewStyle;
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, Props>(function SignatureCanvas(
  { height = 200, style },
  ref,
) {
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef<string>('');

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      current.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
    },
    onPanResponderMove: (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      current.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
      // Live-update so the stroke renders progressively.
      setPaths((prev) => prev.length === 0 || prev[prev.length - 1].startsWith('M') === false
        ? [...prev, current.current]
        : [...prev.slice(0, -1), current.current]);
    },
    onPanResponderRelease: () => {
      setPaths((prev) => [...prev, current.current]);
      current.current = '';
    },
  })).current;

  useImperativeHandle(ref, () => ({
    clear: () => { setPaths([]); current.current = ''; },
    isEmpty: () => paths.length === 0,
    getDataUrl: () => {
      if (paths.length === 0) return null;
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 ${height}" width="320" height="${height}">` +
        paths.map((d) => `<path d="${d}" stroke="#0f172a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('') +
        `</svg>`;
      return `data:image/svg+xml;base64,${btoa(svg)}`;
    },
  }), [paths, height]);

  return (
    <View style={[styles.wrap, { height }, style]} {...pan.panHandlers}>
      <Svg width="100%" height={height}>
        {paths.map((d, i) => (
          <Path
            key={i}
            d={d}
            stroke="#0f172a"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
      <TouchableOpacity
        onPress={() => { setPaths([]); current.current = ''; }}
        style={styles.clear}
      >
        <Text style={styles.clearText}>Clear</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    position: 'relative',
  },
  clear: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: theme.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  clearText: { color: theme.text, fontSize: 11, fontWeight: '600' },
});
