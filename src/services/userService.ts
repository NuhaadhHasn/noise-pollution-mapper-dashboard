import { db } from '@/config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export interface UserInfo {
  uid: string;
  email: string | null;
  displayName?: string | null;
}

/**
 * Fetch all users from Firestore users collection
 */
export async function fetchAllUsers(): Promise<Map<string, UserInfo>> {
  const userMap = new Map<string, UserInfo>();
  
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      userMap.set(doc.id, {
        uid: doc.id,
        email: data.email || null,
        displayName: data.displayName || null,
      });
    });
  } catch (error) {
    console.error('[fetchAllUsers] Error fetching users:', error);
  }
  
  return userMap;
}

/**
 * Get email for a specific user ID
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('__name__', '==', userId));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return doc.data().email || null;
    }
  } catch (error) {
    console.error('[getUserEmail] Error fetching user:', error);
  }
  
  return null;
}
