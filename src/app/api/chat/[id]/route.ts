import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, serverError, unauthorizedError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/chat/[id]
 * Delete a chat room (admin only; any room)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatId = params.id;
    const userId = request.nextUrl.searchParams.get('userId');
    console.log('[DELETE CHAT] START chatId=', chatId, 'userId=', userId);

    if (!userId) {
      console.log('[DELETE CHAT] FAIL: no userId provided');
      return errorResponse('User ID is required', 400, 'error.userIdRequired');
    }

    const [users] = await pool.query(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    ) as any[];
    console.log('[DELETE CHAT] User lookup:', users.length > 0 ? `role=${users[0].role}` : 'NOT FOUND');

    if (users.length === 0 || users[0].role !== 'admin') {
      console.log('[DELETE CHAT] FAIL: not admin');
      return unauthorizedError();
    }

    const [chats] = await pool.query(
      'SELECT id, type, loan_id, room_name FROM chats WHERE id = ?',
      [chatId]
    ) as any[];
    console.log('[DELETE CHAT] Chat lookup:', chats.length > 0 ? `type=${chats[0].type} room_name=${chats[0].room_name}` : 'NOT FOUND');

    if (chats.length === 0) {
      const [allChats] = await pool.query('SELECT id FROM chats WHERE id LIKE ?', [`%${chatId.slice(-10)}%`]) as any[];
      console.warn('[DELETE CHAT] Chat not found in DB. chatId=', chatId, 'Similar IDs:', allChats.map((c: any) => c.id));
      return errorResponse('Chat not found', 404, 'error.chatNotFound');
    }

    const chat = chats[0];
    const isUnifiedCustomerChat = chat.type === 'customer_employee' && (chat.loan_id == null || chat.loan_id === '');
    if (isUnifiedCustomerChat) {
      console.log('[DELETE CHAT] BLOCKED: unified customer chat cannot be deleted');
      return errorResponse(
        'Cannot delete this chat while the customer exists. Delete the customer first.',
        400,
        'chat.cannotDeleteUnifiedChatWhileCustomerExists'
      );
    }

    console.log('[DELETE CHAT] Deleting read status...');
    const [r1] = await pool.query('DELETE FROM chat_read_status WHERE chat_id = ?', [chatId]) as any[];
    console.log('[DELETE CHAT] Read status deleted:', r1.affectedRows, 'rows');

    console.log('[DELETE CHAT] Deleting message translations...');
    const [r2] = await pool.query(
      `DELETE cmt FROM chat_message_translations cmt
       INNER JOIN chat_messages cm ON cmt.message_id = cm.id
       WHERE cm.chat_id = ?`,
      [chatId]
    ) as any[];
    console.log('[DELETE CHAT] Translations deleted:', r2.affectedRows, 'rows');

    console.log('[DELETE CHAT] Deleting messages...');
    const [r3] = await pool.query('DELETE FROM chat_messages WHERE chat_id = ?', [chatId]) as any[];
    console.log('[DELETE CHAT] Messages deleted:', r3.affectedRows, 'rows');

    console.log('[DELETE CHAT] Deleting participants...');
    const [r4] = await pool.query('DELETE FROM chat_participants WHERE chat_id = ?', [chatId]) as any[];
    console.log('[DELETE CHAT] Participants deleted:', r4.affectedRows, 'rows');

    console.log('[DELETE CHAT] Deleting chat record...');
    const [r5] = await pool.query('DELETE FROM chats WHERE id = ?', [chatId]) as any[];
    console.log('[DELETE CHAT] Chat deleted:', r5.affectedRows, 'rows');

    console.log('[DELETE CHAT] SUCCESS chatId=', chatId);
    return successResponse(
      { deleted: true },
      'Room deleted successfully',
      'chat.roomDeleted'
    );
  } catch (error: any) {
    console.error('[DELETE CHAT] ERROR:', error?.message || error, 'code=', error?.code, 'sql=', error?.sql);
    return serverError();
  }
}
