'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, Delete, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  maxLength?: number;
  title?: string;
  allowRandom?: boolean;
  showConfirm?: boolean;
}

const KEYPAD_LAYOUT = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['R', '0', 'C'],
];

export function PinInput({
  value,
  onChange,
  onConfirm,
  onCancel,
  maxLength = 4,
  title = 'Enter PIN',
  allowRandom = true,
  showConfirm = true,
}: PinInputProps) {
  const [isShaking, setIsShaking] = useState(false);
  const [isPressed, setIsPressed] = useState<string | null>(null);

  // Generate random 4-digit PIN avoiding common patterns
  const generateRandomPin = useCallback(() => {
    let pin: string;
    do {
      pin = Math.floor(1000 + Math.random() * 9000).toString();
    } while (
      /^(.)\1{3}$/.test(pin) || // 1111, 2222, etc.
      /^(0123|1234|2345|3456|4567|5678|6789|7890|8901|9012)$/.test(pin) ||
      /^(3210|4321|5432|6543|7654|8765|9876|0987|1098|2109)$/.test(pin)
    );
    return pin;
  }, []);

  const handleKeyPress = useCallback(
    (key: string) => {
      setIsPressed(key);
      setTimeout(() => setIsPressed(null), 150);

      if (key === 'R' && allowRandom) {
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

      if (/^[0-9]$/.test(key)) {
        if (value.length < maxLength) {
          onChange(value + key);
        } else {
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 300);
        }
      }
    },
    [value, maxLength, onChange, allowRandom, generateRandomPin]
  );

  const isComplete = value.length === maxLength;

  return (
    <div className="w-full">
      {title && <h3 className="text-base font-semibold mb-4 text-center">{title}</h3>}

      {/* PIN Display */}
      <div
        className={cn(
          'flex justify-center gap-3 mb-6 transition-transform',
          isShaking && 'animate-shake'
        )}
      >
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-200',
              i < value.length
                ? 'border-brand bg-brand/5 text-brand scale-105'
                : 'border-slate-200 bg-slate-50/50 text-slate-300'
            )}
          >
            {i < value.length ? '•' : ''}
          </div>
        ))}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {KEYPAD_LAYOUT.flat().map((key) => {
          const isRandom = key === 'R';
          const isClear = key === 'C';
          const isNumber = /^[0-9]$/.test(key);
          const pressed = isPressed === key;

          if (isRandom && !allowRandom) {
            return <div key={key} />;
          }

          return (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              className={cn(
                'h-14 rounded-xl font-semibold text-xl transition-all duration-150 active:scale-95 flex items-center justify-center',
                pressed && 'scale-95',
                isRandom && [
                  'bg-brand/10 text-brand hover:bg-brand/20',
                  'border border-brand/20',
                ],
                isClear && [
                  'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  'border border-slate-200',
                ],
                isNumber && [
                  'bg-white border border-slate-200',
                  'text-slate-800 hover:bg-slate-50 hover:border-slate-300',
                  'shadow-sm',
                ]
              )}
            >
              {isRandom && <RefreshCw className="w-5 h-5" />}
              {isClear && <Delete className="w-5 h-5" />}
              {isNumber && key}
            </button>
          );
        })}
      </div>

      {/* Action Buttons */}
      {(showConfirm || onCancel) && (
        <div className="flex gap-3 mt-4">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 h-11 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          )}
          {showConfirm && (
            <button
              onClick={onConfirm}
              disabled={!isComplete}
              className={cn(
                'flex-1 h-11 rounded-xl font-medium transition-all flex items-center justify-center gap-2',
                isComplete
                  ? 'bg-brand text-white hover:opacity-90 shadow-sm'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              )}
            >
              <Check className="w-4 h-4" />
              Confirm
            </button>
          )}
        </div>
      )}

      {/* Current PIN display (for debugging/demo) */}
      {value && (
        <p className="text-xs text-slate-400 text-center mt-3 font-mono">
          Current PIN: {value}
        </p>
      )}
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
  const styleId = 'pin-input-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = shakeStyles;
    document.head.appendChild(style);
  }
}
