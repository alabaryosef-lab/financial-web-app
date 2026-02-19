import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, serverError, unauthorizedError, validationError } from '@/lib/api';
import { saveChatMessageTranslations } from '@/lib/translations';
import { translateToBothLanguages } from '@/lib/translate';

export const dynamic = 'force-dynamic';

const EDIT_WINDOW_SECONDS = 600; // 10 minutes

/**
 * PUT /api/chat/[id]/messages/[messageId]
 * Edit a message (within 10 minutes, sender only, admin/employee only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const chatId = String(params.id || '').trim();
    const messageId = String(params.messageId || '').trim();
    const body = await request.json();
    const { content, userId } = body;

    if (!content || !userId) {
      return validationError('Content and userId are required', 'error.missingRequiredFields');
    }

    if (content.trim().length === 0) {
      return validationError('Message content cannot be empty', 'error.messageContentRequired');
    }

    if (!messageId || !chatId) {
      return validationError('Chat ID and message ID are required', 'error.missingRequiredFields');
    }

    // Get message by id first, then verify chat_id
    const [messages] = await pool.query(
      `SELECT cm.id, cm.chat_id, cm.sender_id, cm.sender_role, cm.timestamp, cm.is_deleted, cm.original_content,
        cmt_en.content as content_en, cmt_ar.content as content_ar
      FROM chat_messages cm
      LEFT JOIN chat_message_translations cmt_en ON cm.id = cmt_en.message_id AND cmt_en.locale = 'en'
      LEFT JOIN chat_message_translations cmt_ar ON cm.id = cmt_ar.message_id AND cmt_ar.locale = 'ar'
      WHERE cm.id = ?`,
      [messageId]
    ) as any[];

    if (messages.length === 0) {
      return errorResponse('Message not found', 404, 'error.messageNotFound');
    }

    const message = messages[0];
    if (message.chat_id !== chatId) {
      return errorResponse('Message not found in this chat', 404, 'error.messageNotFound');
    }

    // Check if user is the sender
    if (message.sender_id !== userId) {
      return unauthorizedError();
    }

    // Check if user is admin or employee
    if (message.sender_role !== 'admin' && message.sender_role !== 'employee') {
      return errorResponse('Only admin and employee can edit messages', 403, 'error.onlyAdminEmployeeCanEdit');
    }

    // Check if message is deleted
    if (message.is_deleted) {
      return errorResponse('Cannot edit deleted message', 400, 'error.cannotEditDeleted');
    }

    // Check if within 10-minute window
    const messageTime = new Date(message.timestamp).getTime();
    const now = Date.now();
    const ageSeconds = (now - messageTime) / 1000;

    if (ageSeconds > EDIT_WINDOW_SECONDS) {
      return errorResponse('Message can only be edited within 10 minutes', 400, 'error.editWindowExpired');
    }

    // Store original content if first edit (use English content as original)
    const originalContent = message.original_content || message.content_en || content.trim();
    const trimmedContent = content.trim();

    // Translate new content (with timeout so request doesn't hang)
    let contentEn = trimmedContent;
    let contentAr = trimmedContent;
    try {
      const timeoutMs = 8000;
      const translations = await Promise.race([
        translateToBothLanguages(trimmedContent),
        new Promise<{ en: string; ar: string }>((_, reject) =>
          setTimeout(() => reject(new Error('Translation timeout')), timeoutMs)
        ),
      ]);
      contentEn = translations.en;
      contentAr = translations.ar;
    } catch (translateError) {
      console.warn('Translation failed or timeout, using original text:', translateError);
    }

    // Update message (chat_messages has no content column - content lives in chat_message_translations)
    await pool.query(
      `UPDATE chat_messages 
       SET is_edited = TRUE, edited_at = NOW(), original_content = ?
       WHERE id = ?`,
      [originalContent, messageId]
    );

    // Update translations
    const [senderData] = await pool.query(
      `SELECT ut_en.name as name_en, ut_ar.name as name_ar
       FROM users u
       LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
       LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
       WHERE u.id = ?`,
      [message.sender_id]
    ) as any[];

    const senderNameEn = senderData[0]?.name_en || 'Unknown';
    const senderNameAr = senderData[0]?.name_ar || senderNameEn || 'Unknown';

    await saveChatMessageTranslations(messageId, contentEn, contentAr, senderNameEn, senderNameAr);

    // Update chat updated_at
    await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = ?', [chatId]);

    return successResponse(
      { edited: true },
      'Message edited successfully',
      'chat.messageEdited'
    );
  } catch (error: any) {
    console.error('Edit message error:', error);
    return serverError();
  }
}

/**
 * DELETE /api/chat/[id]/messages/[messageId]
 * Delete a message (within 10 minutes, sender only, admin/employee only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const chatId = String(params.id || '').trim();
    const messageId = String(params.messageId || '').trim();
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return validationError('userId is required', 'error.userIdRequired');
    }
    if (!messageId || !chatId) {
      return validationError('Chat ID and message ID are required', 'error.missingRequiredFields');
    }

    // Get message by id first (then verify chat_id) so we handle any routing/encoding edge cases
    const [messages] = await pool.query(
      'SELECT id, chat_id, sender_id, sender_role, timestamp, is_deleted FROM chat_messages WHERE id = ?',
      [messageId]
    ) as any[];

    if (messages.length === 0) {
      return errorResponse('Message not found', 404, 'error.messageNotFound');
    }

    const message = messages[0];
    if (message.chat_id !== chatId) {
      return errorResponse('Message not found in this chat', 404, 'error.messageNotFound');
    }

    // Check if user is the sender
    if (message.sender_id !== userId) {
      return unauthorizedError();
    }

    // Check if user is admin or employee
    if (message.sender_role !== 'admin' && message.sender_role !== 'employee') {
      return errorResponse('Only admin and employee can delete messages', 403, 'error.onlyAdminEmployeeCanDelete');
    }

    // Check if already deleted
    if (message.is_deleted) {
      return errorResponse('Message already deleted', 400, 'error.messageAlreadyDeleted');
    }

    // Check if within 10-minute window
    const messageTime = new Date(message.timestamp).getTime();
    const now = Date.now();
    const ageSeconds = (now - messageTime) / 1000;

    if (ageSeconds > EDIT_WINDOW_SECONDS) {
      return errorResponse('Message can only be deleted within 10 minutes', 400, 'error.deleteWindowExpired');
    }

    // Soft delete
    await pool.query(
      `UPDATE chat_messages 
       SET is_deleted = TRUE, deleted_at = NOW() 
       WHERE id = ?`,
      [messageId]
    );

    // Update chat updated_at
    await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = ?', [chatId]);

    return successResponse(
      { deleted: true },
      'Message deleted successfully',
      'chat.messageDeleted'
    );
  } catch (error: any) {
    console.error('Delete message error:', error);
    return serverError();
  }
}
