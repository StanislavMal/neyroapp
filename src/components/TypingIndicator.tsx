// 📄 src/components/TypingIndicator.tsx

import { memo } from 'react';

/**
 * Компонент для отображения анимированных трех точек,
 * имитирующих набор текста.
 */
export const TypingIndicator = memo(() => {
  return (
    <div className="inline-flex items-center gap-1 ml-2" style={{ verticalAlign: 'middle' }}>
      <span 
        className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" 
        style={{ animationDelay: '0ms' }} 
      />
      <span 
        className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" 
        style={{ animationDelay: '150ms' }} 
      />
      <span 
        className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" 
        style={{ animationDelay: '300ms' }} 
      />
    </div>
  );
});

TypingIndicator.displayName = 'TypingIndicator';