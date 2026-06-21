import { db } from './firebase';
import { Wish } from '../types';
import * as admin from 'firebase-admin';

export async function createWish(
  data: Omit<Wish, 'id' | 'createdAt'>
): Promise<Wish> {
  const ref = db.collection('wishes').doc();
  const wish: Wish = {
    ...data,
    id: ref.id,
    createdAt: admin.firestore.Timestamp.now(),
  };
  await ref.set(wish);
  return wish;
}

export async function getWishes(status?: Wish['status']): Promise<Wish[]> {
  let query: FirebaseFirestore.Query = db.collection('wishes');
  if (status) query = query.where('status', '==', status);
  const snap = await query.get();
  const wishes = snap.docs.map(d => d.data() as Wish);
  return wishes.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export async function getWish(id: string): Promise<Wish | null> {
  const snap = await db.collection('wishes').doc(id).get();
  return snap.exists ? (snap.data() as Wish) : null;
}

export async function updateWishStatus(
  id: string,
  status: Wish['status']
): Promise<void> {
  await db.collection('wishes').doc(id).update({ status });
}

export async function getWishesMulti(statuses: Wish['status'][]): Promise<Wish[]> {
  const snap = await db.collection('wishes').get();
  const all = snap.docs.map(d => d.data() as Wish);
  return all
    .filter(w => statuses.includes(w.status))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}
