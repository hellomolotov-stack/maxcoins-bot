import { db } from './firebase';
import { Task, Submission } from '../types';
import * as admin from 'firebase-admin';

export async function createTask(data: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
  const ref = db.collection('tasks').doc();
  const task: Task = {
    ...data,
    id: ref.id,
    createdAt: admin.firestore.Timestamp.now(),
  };
  await ref.set(task);
  return task;
}

export async function getActiveTasks(): Promise<Task[]> {
  const snap = await db.collection('tasks').where('active', '==', true).get();
  return snap.docs.map(d => d.data() as Task);
}

export async function getTask(taskId: string): Promise<Task | null> {
  const snap = await db.collection('tasks').doc(taskId).get();
  return snap.exists ? (snap.data() as Task) : null;
}

export async function deactivateTask(taskId: string): Promise<void> {
  await db.collection('tasks').doc(taskId).update({ active: false });
}

export async function createSubmission(
  data: Omit<Submission, 'id' | 'submittedAt'>
): Promise<Submission> {
  const ref = db.collection('submissions').doc();
  const submission: Submission = {
    ...data,
    id: ref.id,
    submittedAt: admin.firestore.Timestamp.now(),
  };
  await ref.set(submission);
  return submission;
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const snap = await db.collection('submissions').doc(id).get();
  return snap.exists ? (snap.data() as Submission) : null;
}

export async function updateSubmission(
  id: string,
  data: Partial<Submission>
): Promise<void> {
  await db.collection('submissions').doc(id).update({
    ...data,
    reviewedAt: admin.firestore.Timestamp.now(),
  });
}

export async function getPendingSubmissions(): Promise<Submission[]> {
  const snap = await db
    .collection('submissions')
    .where('status', '==', 'pending')
    .get();
  const subs = snap.docs.map(d => d.data() as Submission);
  return subs.sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0));
}
