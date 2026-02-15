import { collection, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { getAuth } from "firebase/auth";

export async function setupRooms(startRoom: number, count: number) {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    alert("You must be logged in to setup rooms");
    return;
  }

  const uid = user.uid;

  try {
    // Check if rooms already exist
    const existingRoomsQuery = query(
      collection(db, "users", uid, "rooms")
    );
    const existingRooms = await getDocs(existingRoomsQuery);

    if (!existingRooms.empty) {
      alert("❌ Rooms already exist for this account");
      return;
    }

    // Create rooms
    for (let i = 0; i < count; i++) {
      const roomNumber = startRoom + i;

      await setDoc(doc(db, "users", uid, "rooms", `room${roomNumber}`), {
        roomNumber,
        status: "available",
        guestName: null,
        guestMobile: null,
        guestId: null,
        assignedAt: null,
        checkoutAt: null,
        createdAt: new Date(),
      });
    }

    alert(`✅ Successfully created ${count} rooms for your account!`);
    return true;
  } catch (error) {
    console.error("Error setting up rooms:", error);
    alert("❌ Failed to setup rooms");
    return false;
  }
}

// Helper function to check if user has rooms
export async function userHasRooms(): Promise<boolean> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) return false;

  try {
    const existingRoomsQuery = query(
      collection(db, "users", user.uid, "rooms")
    );
    const existingRooms = await getDocs(existingRoomsQuery);
    return !existingRooms.empty;
  } catch (error) {
    console.error("Error checking rooms:", error);
    return false;
  }
}