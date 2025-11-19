// 📄 src/components/LoadingIndicator.tsx

import { useTranslation } from 'react-i18next';
import { TypingDots } from './TypingDots';

export const LoadingIndicator = () => {
  const { t } = useTranslation();
  
  return (
    <div className="group relative flex flex-col w-full items-start">
      <div className="isolate rounded-lg px-4 py-2 transition-colors duration-200 w-full bg-gradient-to-r from-orange-500/5 to-red-600/5">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0 w-8 h-8">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-orange-500 via-red-500 to-orange-500 animate-[spin_2s_linear_infinite]"></div>
            <div className="absolute inset-[2px] rounded-lg bg-gray-900 flex items-center justify-center">
              <div className="relative flex items-center justify-center w-full h-full rounded-lg bg-gradient-to-r from-orange-500 to-red-600">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 animate-pulse"></div>
                <span className="relative z-10 text-sm font-medium text-white">
                  AI
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-lg font-medium text-gray-400">
              {t('thinking')}
            </div>
            {/* ✅ Заменяем старые точки на новый компонент */}
            <TypingDots />
          </div>
        </div>
      </div>
      <div className="h-6 mt-1.5 px-2"></div>
    </div>
  );
}