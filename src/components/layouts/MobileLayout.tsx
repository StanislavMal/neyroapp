// 📄 src/components/layouts/MobileLayout.tsx

import {
  SettingsDialog,
  Sidebar,
  ScrollDownButton,
  Header,
  ChatArea,
  Footer,
} from '..';
import type { FooterRef } from '../Footer';
import type { RefObject } from 'react';

// Определяем пропсы для компонента лэйаута
interface MobileLayoutProps {
  sidebarProps: any;
  chatAreaProps: any;
  footerRef: RefObject<FooterRef | null>;
  footerProps: any; // ✅ ОБНОВЛЕНО: Единый объект пропсов для футера
  messagesContainerRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  shouldShowScrollDownButton: boolean;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  setIsModelSelectorOpen: (isOpen: boolean) => void;
  handleLogout: () => Promise<void>;
  scrollToBottom: () => void;
}

export function MobileLayout({
  sidebarProps,
  chatAreaProps,
  footerRef,
  footerProps, // ✅ ОБНОВЛЕНО
  messagesContainerRef,
  contentRef,
  shouldShowScrollDownButton,
  isSettingsOpen,
  setIsSettingsOpen,
  setIsModelSelectorOpen,
  handleLogout,
  scrollToBottom,
}: MobileLayoutProps) {
  return (
    <div className="h-[100dvh] bg-gray-900 text-white flex flex-col relative overflow-hidden">
      {sidebarProps.isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50"
          onClick={() => sidebarProps.setIsOpen(false)}
        />
      )}
      <Sidebar {...sidebarProps} />
      <Header
        onMenuClick={sidebarProps.toggleSidebar}
        onSettingsClick={() => setIsSettingsOpen(true)}
        onLogout={handleLogout}
        isMobile={true}
        onModelSelectorOpenChange={setIsModelSelectorOpen}
      />
      <main
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden min-h-0 ${
          !chatAreaProps.currentConversationId ? 'flex items-center justify-center' : ''
        }`}
      >
        <div className="w-full">
          <ChatArea {...chatAreaProps} ref={contentRef} />
        </div>
      </main>
      {shouldShowScrollDownButton && (
        <ScrollDownButton onClick={scrollToBottom} className="bottom-24 right-4" />
      )}
      {/* ✅ ОБНОВЛЕНО: Передаем все пропсы для футера через spread-оператор */}
      <Footer
        ref={footerRef}
        {...footerProps}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={handleLogout}
      />
    </div>
  );
}