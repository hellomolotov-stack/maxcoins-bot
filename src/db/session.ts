import { db } from './firebase';
import * as admin from 'firebase-admin';

type SessionData = {
  taskDraftId?: string;
  wishDraft?: { title?: string };
  pendingPhoto?: string;
  pendingReject?: string;
  childSetup?: { step: 'id' | 'name'; childId?: number };
  addChild?: { step: 'id' | 'name'; childId?: number };
};

export type TaskDraft = {
  userId: number;
  title?: string;
  description?: string;
  reward?: number;
  createdAt: FirebaseFirestore.Timestamp;
};

const col = (userId: number) => db.collection('sessions').doc(String(userId));

export async function getSession(userId: number): Promise<SessionData> {
  const snap = await col(userId).get();
  return (snap.data() as SessionData) ?? {};
}

export async function setSessionKey<K extends keyof SessionData>(
  userId: number,
  key: K,
  value: SessionData[K]
) {
  await col(userId).set({ [key]: value }, { merge: true });
}

export async function clearSessionKey(userId: number, key: keyof SessionData) {
  await col(userId).update({ [key]: admin.firestore.FieldValue.delete() });
}

export async function createTaskDraft(userId: number): Promise<string> {
  const ref = db.collection('taskDrafts').doc();
  await ref.set({ userId, createdAt: admin.firestore.Timestamp.now() });
  await setSessionKey(userId, 'taskDraftId', ref.id);
  return ref.id;
}

export async function getTaskDraft(draftId: string): Promise<TaskDraft | null> {
  const snap = await db.collection('taskDrafts').doc(draftId).get();
  return snap.exists ? (snap.data() as TaskDraft) : null;
}

export async function updateTaskDraft(draftId: string, data: Partial<TaskDraft>): Promise<void> {
  await db.collection('taskDrafts').doc(draftId).update(data);
}

export async function deleteTaskDraft(draftId: string): Promise<void> {
  await db.collection('taskDrafts').doc(draftId).delete();
}
