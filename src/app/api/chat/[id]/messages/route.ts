import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, serverError, validationError } from '@/lib/api';
import { saveChatMessageTranslations } from '@/lib/translations';
import { translateToBothLanguages } from '@/lib/translate';
import { createNotificationAndPush } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/** Check if userId can read chatId. Returns null if allowed, or error response. */
async function checkCanReadChat(chatId: string, userId: string): Promise<ReturnType<typeof errorResponse> | null> {
  const [chatRows] = await pool.query(
    `SELECT id, type FROM chats WHERE id = ?`,
    [chatId]
  ) as any[];
  if (chatRows.length === 0) return errorResponse('Chat not found', 404, 'error.chatNotFound');
  const [userRows] = await pool.query(`SELECT role FROM users WHERE id = ?`, [userId]) as any[];
  if (userRows.length === 0) return errorResponse('User not found', 404, 'error.userNotFound');
  const role = userRows[0].role;
  const chatType = chatRows[0].type;

  const [participants] = await pool.query(
    `SELECT user_id FROM chat_participants WHERE chat_id = ?`,
    [chatId]
  ) as any[];
  const participantIds = participants.map((p: any) => p.user_id);
  const isParticipant = participantIds.includes(userId);

  if (role === 'admin') return null; // Admin can read any chat (monitor)
  if (role === 'customer') {
    if (!isParticipant || chatType !== 'customer_employee') return errorResponse('Access denied', 403, 'error.accessDenied');
    const [cust] = await pool.query(`SELECT assigned_employee_id FROM customers WHERE id = ?`, [userId]) as any[];
    const assigned = cust.length > 0 ? cust[0].assigned_employee_id : null;
    const other = participantIds.find((id: string) => id !== userId);
    if (other !== assigned) return errorResponse('Access denied', 403, 'error.accessDenied');
    return null;
  }
  if (role === 'employee') {
    if (!isParticipant) return errorResponse('Access denied', 403, 'error.accessDenied');
    if (chatType === 'customer_employee') {
      const [assign] = await pool.query(
        `SELECT 1 FROM employee_customer_assignments WHERE employee_id = ? AND customer_id = ?`,
        [userId, participantIds.find((id: string) => id !== userId)]
      ) as any[];
      if (assign.length === 0) return errorResponse('Access denied', 403, 'error.accessDenied');
    }
    return null;
  }
  return errorResponse('Access denied', 403, 'error.accessDenied');
}

/** Check if senderId can send in chatId. Returns null if allowed, or error response. */
async function checkCanSendInChat(chatId: string, senderId: string): Promise<ReturnType<typeof errorResponse> | null> {
  const [chatRows] = await pool.query(`SELECT id, type FROM chats WHERE id = ?`, [chatId]) as any[];
  if (chatRows.length === 0) return errorResponse('Chat not found', 404, 'error.chatNotFound');
  const [userRows] = await pool.query(`SELECT role FROM users WHERE id = ?`, [senderId]) as any[];
  if (userRows.length === 0) return errorResponse('User not found', 404, 'error.userNotFound');
  const role = userRows[0].role;
  const chatType = chatRows[0].type;

  let [participants] = await pool.query(`SELECT user_id FROM chat_participants WHERE chat_id = ?`, [chatId]) as any[];
  let participantIds = participants.map((p: any) => p.user_id);
  let isParticipant = participantIds.includes(senderId);

  // Admin: can join and send in internal rooms only; read-only in customer–employee 1:1 chats
  if (role === 'admin') {
    if (chatType === 'customer_employee') {
      return errorResponse('Admin cannot send messages in customer chats', 403, 'chat.adminCannotSendToCustomer');
    }
    if (chatType === 'internal_room') {
      if (!isParticipant) {
        await pool.query(`INSERT IGNORE INTO chat_participants (chat_id, user_id) VALUES (?, ?)`, [chatId, senderId]);
        isParticipant = true;
      }
      return null;
    }
  }

  if (!isParticipant) return errorResponse('Access denied', 403, 'error.accessDenied');
  if (role === 'employee' && chatType === 'customer_employee') {
    const other = participantIds.find((id: string) => id !== senderId);
    const [assign] = await pool.query(
      `SELECT 1 FROM employee_customer_assignments WHERE employee_id = ? AND customer_id = ?`,
      [senderId, other]
    ) as any[];
    if (assign.length === 0) return errorResponse('Access denied', 403, 'error.accessDenied');
  }
  return null;
}

/**
 * GET /api/chat/[id]/messages
 * Get all messages for a chat. Requires userId for access control.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatId = params.id;
    const locale = request.nextUrl.searchParams.get('locale') || 'en';
    const userId = request.nextUrl.searchParams.get('userId');

    if (!chatId) {
      return validationError('Chat ID is required', 'error.chatIdRequired');
    }
    if (!userId) {
      return validationError('userId is required for access control', 'error.userIdRequired');
    }

    const accessErr = await checkCanReadChat(chatId, userId);
    if (accessErr) return accessErr;

    // Get messages for the chat (include deleted messages but mark them)
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
      ORDER BY cm.timestamp ASC`,
      [chatId]
    ) as any[];

    // Format messages with translations based on locale
    const formattedMessages = messages.map((msg: any) => {
      const content = locale === 'ar' 
        ? (msg.content_ar || msg.content_en || '')
        : (msg.content_en || msg.content_ar || '');
      
      const senderName = locale === 'ar'
        ? (msg.sender_name_ar || msg.sender_name_en || msg.sender_name)
        : (msg.sender_name_en || msg.sender_name_ar || msg.sender_name);

      return {
        id: msg.id,
        chatId: msg.chat_id,
        senderId: msg.sender_id,
        senderName,
        senderRole: msg.sender_role,
        content: msg.is_deleted ? '' : content,
        fileUrl: msg.file_url,
        fileName: msg.file_name,
        fileType: msg.file_type,
        isEdited: !!(msg.is_edited),
        editedAt: msg.edited_at || null,
        isDeleted: !!(msg.is_deleted),
        deletedAt: msg.deleted_at || null,
        timestamp: msg.timestamp,
      };
    });

    return successResponse(formattedMessages);
  } catch (error: any) {
    console.error('Get messages error:', error);
    return serverError();
  }
}

/**
 * POST /api/chat/[id]/messages
 * Send a new message in a chat
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatId = params.id;
    const body = await request.json();
    const { senderId, content, fileName, fileType, fileUrl } = body;

    if (!chatId || !senderId) {
      return validationError('Chat ID and sender ID are required', 'error.missingRequiredFields');
    }
    const hasContent = content != null && String(content).trim() !== '';
    const hasFile = fileUrl && fileName;
    if (!hasContent && !hasFile) {
      return validationError('Message content or file is required', 'error.missingRequiredFields');
    }
    const contentToUse = hasContent ? String(content).trim() : (fileName ? `[${fileName}]` : '');

    const sendErr = await checkCanSendInChat(chatId, senderId);
    if (sendErr) return sendErr;

    // Get sender name translations (will be fetched after getting user data)

    // Generate message ID
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Translate message content to both languages
    let contentEn = contentToUse;
    let contentAr = contentToUse;

    try {
      const translations = await translateToBothLanguages(contentToUse);
      contentEn = translations.en;
      contentAr = translations.ar;
    } catch (translateError) {
      console.warn('Translation failed, using original text:', translateError);
      contentEn = contentToUse;
      contentAr = contentToUse;
    }

    // Get sender name and role from users table
    const [users] = await pool.query(
      `SELECT u.*, 
        ut_en.name as name_en,
        ut_ar.name as name_ar
      FROM users u
      LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
      LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
      WHERE u.id = ?`,
      [senderId]
    ) as any[];

    if (users.length === 0) {
      return errorResponse('Sender not found', 404, 'error.userNotFound');
    }

    const user = users[0];
    const senderName = user.name_en || user.name_ar || user.email || 'Unknown';
    const senderRole = user.role;
    const senderNameEn = user.name_en || user.email || 'Unknown';
    const senderNameAr = user.name_ar || user.name_en || user.email || 'Unknown';

    // Insert message
    await pool.query(
      `INSERT INTO chat_messages (id, chat_id, sender_id, sender_name, sender_role, file_url, file_name, file_type, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [messageId, chatId, senderId, senderName, senderRole, fileUrl || null, fileName || null, fileType || null]
    );

    // Save translations
    await saveChatMessageTranslations(
      messageId,
      contentEn,
      contentAr,
      senderNameEn,
      senderNameAr
    );

    // Update chat updated_at timestamp
    await pool.query(
      `UPDATE chats SET updated_at = NOW() WHERE id = ?`,
      [chatId]
    );

    // Notify other participants (in-app + FCM) with EN/AR so each sees their language
    const [participants] = await pool.query(
      `SELECT user_id FROM chat_participants WHERE chat_id = ?`,
      [chatId]
    ) as any[];
    const recipientIds = (participants || []).map((p: { user_id: string }) => p.user_id).filter((id: string) => id !== senderId);
    const titleEn = `New message from ${senderNameEn}`;
    const titleAr = `رسالة جديدة من ${senderNameAr}`;
    const msgPreview = (s: string) => (s.length > 100 ? s.slice(0, 97) + '...' : s);
    for (const recipientId of recipientIds) {
      await createNotificationAndPush(
        recipientId,
        titleEn,
        titleAr,
        msgPreview(contentEn),
        msgPreview(contentAr),
        'info'
      );
    }

    // Return the created message
    const message = {
      id: messageId,
      chatId,
      senderId,
      senderName: senderNameEn,
      senderRole,
      content: contentEn,
      fileUrl: fileUrl || undefined,
      fileName: fileName || undefined,
      fileType: fileType || undefined,
      timestamp: new Date().toISOString(),
    };

    return successResponse(message, 'Message sent successfully', 'error.messageSentSuccessfully');
  } catch (error: any) {
    console.error('Send message error:', error);
    return serverError();
  }
}
