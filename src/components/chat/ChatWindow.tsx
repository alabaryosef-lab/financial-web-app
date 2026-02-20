'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Image as ImageIcon, Edit2, Trash2, MoreVertical } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ChatMessage } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { formatDate } from '@/lib/utils';

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (content: string, file?: File) => void;
  title?: string;
  chatId?: string;
  /** When true, hide send input (e.g. admin monitoring customer chat) */
  readOnly?: boolean;
  /** Called when a message is edited or deleted. Pass an update to patch state without refetch, or call with no args to refetch. */
  onMessageUpdate?: (update?: { type: 'messageEdited'; message: Partial<ChatMessage> & { id: string }; } | { type: 'messageDeleted'; messageId: string }) => void;
}

export function ChatWindow({ messages, onSendMessage, title, chatId, readOnly, onMessageUpdate }: ChatWindowProps) {
  const [inputValue, setInputValue] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();
  const { t, locale } = useLocale();

  // Track user scroll to prevent auto-scroll when user scrolls up
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const threshold = 150; // pixels from bottom
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const isNearBottom = distanceFromBottom < threshold;
      
      // Update scroll state: user has scrolled up if not near bottom
      isUserScrollingRef.current = !isNearBottom;

      // Clear any pending auto-scroll timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Reset scroll state when switching chats
  useEffect(() => {
    prevMessageCountRef.current = 0;
    isUserScrollingRef.current = false;
  }, [chatId]);

  // Auto-scroll only when new messages are added and user is near bottom
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const currentMessageCount = messages.length;
    const hasNewMessages = currentMessageCount > prevMessageCountRef.current;
    const isInitialLoad = prevMessageCountRef.current === 0 && currentMessageCount > 0;
    prevMessageCountRef.current = currentMessageCount;

    // Check current scroll position before auto-scrolling
    const checkAndScroll = () => {
      if (!el) return;
      const threshold = 150;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const isNearBottom = distanceFromBottom < threshold;
      
      // Only auto-scroll if:
      // 1. Initial load (first messages), OR
      // 2. New messages added AND user is near bottom (hasn't scrolled up)
      if (isInitialLoad || (hasNewMessages && isNearBottom && !isUserScrollingRef.current)) {
        el.scrollTop = el.scrollHeight;
        // Reset scroll state after scrolling to bottom
        if (isInitialLoad) {
          isUserScrollingRef.current = false;
        }
      }
    };

    if (isInitialLoad || hasNewMessages) {
      requestAnimationFrame(() => {
        requestAnimationFrame(checkAndScroll);
      });
    }
  }, [messages.length]);

  // Handle image load - scroll only once per image if user is near bottom
  const handleImageLoad = () => {
    const el = messagesContainerRef.current;
    if (!el) return;

    // Debounce scroll to avoid multiple scrolls during image loading
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      if (!el) return;
      const threshold = 150;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const isNearBottom = distanceFromBottom < threshold;
      
      // Only scroll if user is near bottom and hasn't manually scrolled up
      if (isNearBottom && !isUserScrollingRef.current) {
        el.scrollTop = el.scrollHeight;
      }
      scrollTimeoutRef.current = null;
    }, 100);
  };

  const handleSend = () => {
    if (inputValue.trim() || selectedFile) {
      onSendMessage(inputValue, selectedFile || undefined);
      setInputValue('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const canEditDelete = (message: ChatMessage): boolean => {
    if (!user || message.senderId !== user.id) return false;
    if (user.role !== 'admin' && user.role !== 'employee') return false;
    if (message.isDeleted) return false;
    if (!message.timestamp) return false;
    try {
      const messageTime = new Date(message.timestamp).getTime();
      if (isNaN(messageTime)) return false;
      const ageSeconds = (Date.now() - messageTime) / 1000;
      return ageSeconds <= 600; // 10 minutes
    } catch {
      return false;
    }
  };

  const handleEdit = (message: ChatMessage) => {
    setEditingMessageId(message.id);
    setEditContent(message.content);
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId || !chatId || !user?.id || !editContent.trim()) return;
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/chat/${chatId}/messages/${editingMessageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim(), userId: user.id }),
      });
      const data = await response.json();
      if (data.success) {
        const updatedMessage = {
          id: editingMessageId,
          content: editContent.trim(),
          isEdited: true,
          editedAt: new Date().toISOString(),
        };
        setEditingMessageId(null);
        setEditContent('');
        if (onMessageUpdate) {
          onMessageUpdate({ type: 'messageEdited', message: updatedMessage });
        }
      } else {
        console.error('Failed to edit message:', data.error);
      }
    } catch (error) {
      console.error('Failed to edit message:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmMessageId || !chatId || !user?.id) return;
    try {
      const response = await fetch(`/api/chat/${chatId}/messages/${deleteConfirmMessageId}?userId=${user.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        const id = deleteConfirmMessageId;
        setDeleteConfirmMessageId(null);
        if (onMessageUpdate) {
          onMessageUpdate({ type: 'messageDeleted', messageId: id });
        }
      } else {
        console.error('Failed to delete message:', data.error);
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  return (
    <Card variant="elevated" padding="none" className="flex flex-col min-h-[280px] h-[55vh] sm:h-[60vh] md:h-[600px] max-h-[calc(100dvh-10rem)]">
      {title && (
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-neutral-100 shrink-0">
          <h3 className="text-base sm:text-lg font-semibold text-neutral-900 truncate">{title}</h3>
        </div>
      )}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 space-y-3 sm:space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-500">
            {t('chat.noMessages')}
          </div>
        ) : (
          messages.map((message) => {
            if (!message || !message.id) return null;
            const isOwn = message.senderId === user?.id;
            const canEdit = canEditDelete(message);
            const isEditing = editingMessageId === message.id;

            if (message.isDeleted) {
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="max-w-[85%] sm:max-w-[75%] md:max-w-[70%] rounded-xl sm:rounded-lg px-3 py-2.5 sm:px-4 sm:py-2 bg-neutral-100 text-neutral-400 italic">
                    <p className="text-sm">{t('chat.messageDeletedPlaceholder')}</p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
              >
                <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] rounded-xl sm:rounded-lg px-3 py-2.5 sm:px-4 sm:py-2 ${
                  isOwn
                    ? 'bg-primary-500 text-white'
                    : 'bg-neutral-100 text-neutral-900'
                }`}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="bg-white text-neutral-900"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="small"
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                          className="flex-1"
                        >
                          {savingEdit ? t('common.loading') + '...' : t('common.save')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => {
                            if (!savingEdit) {
                              setEditingMessageId(null);
                              setEditContent('');
                            }
                          }}
                          disabled={savingEdit}
                          className="flex-1"
                        >
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold ${
                          isOwn ? 'text-white/80' : 'text-neutral-600'
                        }`}>
                          {message.senderNameKey ? t(message.senderNameKey) : message.senderName}
                        </span>
                        {canEdit && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleEdit(message)}
                              className="p-1 hover:bg-white/20 rounded"
                              title={t('chat.editMessage')}
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmMessageId(message.id)}
                              className="p-1 hover:bg-white/20 rounded"
                              title={t('chat.deleteMessage')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {message.fileUrl && (() => {
                        // Convert old /assets/ URLs to /api/assets/ for proper serving
                        const fileUrl = message.fileUrl.startsWith('/assets/')
                          ? message.fileUrl.replace('/assets/', '/api/assets/')
                          : message.fileUrl;
                        
                        return (
                          <div className="mb-2">
                            {message.fileType?.startsWith('image/') ? (
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block">
                                <img 
                                  src={fileUrl} 
                                  alt={message.fileName || ''} 
                                  className="max-w-full max-h-48 rounded object-contain" 
                                  onLoad={handleImageLoad}
                                />
                              </a>
                            ) : (
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={message.fileName}
                                className="text-sm underline"
                              >
                                {message.fileName || t('chat.file')} ({message.fileType?.includes('pdf') ? 'Preview/Download' : 'Download'})
                              </a>
                            )}
                          </div>
                        );
                      })()}
                      {message.content ? <p className="text-sm">{message.content}</p> : null}
                      <p className={`text-xs mt-1 flex items-center gap-1 ${
                        isOwn ? 'text-white/70' : 'text-neutral-500'
                      }`}>
                        {formatDate(message.timestamp, locale)}
                        {message.isEdited && (
                          <span className="text-xs italic">({t('chat.edited')})</span>
                        )}
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {!readOnly && (
      <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-neutral-200 space-y-2 shrink-0 bg-white">
        {selectedFile && (
          <div className="flex items-center gap-2 text-sm text-neutral-600 min-w-0">
            <Paperclip className="w-4 h-4 shrink-0" />
            <span className="truncate flex-1 min-w-0">{selectedFile.name}</span>
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-error hover:text-red-700 shrink-0 rounded-xl touch-manipulation"
              aria-label={t('common.delete')}
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileSelect}
            className="hidden"
            id="file-input"
          />
          <label
            htmlFor="file-input"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-neutral-50 rounded-xl cursor-pointer transition-colors shrink-0 touch-manipulation"
          >
            <Paperclip className="w-5 h-5 text-neutral-600" />
          </label>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t('chat.typeMessage')}
            className="flex-1 min-w-0 min-h-[44px]"
          />
          <Button onClick={handleSend} variant="primary" size="medium" className="shrink-0 min-w-[44px]">
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>
      </div>
      )}

      {/* Delete Message Confirmation Modal */}
      <Modal
        isOpen={deleteConfirmMessageId !== null}
        onClose={() => setDeleteConfirmMessageId(null)}
        title={t('chat.deleteMessage')}
      >
        <div className="space-y-4">
          <p className="text-neutral-700">{t('chat.deleteMessageConfirm')}</p>
          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => setDeleteConfirmMessageId(null)}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleDelete}
              className="w-full sm:w-auto bg-error hover:bg-error-dark"
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
