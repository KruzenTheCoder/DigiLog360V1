'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, Check, X, Delete } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface DialpadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  maxLength?: number;
  allowRandomGenerate?: boolean;
  title?: string;
}

const DIALPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['R', '0', 'C'],
];

export function Dialpad({
  value,
  onChange,
  onConfirm,
  onCancel,
  maxLength = 4,
  allowRandomGenerate = true,
  title = 'Enter PIN',
}: DialpadProps) {
  const [isShaking, setIsShaking] = useState(false);

  const generateRandomPin = useCallback(() => {
    // Generate a random 4-digit number, avoiding common patterns
    let pin: string;
    do {
      pin = Math.floor(1000 + Math.random() * 9000).toString();
    } while (
      // Avoid sequential numbers
      /^(.)*$/.test(pin) || // 1111, 2222, etc.
      /^(0123|1234|2345|3456|4567|5678|6789|7890|8901|9012)$/.test(pin) ||
      /^(3210|4321|5432|6543|7654|8765|9876|0987|1098|2109)$/.test(pin)
    );
    return pin;
  }, []);

  const handleKeyPress = useCallback(
    (key: string) => {
      if (key === 'R' && allowRandomGenerate) {
        const newPin = generateRandomPin();
        onChange(newPin);
        return;
      }

      if (key === 'C') {
        if (value.length > 0) {
          onChange(value.slice(0, -1));
        }
        return;
      }

      // Number key
      if (/^[0-9]$/.test(key)) {
        if (value.length < maxLength) {
          onChange(value + key);
        } else {
          // Shake animation to indicate max length reached
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 300);
        }
      }
    },
    [value, maxLength, onChange, allowRandomGenerate, generateRandomPin]
  );

  const handleConfirm = () => {
    if (value.length === maxLength && onConfirm) {
      onConfirm();
    } else {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 300);
    }
  };

  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <div
          className={cn(
            'flex justify-center gap-2 transition-transform',
            isShaking && 'animate-shake'
          )}
        >
          {Array.from({ length: maxLength }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-all',
                i < value.length
                  ? 'border-brand bg-brand/5 text-brand'
                  : 'border-slate-200 bg-slate-50 text-slate-300'
              )}
            >
              {i < value.length ? '●' : ''}
            </div>
          ))}
        </div>
        {value && (
          <p className="text-xs text-slate-500 mt-2 font-mono">
            Current: {value}
          </p>
        )}
      </div>

      {/* Dialpad Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {DIALPAD_KEYS.flat().map((key) => {
          if (key === 'R' && !allowRandomGenerate) {
            return <div key={key} />;
          }

          return (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              className={cn(
                'h-14 rounded-xl font-bold text-lg transition-all active:scale-95',
                key === 'R' &&
                  'bg-brand/10 text-brand hover:bg-brand/20 flex items-center justify-center',
                key === 'C' &&
                  'bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center',
                /^[0-9]$/.test(key) &&
                  'bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              )}
            >
              {key === 'R' ? <RefreshCw className="w-5 h-5" /> : null}
              {key === 'C' ? <Delete className="w-5 h-5" /> : null}
              {/^[0-9]$/.test(key) ? key : null}
            </button>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {onCancel && (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
          >
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
        )}
        {onConfirm && (
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={value.length !== maxLength}
          >
            <Check className="w-4 h-4 mr-1" /> Confirm
          </Button>
        )}
      </div>
    </div>
  );
}

// CSS animation for shake effect
const shakeStyles = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}
.animate-shake {
  animation: shake 0.3s ease-in-out;
}
`;

// Add styles to document if in browser
if (typeof document !== 'undefined') {
  const styleId = 'dialpad-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = shakeStyles;
    document.head.appendChild(style);
  }
}
