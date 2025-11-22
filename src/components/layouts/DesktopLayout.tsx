// 📄 src/components/layouts/DesktopLayout.tsx

import { Panel, PanelGroup, PanelResizeHandle, type PanelOnCollapse } from 'react-resizable-panels';
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
interface DesktopLayoutProps {
  sidebarProps: any;
  chatAreaProps: any;
  footerRef: RefObject<FooterRef | null>;
  messagesContainerRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLDivElement | null>; // ✅ ИСПРАВЛЕНИЕ: Тип теперь допускает null
  shouldShowScrollDownButton: boolean;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  setIsModelSelectorOpen: (isOpen: boolean) => void;
  handleSend: (message: string) => Promise<void>;
  handleLogout: () => Promise<void>;
  scrollToBottom: () => void;
}

export function DesktopLayout({
  sidebarProps,
  chatAreaProps,
  footerRef,
  messagesContainerRef,
  contentRef,
  shouldShowScrollDownButton,
  isSettingsOpen,
  setIsSettingsOpen,
  setIsModelSelectorOpen,
  handleSend,
  handleLogout,
  scrollToBottom,
}: DesktopLayoutProps) {
  return (
    <div className="h-[100dvh] bg-gray-900 text-white overflow-hidden">
      <PanelGroup direction="horizontal">
        <Panel
          defaultSize={20}
          minSize={15}
          maxSize={30}
          collapsible={true}
          collapsedSize={0}
          onCollapse={sidebarProps.toggleCollapse as PanelOnCollapse}
          className="flex flex-col"
        >
          <Sidebar {...sidebarProps} isOpen={true} setIsOpen={() => {}} />
        </Panel>
        <PanelResizeHandle className="w-2 bg-gray-800 hover:bg-orange-500/50 transition-colors duration-200 cursor-col-resize" />
        <Panel className="flex-1 flex flex-col min-h-0">
          <Header
            onMenuClick={() => {}}
            onSettingsClick={() => setIsSettingsOpen(true)}
            onLogout={handleLogout}
            isMobile={false}
            onModelSelectorOpenChange={setIsModelSelectorOpen}
          />
          <main ref={messagesContainerRef} className="flex-1 overflow-y-auto">
            <div className={`w-full max-w-5xl mx-auto ${!chatAreaProps.currentConversationId ? 'h-full flex items-center justify-center' : ''}`}>
              <ChatArea {...chatAreaProps} ref={contentRef} />
            </div>
          </main>
          {shouldShowScrollDownButton && (
            <ScrollDownButton onClick={scrollToBottom} className="bottom-28 right-10" />
          )}
          <Footer
            ref={footerRef}
            onSend={handleSend}
            isLoading={chatAreaProps.isThinking || !!chatAreaProps.pendingMessage}
            onFocus={() => chatAreaProps.setIsInputFocused(true)}
            onBlur={() => chatAreaProps.setIsInputFocused(false)}
          />
        </Panel>
      </PanelGroup>
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={handleLogout}
      />
    </div>
  );
}