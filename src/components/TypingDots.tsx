// 📄 src/components/TypingDots.tsx

import { memo } from 'react';

/**
 * Универсальный компонент для отображения трех анимированных точек.
 */
export const TypingDots = memo(() => {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span 
        className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" 
        style={{ animationDelay: '0ms', animationDuration: '1s' }} 
      />
      <span 
        className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" 
        style={{ animationDelay: '150ms', animationDuration: '1s' }} 
      />
      <span 
        className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" 
        style={{ animationDelay: '300ms', animationDuration: '1s' }} 
      />
    </div>
  );
});

TypingDots.displayName = 'TypingDots';