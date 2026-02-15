import { signOut } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";

export const logout = async () => {
  try {
    await signOut(auth);
    return true;
  } catch (error) {
    console.error("Logout error:", error);
    throw new Error("Failed to logout");
  }
};