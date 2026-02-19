import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, serverError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Get user role from DB */
async function getUserRole(userId: string): Promise<'admin' | 'employee' | 'customer' | null> {
  const [rows] = await pool.query(
    `SELECT role FROM users WHERE id = ?`,
    [userId]
  ) as any[];
  return rows.length > 0 ? rows[0].role : null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return errorResponse('User ID is required', 400, 'error.userIdRequired');
    }

    const role = await getUserRole(userId);
    if (!role) {
      return successResponse([]);
    }

    let rows: any[] = [];

    if (role === 'admin') {
      // Admin: see all chats (monitor everything) – all customer_employee and internal_room
      // Order: pinned first, then by updated_at DESC
      const [all] = await pool.query(
        `SELECT c.* FROM chats c ORDER BY COALESCE(c.is_pinned, 0) DESC, c.updated_at DESC`
      ) as any[];
      rows = all;
    } else if (role === 'customer') {
      // Customer: only the 1:1 chat with their assigned employee
      const [cust] = await pool.query(
        `SELECT assigned_employee_id FROM customers WHERE id = ?`,
        [userId]
      ) as any[];
      const assignedEmployeeId = cust.length > 0 ? cust[0].assigned_employee_id : null;
      if (!assignedEmployeeId) {
        rows = [];
      } else {
        const [chats] = await pool.query(
          `SELECT DISTINCT c.*
           FROM chats c
           INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
           INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
           WHERE c.type = 'customer_employee'
           ORDER BY c.updated_at DESC`,
          [userId, assignedEmployeeId]
        ) as any[];
        rows = chats;
      }
    } else {
      // Employee: customer_employee chats with assigned customers only + internal_room chats they're in
      const [internal] = await pool.query(
        `SELECT c.* FROM chats c
         INNER JOIN chat_participants cp ON c.id = cp.chat_id AND cp.user_id = ?
         WHERE c.type = 'internal_room'
         ORDER BY c.updated_at DESC`,
        [userId]
      ) as any[];
      const [customerChats] = await pool.query(
        `SELECT DISTINCT c.*
         FROM chats c
         INNER JOIN chat_participants cp ON c.id = cp.chat_id AND cp.user_id = ?
         INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id != ?
         INNER JOIN employee_customer_assignments eca ON eca.employee_id = ? AND eca.customer_id = cp2.user_id
         WHERE c.type = 'customer_employee'
         ORDER BY c.updated_at DESC`,
        [userId, userId, userId]
      ) as any[];
      // Merge and sort: pinned first, then by updated_at
      const byId = new Map<string, any>();
      [...customerChats, ...internal].forEach((r: any) => byId.set(r.id, r));
      rows = Array.from(byId.values()).sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }

    // Get last message, unread count, and participant names for each chat
    const chats = await Promise.all(
      rows.map(async (chat: any) => {
        // Get last non-deleted message, or last message if all are deleted
        const [messages] = await pool.query(
          `SELECT cm.*,
            cmt_en.content as content_en,
            cmt_ar.content as content_ar,
            cmt_en.sender_name as sender_name_en,
            cmt_ar.sender_name as sender_name_ar
          FROM chat_messages cm
          LEFT JOIN chat_message_translations cmt_en ON cm.id = cmt_en.message_id AND cmt_en.locale = 'en'
          LEFT JOIN chat_message_translations cmt_ar ON cm.id = cmt_ar.message_id AND cmt_ar.locale = 'ar'
          WHERE cm.chat_id = ?
          ORDER BY cm.timestamp DESC
          LIMIT 1`,
          [chat.id]
        ) as any[];

        const lastMessage = messages.length > 0 ? {
          id: messages[0].id,
          content: messages[0].is_deleted 
            ? 'Message deleted' 
            : (messages[0].content_en || messages[0].content_ar || ''),
          senderName: messages[0].sender_name_en || messages[0].sender_name_ar || '',
          timestamp: messages[0].timestamp,
          isDeleted: messages[0].is_deleted || false,
        } : undefined;

        // Get participant names
        let participantNames: string[] = [];
        if (chat.type === 'customer_employee') {
          const [participants] = await pool.query(
            `SELECT cp.user_id, u.role,
              ut_en.name as name_en,
              ut_ar.name as name_ar
            FROM chat_participants cp
            INNER JOIN users u ON cp.user_id = u.id
            LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
            LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
            WHERE cp.chat_id = ? AND cp.user_id != ?`,
            [chat.id, userId]
          ) as any[];
          participantNames = participants.map((p: any) => {
            if (p.role === 'admin') return 'Admin';
            return p.name_en || p.name_ar || p.user_id;
          });
        }

        return {
          id: chat.id,
          type: chat.type,
          roomName: chat.room_name,
          participantNames,
          isPinned: chat.is_pinned || false,
          pinnedAt: chat.pinned_at || null,
          createdBy: chat.created_by || null,
          lastMessage,
          unreadCount: 0, // TODO: Implement unread count
          createdAt: chat.created_at,
          updatedAt: chat.updated_at,
        };
      })
    );

    return successResponse(chats);
  } catch (error: any) {
    console.error('Get chats error:', error?.message || error);
    return successResponse([]);
  }
}
