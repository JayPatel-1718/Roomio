import { View, Text, StyleSheet } from "react-native";
import { useEffect } from "react";
import { useRouter, Stack } from "expo-router";

export default function LoginSuccess() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/(tabs)/dashboard");
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>
        <View style={styles.checkContainer}>
          <Text style={styles.check}>✓</Text>
        </View>

        <Text style={styles.title}>You're in.</Text>
        <Text style={styles.subtitle}>Roomio's got your back ✨</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },

  checkContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },

  check: {
    fontSize: 42,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 42,
    includeFontPadding: false,
    textAlignVertical: "center",
    marginTop: -2,
  },

  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginTop: 8,
  },

  subtitle: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
  },
});
