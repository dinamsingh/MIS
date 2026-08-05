import { useState, useRef, KeyboardEvent, ClipboardEvent } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export function OtpInput({ length = 6, value, onChange, disabled = false }: OtpInputProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Convert the single string value to an array of characters
  const getChars = () => {
    const chars = value.split('');
    // Pad with empty strings if too short
    while (chars.length < length) chars.push('');
    return chars.slice(0, length);
  };

  const chars = getChars();

  const triggerChange = (newChars: string[]) => {
    onChange(newChars.join(''));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newChars = [...chars];
      if (newChars[idx]) {
        // Delete current char
        newChars[idx] = '';
        triggerChange(newChars);
      } else if (idx > 0) {
        // Move back and delete
        newChars[idx - 1] = '';
        triggerChange(newChars);
        inputRefs.current[idx - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const val = e.target.value.replace(/[^0-9]/g, ''); // Only allow numbers
    if (!val) return;
    
    // Take the last character typed in case multiple were somehow entered
    const char = val[val.length - 1];
    
    const newChars = [...chars];
    newChars[idx] = char;
    triggerChange(newChars);

    if (idx < length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain').replace(/[^0-9]/g, '').slice(0, length);
    if (!pastedData) return;

    const newChars = [...chars];
    for (let i = 0; i < pastedData.length; i++) {
      newChars[i] = pastedData[i];
    }
    triggerChange(newChars);

    // Focus the next empty input, or the last one
    const nextIdx = Math.min(pastedData.length, length - 1);
    inputRefs.current[nextIdx]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center w-full" dir="ltr">
      {chars.map((char, idx) => {
        const isFocused = focusedIndex === idx;
        const isFilled = char !== '';
        
        return (
          <div 
            key={idx}
            className={`
              relative w-12 h-14 rounded-lg flex items-center justify-center transition-all duration-300
              ${isFocused ? 'scale-110 shadow-[0_0_15px_rgba(99,102,241,0.5)] z-10' : 'scale-100 z-0'}
              ${isFilled ? 'bg-white/60 dark:bg-[#1e293b]/80 border-[#15157d] dark:border-[#818cf8]' : 'bg-white/30 dark:bg-[#0f172a]/40 border-white/20 dark:border-white/10'}
              backdrop-blur-xl border border-solid
            `}
          >
            <input
              ref={el => inputRefs.current[idx] = el}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={2}
              value={char}
              onChange={(e) => handleChange(e, idx)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              onPaste={handlePaste}
              onFocus={() => setFocusedIndex(idx)}
              onBlur={() => setFocusedIndex(null)}
              disabled={disabled}
              className="absolute inset-0 w-full h-full bg-transparent text-center font-bold text-[24px] text-[#0d1c2e] dark:text-[#ffffff] focus:outline-none focus:ring-0 selection:bg-transparent caret-transparent"
            />
            {/* Animated underline indicator when focused */}
            <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full transition-all duration-300 ${isFocused ? 'bg-[#15157d] dark:bg-[#818cf8] opacity-100' : 'bg-transparent opacity-0'}`} />
          </div>
        );
      })}
    </div>
  );
}
