type WSEvent = { type: string; data?: any };

function getManager(): any {
  return (globalThis as any).__wsManager;
}

export function wsSendToUser(userId: string, event: WSEvent) {
  getManager()?.sendToUser(userId, event);
}

export function wsSendToUsers(userIds: string[], event: WSEvent) {
  getManager()?.sendToUsers(userIds, event);
}

export function wsBroadcast(event: WSEvent) {
  getManager()?.broadcast(event);
}
