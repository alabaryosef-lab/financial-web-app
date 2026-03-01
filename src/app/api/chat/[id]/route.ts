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

    if (!userId) {
      return errorResponse('User ID is required', 400, 'error.userIdRequired');
    }

    // Check if user is admin
    const [users] = await pool.query(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    ) as any[];

    if (users.length === 0 || users[0].role !== 'admin') {
      return unauthorizedError();
    }

    const [chats] = await pool.query(
      'SELECT id, type, loan_id FROM chats WHERE id = ?',
      [chatId]
    ) as any[];

    if (chats.length === 0) {
      console.warn('Delete chat: not found in DB, chatId=', chatId);
      return errorResponse('Chat not found', 404, 'error.chatNotFound');
    }

    const chat = chats[0];
    const isUnifiedCustomerChat = chat.type === 'customer_employee' && (chat.loan_id == null || chat.loan_id === '');
    if (isUnifiedCustomerChat) {
      return errorResponse(
        'Cannot delete this chat while the customer exists. Delete the customer first.',
        400,
        'chat.cannotDeleteUnifiedChatWhileCustomerExists'
      );
    }

    // Permanently delete: translations, read status, messages, participants, then chat
    await pool.query('DELETE FROM chat_read_status WHERE chat_id = ?', [chatId]);
    await pool.query(
      `DELETE cmt FROM chat_message_translations cmt
       INNER JOIN chat_messages cm ON cmt.message_id = cm.id
       WHERE cm.chat_id = ?`,
      [chatId]
    );
    await pool.query('DELETE FROM chat_messages WHERE chat_id = ?', [chatId]);
    await pool.query('DELETE FROM chat_participants WHERE chat_id = ?', [chatId]);
    await pool.query('DELETE FROM chats WHERE id = ?', [chatId]);

    return successResponse(
      { deleted: true },
      'Room deleted successfully',
      'chat.roomDeleted'
    );
  } catch (error: any) {
    console.error('Delete chat error:', error);
    return serverError();
  }
}
