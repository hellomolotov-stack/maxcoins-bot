import { db } from './firebase';
import { Balance, Settings } from '../types';
import * as admin from 'firebase-admin';

const balanceRef = () => db.collection('config').doc('balance');
const settingsRef = () => db.collection('config').doc('settings');

export async function getBalance(): Promise<Balance> {
  const snap = await balanceRef().get();
  if (!snap.exists) {
    const initial: Balance = {
      value: 0,
      maxcoins: 0,
      lastDriftAt: admin.firestore.Timestamp.now(),
    };
    await balanceRef().set(initial);
    return initial;
  }
  return snap.data() as Balance;
}

export async function getSettings(): Promise<Settings> {
  const snap = await settingsRef().get();
  return snap.data() as Settings;
}

export async function addMaxcoins(amount: number): Promise<Balance> {
  await balanceRef().update({
    maxcoins: admin.firestore.FieldValue.increment(amount),
    value: admin.firestore.FieldValue.increment(amount),
  });
  return getBalance();
}

export async function spendMaxcoins(amount: number): Promise<Balance> {
  await balanceRef().update({
    maxcoins: admin.firestore.FieldValue.increment(-amount),
    value: admin.firestore.FieldValue.increment(-amount),
  });
  return getBalance();
}

export async function applyDailyDrift(): Promise<Balance> {
  const settings = await getSettings();
  const drift = settings?.dailyDrift ?? 10;
  await balanceRef().update({
    value: admin.firestore.FieldValue.increment(drift),
    lastDriftAt: admin.firestore.Timestamp.now(),
  });
  return getBalance();
}
