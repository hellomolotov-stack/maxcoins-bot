import { db } from './firebase';
import { TaskProposal, FeatureRequest } from '../types';
import * as admin from 'firebase-admin';

export async function createTaskProposal(
  data: Omit<TaskProposal, 'id' | 'createdAt'>
): Promise<TaskProposal> {
  const ref = db.collection('taskProposals').doc();
  const proposal: TaskProposal = { ...data, id: ref.id, createdAt: admin.firestore.Timestamp.now() };
  await ref.set(proposal);
  return proposal;
}

export async function getTaskProposal(id: string): Promise<TaskProposal | null> {
  const snap = await db.collection('taskProposals').doc(id).get();
  return snap.exists ? (snap.data() as TaskProposal) : null;
}

export async function updateTaskProposalStatus(id: string, status: TaskProposal['status']): Promise<void> {
  await db.collection('taskProposals').doc(id).update({ status });
}

export async function getPendingTaskProposals(): Promise<TaskProposal[]> {
  const snap = await db.collection('taskProposals').where('status', '==', 'pending').get();
  const proposals = snap.docs.map(d => d.data() as TaskProposal);
  return proposals.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export async function createFeatureRequest(
  data: Omit<FeatureRequest, 'id' | 'createdAt'>
): Promise<FeatureRequest> {
  const ref = db.collection('featureRequests').doc();
  const req: FeatureRequest = { ...data, id: ref.id, createdAt: admin.firestore.Timestamp.now() };
  await ref.set(req);
  return req;
}

export async function getFeatureRequests(): Promise<FeatureRequest[]> {
  const snap = await db.collection('featureRequests').get();
  const reqs = snap.docs.map(d => d.data() as FeatureRequest);
  return reqs.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}
