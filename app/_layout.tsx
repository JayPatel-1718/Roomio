import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import CustomSplash from "../components/CustomSplash";
import { auth } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { userHasRooms } from "../utils/setupRooms";

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const router = useRouter();

  // ✅ Improved Font Loading for Web
  const [loaded, error] = useFonts({
    ...Ionicons.font,
    ...FontAwesome.font,
  });

  // Handle errors
  useEffect(() => {
    if (error) console.warn("Error loading fonts", error);
  }, [error]);

  // Handle Authentication State & Redirection
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log("👤 User already logged in:", user.email);
        try {
          const hasRooms = await userHasRooms();
          if (hasRooms) {
            router.replace("/ownership");
          } else {
            router.replace("/onboarding");
          }
        } catch (e) {
          console.error("Auth check failed:", e);
        }
      }
      setIsAuthenticating(false);
    });

    return () => unsubscribe();
  }, []);

  if (showSplash || !loaded || isAuthenticating) {
    return <CustomSplash onFinish={() => setShowSplash(false)} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}