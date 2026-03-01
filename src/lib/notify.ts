/**
 * Server-side: create in-app notification (with EN/AR) and send FCM push.
 * Notifications are shown in the user's selected language via GET /api/notifications?locale=
 */

import pool from './db';
import { saveNotificationTranslations } from './translations';
import { wsSendToUser } from './ws-broadcast';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * Create a notification for a user with EN/AR translations and send FCM push.
 * Does not throw; logs and continues on FCM failure.
 */
export async function createNotificationAndPush(
  userId: string,
  titleEn: string,
  titleAr: string,
  messageEn: string,
  messageAr: string,
  type: NotificationType = 'info',
  referenceId?: string
): Promise<string | null> {
  console.log('[Notify] createNotificationAndPush called:', { userId, titleEn, titleAr, messageEn: messageEn.substring(0, 50), messageAr: messageAr.substring(0, 50), type });
  
  const notificationId = `notification-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 6)}`;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO notifications (id, user_id, type, is_read, reference_id) VALUES (?, ?, ?, FALSE, ?)`,
      [notificationId, userId, type, referenceId ?? null]
    );
    await connection.commit();
    console.log('[Notify] Notification created in DB:', notificationId);
  } catch (err) {
    await connection.rollback();
    console.error('[Notify] Create notification error:', err);
    return null;
  } finally {
    connection.release();
  }

  try {
    await saveNotificationTranslations(
      notificationId,
      titleEn,
      messageEn,
      titleAr,
      messageAr
    );
  } catch (err) {
    console.error('[Notify] Save notification translations error:', err);
  }

  wsSendToUser(userId, { type: 'notification:new', data: { notificationId } });

  return notificationId;
}
