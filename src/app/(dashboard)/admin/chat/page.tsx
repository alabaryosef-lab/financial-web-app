'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/Loader';
import { useLocale } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { Chat, ChatMessage } from '@/types';
import type { Employee } from '@/types';
import { Pin, PinOff, Trash2, Bookmark } from 'lucide-react';

export default function AdminChatPage() {
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { refreshNotifications } = useNotifications();
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatParticipants, setChatParticipants] = useState<Map<string, string[]>>(new Map());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmChat, setDeleteConfirmChat] = useState<Chat | null>(null);
  const [createRoomError, setCreateRoomError] = useState('');

  useEffect(() => {
    if (user?.id) {
      fetchChats();
      fetchEmployees();
    }
  }, [user?.id, locale, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && user?.id) {
        fetchChats();
        fetchEmployees();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, locale, pathname]);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/employees');
      const data = await response.json();
      if (data.success) setEmployees(data.data || []);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const fetchChats = async () => {
    try {
      const response = await fetch(`/api/chat?userId=${user?.id}`);
      const data = await response.json();
      if (data.success) {
        setChats(data.data);
        setSelectedChat((current) => {
          if (data.data.length === 0) return null;
          const stillExists = current && data.data.some((c: Chat) => c.id === current);
          if (stillExists) return current;
          return data.data[0].id;
        });
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchParticipants = async (chatId: string) => {
    try {
      const response = await fetch(`/api/chat/${chatId}/participants`);
      const data = await response.json();
      if (data.success) {
        setChatParticipants((prev) => {
          const next = new Map(prev);
          next.set(chatId, data.data || []);
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to fetch participants:', error);
    }
  };

  const fetchMessages = async (chatId: string) => {
    if (!user?.id) return;
    try {
      const response = await fetch(`/api/chat/${chatId}/messages?locale=${locale}&userId=${user.id}`);
      const data = await response.json();
      if (data.success) {
        const newList = data.data as ChatMessage[];
        const newFromOther = messages.length > 0 && newList.length > messages.length && newList[newList.length - 1]?.senderId !== user?.id;
        setMessages(newList);
        if (newFromOther) refreshNotifications();
        markChatAsRead(chatId);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const markChatAsRead = async (chatId: string) => {
    if (!user?.id) return;
    try {
      await fetch(`/api/chat/${chatId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      // Refresh chat list to update unread counts
      fetchChats();
    } catch (error) {
      console.error('Failed to mark chat as read:', error);
    }
  };

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat);
      fetchParticipants(selectedChat);
    }
  }, [selectedChat, locale]);

  // Real-time: poll messages while a chat is open (pause when tab hidden)
  useEffect(() => {
    if (!selectedChat) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchMessages(selectedChat);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedChat, locale]);

  // Real-time: poll chat list for pinning updates (less frequent than messages)
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchChats();
    }, 10000); // Refresh chat list every 10 seconds
    return () => clearInterval(interval);
  }, [user?.id]);

  const selectedChatData = chats.find(c => c.id === selectedChat);
  
  const filteredChats = chats.filter((chat) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    if (chat.type === 'internal_room' && chat.roomName) {
      return chat.roomName.toLowerCase().includes(query);
    }
    if (chat.participantNames && chat.participantNames.length > 0) {
      return chat.participantNames.some(name => name.toLowerCase().includes(query));
    }
    return t('chat.customerChat').toLowerCase().includes(query);
  });

  const pinnedChats = filteredChats.filter(chat => chat.isPinned === true);
  const unpinnedChats = filteredChats.filter(chat => chat.isPinned !== true);

  const roomNameKey: Record<string, string> = {
    'Contracts': 'chat.room.contracts',
    'Follow Up': 'chat.room.followUp',
    'Receipts': 'chat.room.receipts',
  };
  const translateRoomName = (name: string | undefined | null) => {
    if (!name) return '';
    return (roomNameKey[name] ? t(roomNameKey[name]) : name) || '';
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim() || selectedEmployeeIds.length === 0 || !user?.id) {
      setCreateRoomError('Room name and at least one employee are required');
      return;
    }
    setCreateRoomError('');
    setCreatingRoom(true);
    try {
      const response = await fetch('/api/chat/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: roomName.trim(), employeeIds: selectedEmployeeIds, adminId: user.id }),
      });
      const data = await response.json();
      if (data.success && data.data) {
        const newChat = data.data as Chat;
        // Refresh the full chat list to get proper ordering (pinned first)
        await fetchChats();
        // Select the newly created chat
        setSelectedChat(newChat.id);
        fetchMessages(newChat.id);
        fetchParticipants(newChat.id);
        setIsCreateRoomModalOpen(false);
        setRoomName('');
        setSelectedEmployeeIds([]);
        setCreateRoomError('');
      } else {
        setCreateRoomError(data.errorKey ? t(data.errorKey) : (data.error || 'Failed to create room'));
      }
    } catch (error) {
      console.error('Failed to create room:', error);
      setCreateRoomError('Failed to create room. Please try again.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId]
    );
  };

  const handlePinToggle = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.id) return;
    try {
      const response = await fetch(`/api/chat/${chatId}/pin?userId=${user.id}`, {
        method: 'PUT',
      });
      const data = await response.json();
      if (data.success) {
        // Refresh chat list to update pinned status
        await fetchChats();
      } else {
        console.error('Pin toggle failed:', data.error);
      }
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  const handleDeleteRoom = async () => {
    if (!deleteConfirmChat || !user?.id) return;
    try {
      const response = await fetch(`/api/chat/${deleteConfirmChat.id}?userId=${user.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        if (selectedChat === deleteConfirmChat.id) {
          setSelectedChat(null);
        }
        await fetchChats();
        setDeleteConfirmChat(null);
      }
    } catch (error) {
      console.error('Failed to delete room:', error);
    }
  };

  const handleSendMessage = async (content: string, file?: File) => {
    if (!selectedChat || !user) return;

    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;
      let fileType: string | undefined;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        const uploadRes = await fetch('/api/chat/upload', { method: 'POST', body: form });
        const uploadData = await uploadRes.json();
        if (!uploadData.success || !uploadData.data) {
          console.error('Upload failed:', uploadData.error);
          return;
        }
        fileUrl = uploadData.data.fileUrl;
        fileName = uploadData.data.fileName;
        fileType = uploadData.data.fileType;
      }

      const response = await fetch(`/api/chat/${selectedChat}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user.id,
          content: content.trim() || (fileName ? '' : ' '),
          fileName,
          fileType,
          fileUrl,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await fetchMessages(selectedChat);
      } else {
        console.error('Failed to send message:', data.error);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-left rtl:text-right">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 mb-2">{t('common.chat')}</h1>
        <p className="text-sm sm:text-base text-neutral-600">{t('chat.manageAllChats')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card variant="elevated" padding="none" className="lg:col-span-1 flex flex-col min-h-0">
          <div className="p-3 sm:p-4 border-b border-neutral-100 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <h2 className="font-semibold text-neutral-900 text-base sm:text-lg">{t('chat.chats')}</h2>
              <Button
                variant="primary"
                size="small"
                onClick={() => setIsCreateRoomModalOpen(true)}
                className="w-full sm:w-auto"
              >
                {t('chat.createRoom')}
              </Button>
            </div>
            <p className="text-xs text-neutral-500 mb-2">{t('chat.adminMonitorOnly')}</p>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search') + '...'}
              className="text-sm"
            />
          </div>
          <div className="divide-y divide-neutral-100 overflow-y-auto flex-1">
            {filteredChats.length === 0 ? (
              <div className="p-4 text-center text-neutral-500">
                <p>{searchQuery ? t('common.noResults') : t('chat.noChats')}</p>
              </div>
            ) : (
              <>
                {pinnedChats.length > 0 && (
                  <>
                    <div className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase bg-neutral-50 sticky top-0">
                      {t('chat.pinnedRooms')}
                    </div>
                    {pinnedChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={`flex items-center group ${
                          selectedChat === chat.id ? 'bg-primary-50' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            setSelectedChat(chat.id);
                            (e.currentTarget as HTMLElement).blur();
                          }}
                          className="flex-1 p-3 sm:p-4 min-h-[52px] text-left rtl:text-right hover:bg-neutral-50 transition-colors touch-manipulation"
                        >
                          <div className="flex items-center gap-2">
                            <Pin className="w-4 h-4 text-primary-600 shrink-0" fill="currentColor" strokeWidth={2} aria-label={t('chat.pinned')} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-neutral-900">
                                  {chat.type === 'internal_room'
                                    ? translateRoomName(chat.roomName)
                                    : chat.participantNames && chat.participantNames.length > 0
                                    ? chat.participantNames.join(', ')
                                    : t('chat.customerChat')}
                                </p>
                                {chat.unreadCount > 0 && (
                                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-500 text-white text-xs font-semibold">
                                    {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                                  </span>
                                )}
                              </div>
                              {chat.lastMessage && (
                                <p className={`text-sm mt-1 truncate ${
                                  chat.lastMessage.isDeleted 
                                    ? 'text-neutral-400 italic' 
                                    : chat.unreadCount > 0
                                    ? 'text-neutral-900 font-medium'
                                    : 'text-neutral-600'
                                }`}>
                                  {chat.lastMessage.content}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 px-2">
                          <button
                            type="button"
                            onClick={(e) => handlePinToggle(chat.id, e)}
                            className="p-2 hover:bg-primary-50 rounded-lg transition-colors shrink-0"
                            title={t('chat.unpinRoom')}
                          >
                            <PinOff className="w-4 h-4 text-primary-600" strokeWidth={2.5} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmChat(chat);
                            }}
                            className="p-2 hover:bg-error-light rounded-lg transition-colors shrink-0"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-4 h-4 text-error" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {unpinnedChats.length > 0 && (
                  <>
                    {pinnedChats.length > 0 && (
                      <div className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase bg-neutral-50 sticky top-0">
                        {t('chat.allRooms')}
                      </div>
                    )}
                    {unpinnedChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={`flex items-center group ${
                          selectedChat === chat.id ? 'bg-primary-50' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            setSelectedChat(chat.id);
                            (e.currentTarget as HTMLElement).blur();
                          }}
                          className="flex-1 p-3 sm:p-4 min-h-[52px] text-left rtl:text-right hover:bg-neutral-50 transition-colors touch-manipulation"
                        >
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-neutral-900">
                              {chat.type === 'internal_room'
                                ? translateRoomName(chat.roomName)
                                : chat.participantNames && chat.participantNames.length > 0
                                ? chat.participantNames.join(', ')
                                : t('chat.customerChat')}
                            </p>
                            {chat.unreadCount > 0 && (
                              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-500 text-white text-xs font-semibold">
                                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                              </span>
                            )}
                          </div>
                          {chat.lastMessage && chat.lastMessage.content && (
                            <p className={`text-sm mt-1 truncate ${
                              chat.unreadCount > 0
                                ? 'text-neutral-900 font-medium'
                                : 'text-neutral-600'
                            }`}>
                              {chat.lastMessage.content}
                            </p>
                          )}
                        </button>
                        <div className="flex items-center gap-1 px-2">
                          <button
                            type="button"
                            onClick={(e) => handlePinToggle(chat.id, e)}
                            className="p-2 hover:bg-primary-50 rounded-lg transition-colors shrink-0"
                            title={t('chat.pinRoom')}
                          >
                            <Pin className="w-4 h-4 text-primary-600" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmChat(chat);
                            }}
                            className="p-2 hover:bg-error-light rounded-lg transition-colors shrink-0"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-4 h-4 text-error" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </Card>

        <div className="lg:col-span-2">
          {selectedChatData ? (
            <ChatWindow
              messages={messages}
              onSendMessage={handleSendMessage}
              chatId={selectedChat ?? undefined}
              onMessageUpdate={(update) => {
                if (!update || !selectedChat) return;
                if (update.type === 'messageEdited') {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === update.message.id
                        ? { ...m, ...update.message, content: update.message.content ?? m.content }
                        : m
                    )
                  );
                  setChats((prev) =>
                    prev.map((c) => {
                      if (c.id !== selectedChat) return c;
                      if (c.lastMessage?.id === update.message.id)
                        return { ...c, lastMessage: { ...c.lastMessage, content: update.message.content ?? c.lastMessage!.content, isEdited: true } };
                      return c;
                    })
                  );
                } else if (update.type === 'messageDeleted') {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === update.messageId ? { ...m, isDeleted: true, content: '' } : m
                    )
                  );
                  setChats((prev) =>
                    prev.map((c) => {
                      if (c.id !== selectedChat) return c;
                      if (c.lastMessage?.id === update.messageId)
                        return { ...c, lastMessage: { ...c.lastMessage!, content: 'Message deleted', isDeleted: true } };
                      return c;
                    })
                  );
                }
              }}
              title={
                selectedChatData.type === 'internal_room'
                  ? translateRoomName(selectedChatData.roomName)
                  : selectedChatData.participantNames && selectedChatData.participantNames.length > 0
                  ? selectedChatData.participantNames.join(', ')
                  : t('chat.customerChat')
              }
              readOnly={selectedChatData.type === 'customer_employee'}
            />
          ) : (
            <Card variant="elevated" padding="large">
              <p className="text-center text-neutral-500">{t('chat.selectChat')}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Create Group Room Modal */}
      <Modal
        isOpen={isCreateRoomModalOpen}
        onClose={() => {
          setIsCreateRoomModalOpen(false);
          setRoomName('');
          setSelectedEmployeeIds([]);
        }}
        title={t('chat.createGroupRoom')}
      >
        <div className="space-y-4">
          <Input
            label={t('chat.roomName')}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder={t('chat.roomNamePlaceholder')}
            required
          />
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-2">
              {t('chat.selectEmployees')}
            </label>
            <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded-lg p-2 space-y-2">
              {employees.length === 0 ? (
                <p className="text-sm text-neutral-500 p-2">{t('chat.noEmployees')}</p>
              ) : (
                employees.map((emp) => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-2 p-2 hover:bg-neutral-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmployeeIds.includes(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      className="rounded border-neutral-300"
                    />
                    <span className="text-sm text-neutral-900">
                      {emp.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
          {createRoomError && (
            <div className="rounded-xl px-4 py-3 text-sm text-error bg-error-light border border-error/20">
              {createRoomError}
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateRoomModalOpen(false);
                setRoomName('');
                setSelectedEmployeeIds([]);
                setCreateRoomError('');
              }}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateRoom}
              disabled={!roomName.trim() || selectedEmployeeIds.length === 0 || creatingRoom}
              className="w-full sm:w-auto"
            >
              {creatingRoom ? t('common.loading') + '...' : t('chat.createRoom')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Room Confirmation Modal */}
      <Modal
        isOpen={deleteConfirmChat !== null}
        onClose={() => setDeleteConfirmChat(null)}
        title={t('chat.deleteRoom')}
      >
        <div className="space-y-4">
          <p className="text-neutral-700">
            {t('chat.deleteRoomConfirm', { 
              roomName: deleteConfirmChat?.type === 'internal_room' 
                ? translateRoomName(deleteConfirmChat?.roomName) 
                : (deleteConfirmChat?.participantNames?.length ? deleteConfirmChat.participantNames.join(', ') : t('chat.customerChat'))
            })}
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => setDeleteConfirmChat(null)}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleDeleteRoom}
              className="w-full sm:w-auto bg-error hover:bg-error-dark"
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
