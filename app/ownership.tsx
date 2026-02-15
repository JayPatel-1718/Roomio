import { useEffect } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  SafeAreaView, 
  Image 
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";

// Import your logo image
import logoImage from "../assets/images/logo.png";

export default function Ownership() {
  const router = useRouter();
  const auth = getAuth();

  useEffect(() => {
    // protect this page (only after login)
    if (!auth.currentUser) {
      router.replace("/admin-login");
    }
  }, [auth, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Decorative Background */}
        <View style={styles.backgroundDecor} pointerEvents="none">
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <View style={styles.bgCircle3} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          {/* Logo Image Only */}
          <Image 
            source={logoImage} 
            style={styles.logoImage}
            resizeMode="contain"
          />

          <Text style={styles.brand}>Roomio</Text>
          <Text style={styles.title}>Select Property Type</Text>
          <Text style={styles.subtitle}>
            Currently supported: Hotel dashboard
          </Text>
        </View>

        {/* ONLY HOTEL OPTION */}
        <View style={styles.grid}>
          <Pressable
            onPress={() => router.replace("/(tabs)/dashboard")}
            style={({ pressed }) => [
              styles.choiceCard,
              pressed && styles.choicePressed,
            ]}
          >
            <View style={[styles.choiceIcon, { backgroundColor: "rgba(22,163,74,0.12)" }]}>
              <Ionicons name="business-outline" size={26} color="#16A34A" />
            </View>

            <Text style={styles.choiceTitle}>Hotel</Text>
            <Text style={styles.choiceSub}>
              Room management, guest check-in, service requests
            </Text>

            <View style={styles.choiceActionRow}>
              <Text style={styles.choiceActionText}>Open Hotel Dashboard</Text>
              <Ionicons name="arrow-forward" size={18} color="#2563EB" />
            </View>
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerPill}>
            <View style={styles.footerDot} />
            <Text style={styles.footerText}>Secure Admin Session</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },

  backgroundDecor: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  bgCircle1: {
    position: "absolute",
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  bgCircle2: {
    position: "absolute",
    top: 160,
    left: -110,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(37, 99, 235, 0.05)",
  },
  bgCircle3: {
    position: "absolute",
    bottom: 40,
    right: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
  },

  header: { 
    alignItems: "center", 
    marginTop: 18, 
    marginBottom: 18 
  },
  logoImage: {
    width: 120,
    height: 120,
    marginBottom: 14,
  },

  brand: { 
    fontSize: 26, 
    fontWeight: "800", 
    color: "#111827",
  },
  title: { 
    fontSize: 18, 
    fontWeight: "800", 
    color: "#111827", 
    marginTop: 6 
  },
  subtitle: {
    marginTop: 6,
    textAlign: "center",
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 13,
    maxWidth: 340,
    lineHeight: 18,
  },

  grid: { gap: 12, marginTop: 12 },
  choiceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  choicePressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  choiceTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  choiceSub: { 
    marginTop: 4, 
    fontSize: 12, 
    fontWeight: "700", 
    color: "#6B7280", 
    lineHeight: 18 
  },

  choiceActionRow: {
    marginTop: 14,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  choiceActionText: { color: "#2563EB", fontWeight: "900", fontSize: 13 },

  footer: { 
    marginTop: "auto", 
    alignItems: "center", 
    paddingBottom: 18 
  },
  footerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(22, 163, 74, 0.10)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  footerDot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: "#16A34A" 
  },
  footerText: { 
    color: "#16A34A", 
    fontWeight: "800", 
    fontSize: 12 
  },
});