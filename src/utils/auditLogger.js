import { db } from '../config/firebase';
import { collection, addDoc } from 'firebase/firestore';

export const logActivity = async (username, aktivitas) => {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      username: username || 'Unknown User',
      aktivitas: aktivitas,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("CCTV Gagal merekam:", error);
  }
};