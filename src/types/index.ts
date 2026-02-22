export type UserRole = 'admin' | 'employee' | 'customer';

export type LoanStatus = 'under_review' | 'approved' | 'active' | 'rejected' | 'closed';

export interface User {
  id: string;
  email: string;
  name: string;
  /** Optional i18n key for display name (demo/translated names) */
  nameKey?: string;
  role: UserRole;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Employee extends User {
  role: 'employee';
  assignedCustomerIds: string[];
}

export interface Customer extends User {
  role: 'customer';
  assignedEmployeeId: string;
  /** All employee ids assigned to this customer (from employee_customer_assignments) */
  assignedEmployeeIds?: string[];
  phone?: string;
  address?: string;
}

export interface Loan {
  id: string;
  customerId: string;
  employeeId: string;
  /** Assigned employees on this loan = team in this loan's chat (single list from loan_employees) */
  employeeIds?: string[];
  amount: number;
  interestRate: number;
  numberOfInstallments: number;
  installmentTotal: number;
  startDate: string;
  status: LoanStatus;
  notes?: string;
  /** Optional i18n key for notes (translated demo content) */
  notesKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  content: string;
  /** Optional i18n key for message content (used for demo/translated messages) */
  contentKey?: string;
  /** Optional i18n key for sender display name */
  senderNameKey?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  timestamp: string;
}

export interface Chat {
  id: string;
  type: 'customer_employee' | 'internal_room';
  participantIds?: string[]; // Other participants' user ids (for search)
  participantNames?: string[]; // Names of other participants (excluding current user)
  roomName?: string; // For internal rooms
  isPinned?: boolean;
  pinnedAt?: string;
  createdBy?: string;
  lastMessage?: ChatMessage & { isDeleted?: boolean };
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  /** Optional i18n key for title */
  titleKey?: string;
  /** Optional i18n key for message */
  messageKey?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: string;
}

export interface Broadcast {
  id: string;
  title: string;
  message: string;
  targetRoles: UserRole[];
  targetUserIds?: string[];
  createdBy: string;
  createdAt: string;
}

export interface InternalRoom {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  memberIds: string[];
  createdAt: string;
}

export type Locale = 'en' | 'ar';
