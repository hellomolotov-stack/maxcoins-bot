export type Role = 'parent' | 'child';

export interface BotUser {
  telegramId: number;
  name: string;
  role: Role;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  reward: number;
  type: 'once' | 'recurring';
  recurringSchedule?: 'daily' | number[]; // number[] = days of week (0=Sun)
  active: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface Submission {
  id: string;
  taskId: string;
  taskTitle: string;
  childId: number;
  photoFileId: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: FirebaseFirestore.Timestamp;
  reviewedAt?: FirebaseFirestore.Timestamp;
  comment?: string;
}

export interface Wish {
  id: string;
  title: string;
  cost: number;
  proposedBy: number;
  status: 'pending' | 'approved' | 'rejected' | 'redeemed' | 'current';
  createdAt: FirebaseFirestore.Timestamp;
}

export interface Balance {
  value: number;       // положительное = на стороне ребёнка, отрицательное = родители
  maxcoins: number;    // накопленные монетки ребёнка
  lastDriftAt: FirebaseFirestore.Timestamp;
}

export interface ParentInfo {
  id: number;
  name: string;
  role: 'Мама' | 'Папа' | '';
}

export interface Settings {
  dailyDrift: number;
  parentIds: number[];
  parents: ParentInfo[];
  childId: number;
  childName: string;
  familyName?: string;
}

export interface TaskProposal {
  id: string;
  title: string;
  description: string;
  childId: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: FirebaseFirestore.Timestamp;
}

export interface FeatureRequest {
  id: string;
  text: string;
  from: number;
  fromName: string;
  createdAt: FirebaseFirestore.Timestamp;
}
