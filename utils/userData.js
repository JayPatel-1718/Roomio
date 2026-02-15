import { 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  serverTimestamp,
  query,
  where,
  getDocs
} from "firebase/firestore";
import { auth } from "../firebase/firebaseConfig";
import { db } from "../firebase/firebaseConfig";

// Get current user UID
export const getCurrentUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");
  return user.uid;
};

// Get user's rooms collection reference
export const getUserRoomsRef = () => {
  const uid = getCurrentUserId();
  return collection(db, "users", uid, "rooms");
};

// Get user's room document reference
export const getUserRoomRef = (roomId) => {
  const uid = getCurrentUserId();
  return doc(db, "users", uid, "rooms", roomId);
};

// Initialize user profile (call this on first login)
export const initializeUserProfile = async (userData) => {
  const uid = getCurrentUserId();
  const userRef = doc(db, "users", uid);
  
  await setDoc(userRef, {
    email: userData.email,
    name: userData.displayName || "Admin",
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  }, { merge: true });
};

// Helper function to check if user has rooms
export const checkUserHasRooms = async () => {
  const uid = getCurrentUserId();
  const roomsQuery = query(collection(db, "users", uid, "rooms"));
  const snapshot = await getDocs(roomsQuery);
  return !snapshot.empty;
};

// Helper function to get all user data
export const getUserData = async () => {
  const uid = getCurrentUserId();
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    return userSnap.data();
  }
  return null;
};