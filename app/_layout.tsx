import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import CustomSplash from "../components/CustomSplash";

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  // ✅ Improved Font Loading for Web
  const [loaded, error] = useFonts({
    ...Ionicons.font,
    ...FontAwesome.font,
  });

  // Handle errors
  useEffect(() => {
    if (error) console.warn("Error loading fonts", error);
  }, [error]);

  if (showSplash || !loaded) {
    return <CustomSplash onFinish={() => setShowSplash(false)} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}