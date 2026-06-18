import { db } from './firebase';
import * as admin from 'firebase-admin';

type SessionData = {
  taskDraft?: { title?: string; description?: string; reward?: number };
  wishDraft?: { title?: string };
  pendingPhoto?: string;
  pendingReject?: string;
  childSetup?: { step: 'id' | 'name'; childId?: number };
  addChild?: { step: 'id' | 'name'; childId?: number };
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
