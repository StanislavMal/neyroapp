// 📄 src/components/SettingsDialog.tsx

import { useState, useEffect, useRef } from 'react'
import { PlusCircle, Trash2, Edit2, HelpCircle, LogOut } from 'lucide-react'
import { usePrompts, useSettings } from '../store/hooks'
import { type UserSettings } from '../store'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../providers/AuthProvider'
import { validatePromptName, validatePromptContent, sanitizeString } from '../utils/validation'
import { getDbManager } from '../services/db-manager';

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  onLogout: () => void
}

function InfoTooltip({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={tooltipRef} className="group relative inline-block ml-1.5">
      <HelpCircle 
        className="w-4 h-4 text-gray-400 hover:text-orange-400 cursor-help transition-colors" 
        onClick={() => setIsOpen(!isOpen)}
      />
      <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 z-50 ${isOpen ? 'block' : 'hidden'} group-hover:block`}>
        <div className="bg-gray-900 text-gray-200 text-xs rounded-lg py-2 px-3 shadow-xl border border-gray-700">
          {text}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-700"></div>
        </div>
      </div>
    </div>
  )
}

export function SettingsDialog({ isOpen, onClose, onLogout }: SettingsDialogProps) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation(); 
  const [promptForm, setPromptForm] = useState({ name: '', content: '' })
  const [isAddingPrompt, setIsAddingPrompt] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [editingPromptForm, setEditingPromptForm] = useState({ name: '', content: '' })

  const { prompts, createPrompt, updatePrompt, deletePrompt, setPromptActive, loadPrompts } = usePrompts();
  const { settings, updateSettings, loadSettings } = useSettings();

  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [cacheStats, setCacheStats] = useState({ size: 0, count: 0 });

  useEffect(() => {
    if (isOpen && user) {
      const dbManager = getDbManager(user.id);
      loadPrompts();
      loadSettings();
      dbManager.getCacheStats().then(setCacheStats);
    }
  }, [isOpen, user, loadPrompts, loadSettings]);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const handleAddPrompt = async () => {
    setValidationError(null);
    
    const nameValidation = validatePromptName(promptForm.name);
    if (!nameValidation.isValid) {
      setValidationError(nameValidation.error!);
      return;
    }
    
    const contentValidation = validatePromptContent(promptForm.content);
    if (!contentValidation.isValid) {
      setValidationError(contentValidation.error!);
      return;
    }
    
    const sanitizedName = sanitizeString(promptForm.name);
    const sanitizedContent = sanitizeString(promptForm.content);
    
    await createPrompt(sanitizedName, sanitizedContent);
    setPromptForm({ name: '', content: '' });
    setIsAddingPrompt(false);
    setValidationError(null);
  }

  const handleStartEditPrompt = (id: string, name: string, content: string) => {
    setEditingPromptId(id);
    setEditingPromptForm({ name, content });
    setValidationError(null);
  }

  const handleSaveEditPrompt = async () => {
    if (!editingPromptId) return;

    setValidationError(null);
    
    const nameValidation = validatePromptName(editingPromptForm.name);
    if (!nameValidation.isValid) {
      setValidationError(nameValidation.error!);
      return;
    }
    
    const contentValidation = validatePromptContent(editingPromptForm.content);
    if (!contentValidation.isValid) {
      setValidationError(contentValidation.error!);
      return;
    }
    
    const sanitizedName = sanitizeString(editingPromptForm.name);
    const sanitizedContent = sanitizeString(editingPromptForm.content);
    
    try {
      await updatePrompt(editingPromptId, sanitizedName, sanitizedContent);
      setEditingPromptId(null);
      setEditingPromptForm({ name: '', content: '' });
      setValidationError(null);
    } catch (error) {
      setValidationError('Failed to update prompt. Please try again.');
    }
  }

  const handleCancelEditPrompt = () => {
    setEditingPromptId(null);
    setEditingPromptForm({ name: '', content: '' });
    setValidationError(null);
  }

  const handleSaveChanges = () => {
    if (localSettings) {
      if (JSON.stringify(localSettings) !== JSON.stringify(settings)) {
          updateSettings(localSettings);
      }
    }
    onClose();
  };

  const handleClose = () => {
    setLocalSettings(settings);
    setValidationError(null);
    onClose()
    setIsAddingPrompt(false)
    setPromptForm({ name: '', content: '' })
    setEditingPromptId(null)
    setEditingPromptForm({ name: '', content: '' })
  }
  
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    i18n.changeLanguage(lang);
  };

  const handleLogout = () => {
    onLogout();
    onClose();
  };
  
  const handleClearCache = async () => {
    if (!user) return;
    const dbManager = getDbManager(user.id);
    await dbManager.clearImageCache();
    const stats = await dbManager.getCacheStats();
    setCacheStats(stats);
  };

  if (!isOpen || !localSettings) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => {
      if (e.target === e.currentTarget) handleClose()
    }}>
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-white">{t('settings')}</h2>
            <button onClick={handleClose} className="text-gray-400 hover:text-white focus:outline-none">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          <div className="space-y-4">
            {/* Язык */}
            <div className="p-3 rounded-lg bg-gray-700/50">
              <label htmlFor="language-select" className="block text-sm font-medium text-gray-300 mb-2">{t('language')}</label>
              <select
                  id="language-select"
                  value={i18n.language}
                  onChange={handleLanguageChange}
                  className="w-full px-3 py-2 text-sm text-white bg-gray-700 border border-gray-600 rounded-lg focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              >
                  <option value="en">English</option>
                  <option value="ru">Русский</option>
              </select>
            </div>

            {/* Системная инструкция */}
            <div className="p-3 rounded-lg bg-gray-700/50">
              <div className="flex items-center mb-2">
                <label htmlFor="system-instruction" className="block text-sm font-medium text-gray-300">
                  {t('systemInstruction')}
                </label>
                <InfoTooltip text={t('systemInstructionNote')} />
              </div>
              <textarea
                  id="system-instruction"
                  value={localSettings.system_instruction}
                  onChange={(e) => setLocalSettings(prev => prev ? { ...prev, system_instruction: e.target.value } : null)}
                  placeholder={t('systemInstructionPlaceholder')}
                  className="w-full h-20 px-3 py-2 text-sm text-white bg-gray-700 border border-gray-600 rounded-lg focus:border-orange-500 focus:ring-1 focus:ring-orange-500 resize-none"
              />
            </div>

            {/* Кастомные промпты */}
            <div className="p-3 rounded-lg bg-gray-700/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <label className="block text-sm font-medium text-gray-300">
                    {t('customPrompts')}
                  </label>
                  <InfoTooltip text={t('promptsNote')} />
                </div>
                <button 
                  onClick={() => setIsAddingPrompt(true)} 
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-red-600 rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <PlusCircle className="w-4 h-4" /> 
                  {t('addPrompt')}
                </button>
              </div>

              {isAddingPrompt && (
                <div className="mb-3 space-y-3 p-3 rounded-lg bg-gray-800/50 border border-gray-600">
                  <input 
                    type="text" 
                    value={promptForm.name} 
                    onChange={(e) => setPromptForm(prev => ({ ...prev, name: e.target.value }))} 
                    placeholder={t('promptNamePlaceholder')} 
                    className="w-full px-3 py-2 text-sm text-white bg-gray-700 border border-gray-600 rounded-lg focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
                  />
                  <textarea 
                    value={promptForm.content} 
                    onChange={(e) => setPromptForm(prev => ({ ...prev, content: e.target.value }))} 
                    placeholder={t('promptContentPlaceholder')} 
                    className="w-full h-32 px-3 py-2 text-sm text-white bg-gray-700 border border-gray-600 rounded-lg focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
                  />
                  {validationError && (<p className="text-sm text-red-400">{validationError}</p>)}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setIsAddingPrompt(false); setValidationError(null); }} className="px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white focus:outline-none">{t('cancel')}</button>
                    <button onClick={handleAddPrompt} className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-red-600 rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-orange-500">{t('savePrompt')}</button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {prompts.map((prompt) => (
                  <div key={prompt.id}>
                    {editingPromptId === prompt.id ? (
                      <div className="p-3 space-y-3 rounded-lg bg-gray-800/50 border-2 border-orange-500">
                        <input type="text" value={editingPromptForm.name} onChange={(e) => setEditingPromptForm(prev => ({ ...prev, name: e.target.value }))} placeholder={t('promptNamePlaceholder')} className="w-full px-3 py-2 text-sm text-white bg-gray-700 border border-gray-600 rounded-lg focus:border-orange-500 focus:ring-1 focus:ring-orange-500" autoFocus />
                        <textarea value={editingPromptForm.content} onChange={(e) => setEditingPromptForm(prev => ({ ...prev, content: e.target.value }))} placeholder={t('promptContentPlaceholder')} className="w-full h-32 px-3 py-2 text-sm text-white bg-gray-700 border border-gray-600 rounded-lg focus:border-orange-500 focus:ring-1 focus:ring-orange-500" />
                        {validationError && (<p className="text-sm text-red-400">{validationError}</p>)}
                        <div className="flex justify-end gap-2">
                          <button onClick={handleCancelEditPrompt} className="px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white focus:outline-none">{t('cancel')}</button>
                          <button onClick={handleSaveEditPrompt} className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-red-600 rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-orange-500">{t('savePrompt')}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/50 border border-gray-600">
                        <div className="flex-1 min-w-0 mr-3">
                          <h4 className="text-sm font-medium text-white truncate">{prompt.name}</h4>
                          <p className="text-xs text-gray-400 truncate">{prompt.content}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={prompt.is_active} onChange={() => setPromptActive(prompt.id, !prompt.is_active)} />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                          </label>
                          <button onClick={() => handleStartEditPrompt(prompt.id, prompt.name, prompt.content)} className="p-1 text-gray-400 hover:text-orange-500" title={t('editPrompt')}><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => deletePrompt(prompt.id)} className="p-1 text-gray-400 hover:text-red-500" title={t('deletePrompt')}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-gray-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center mb-1">
                    <label className="block text-sm font-medium text-gray-300">{t('imageCache')}</label>
                    <InfoTooltip text={t('imageCacheNote')} />
                  </div>
                  <p className="text-xs text-gray-400">
                    Занимает: {(cacheStats.size / 1024 / 1024).toFixed(2)} МБ ({cacheStats.count} файлов)
                  </p>
                </div>
                <button 
                  onClick={handleClearCache} 
                  className="flex-shrink-0 p-2 text-gray-400 bg-gray-700/50 rounded-lg hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
                  title={t('clearImageCache') || undefined}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
          
          <div className="flex items-center justify-between gap-3 mt-6">
            <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-lg focus:outline-none flex items-center gap-2 transition-colors">
              <LogOut className="w-4 h-4" />{t('logout')}
            </button>
            <div className="flex gap-3">
              <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white focus:outline-none">{t('cancel')}</button>
              <button onClick={handleSaveChanges} className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-orange-500 to-red-600 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-orange-500">{t('saveAndClose')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}