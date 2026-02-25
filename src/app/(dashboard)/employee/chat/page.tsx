'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { Loader } from '@/components/ui/Loader';
import { useLocale } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { Chat, ChatMessage } from '@/types';
import type { Customer } from '@/types';

export default function EmployeeChatPage() {
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { refreshNotifications } = useNotifications();
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [assignedCustomers, setAssignedCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  useEffect(() => {
    if (user?.id) {
      fetchChats();
      fetchAssignedCustomers();
    }
  }, [user?.id, locale, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && user?.id) {
        fetchChats();
        fetchAssignedCustomers();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, locale, pathname]);

  const fetchAssignedCustomers = async () => {
    try {
      const response = await fetch(`/api/employees/${user?.id}/customers`);
      const data = await response.json();
      if (data.success) setAssignedCustomers(data.data || []);
    } catch (error) {
      console.error('Failed to fetch assigned customers:', error);
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
          return stillExists ? current : data.data[0].id;
        });
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      setLoading(false);
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

  const selectedChatData = chats.find(c => c.id === selectedChat);

  // All chats: customer_employee (unified customer) + internal_room (admin/employee rooms)
  const chatSearchLower = chatSearchQuery.trim().toLowerCase();
  const filteredChats =
    chatSearchLower === ''
      ? chats
      : chats.filter((chat) => {
          const roomNameMatch = chat.type === 'internal_room' && chat.roomName && chat.roomName.toLowerCase().includes(chatSearchLower);
          const namesMatch = (chat.participantNames ?? []).some((n) =>
            n.toLowerCase().includes(chatSearchLower)
          );
          const idsMatch = (chat.participantIds ?? []).some((id) =>
            id.toLowerCase().includes(chatSearchLower)
          );
          return roomNameMatch || namesMatch || idsMatch;
        });

  const handleStartChatWithCustomer = async (customerId: string) => {
    if (!user?.id) return;
    setStartingChat(true);
    try {
      const response = await fetch('/api/chat/with-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: user.id, customerId }),
      });
      const data = await response.json();
      if (data.success && data.data) {
        const newChat = data.data as Chat;
        const exists = chats.some((c) => c.id === newChat.id);
        if (!exists) setChats((prev) => [newChat, ...prev]);
        setSelectedChat(newChat.id);
        fetchMessages(newChat.id);
      }
    } catch (error) {
      console.error('Failed to start chat:', error);
    } finally {
      setStartingChat(false);
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
        <p className="text-sm sm:text-base text-neutral-600">{t('chat.withCustomersAndTeam')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card variant="elevated" padding="none" className="lg:col-span-1 flex flex-col min-h-[280px] h-[55vh] sm:h-[60vh] md:h-[600px] max-h-[calc(100dvh-10rem)]">
          <div className="p-3 sm:p-4 border-b border-neutral-100 space-y-3 shrink-0">
            <h2 className="font-semibold text-neutral-900 text-base sm:text-lg">{t('chat.chats')}</h2>
            <input
              type="search"
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              placeholder={t('chat.searchCustomerConversation')}
              className="w-full min-h-[44px] rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              aria-label={t('chat.searchCustomerConversation')}
            />
            {assignedCustomers.length > 0 && (
              <div className="mt-3">
                <label htmlFor="customer-select" className="sr-only">
                  {t('chat.startChatWithCustomer')}
                </label>
                <select
                  id="customer-select"
                  disabled={startingChat}
                  className="w-full min-h-[44px] rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) {
                      handleStartChatWithCustomer(id);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">{t('chat.startChatWithCustomer')}</option>
                  {assignedCustomers.map((cust) => (
                    <option key={cust.id} value={cust.id}>
                      {cust.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="divide-y divide-neutral-100 overflow-y-auto overflow-x-hidden flex-1 min-w-0">
            {filteredChats.length === 0 ? (
              <div className="p-4 text-center text-neutral-500">
                <p>{chats.length === 0 ? t('chat.noChats') : t('chat.noMatches')}</p>
              </div>
            ) : (
              filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={(e) => {
                    setSelectedChat(chat.id);
                    (e.currentTarget as HTMLElement).blur();
                  }}
                  className={`w-full min-w-0 overflow-hidden p-3 sm:p-4 min-h-[52px] text-left rtl:text-right hover:bg-neutral-50 transition-colors border-b border-neutral-100 touch-manipulation ${
                    selectedChat === chat.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-semibold text-neutral-900 truncate min-w-0">
                      {chat.type === 'internal_room' && chat.roomName
                        ? chat.roomName
                        : chat.participantNames && chat.participantNames.length > 0
                        ? chat.participantNames.join(', ')
                        : t('chat.customerChat')}
                    </p>
                    {chat.unreadCount > 0 && (
                      <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-500 text-white text-xs font-semibold shrink-0">
                        {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                      </span>
                    )}
                  </div>
                  {chat.lastMessage && (
                    <p className={`text-sm mt-1 line-clamp-1 break-words ${
                      chat.unreadCount > 0
                        ? 'text-neutral-900 font-medium'
                        : 'text-neutral-600'
                    }`}>
                      {chat.lastMessage.content}
                    </p>
                  )}
                </button>
              ))
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
                selectedChatData.participantNames && selectedChatData.participantNames.length > 0
                  ? selectedChatData.participantNames.join(', ')
                  : t('chat.customerChat')
              }
            />
          ) : (
            <Card variant="elevated" padding="large">
              <p className="text-center text-neutral-500">{t('chat.selectChat')}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
