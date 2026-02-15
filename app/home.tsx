import { View, Text, StyleSheet, Pressable, SafeAreaView, Image } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// Import your logo image
import logoImage from "../assets/images/logo.png";

export default function Home() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Decorative Background */}
        <View style={styles.backgroundDecor}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <View style={styles.bgCircle3} />
          <View style={styles.bgCircle4} />
        </View>

        {/* Logo Container */}
        <View style={styles.logoContainer}>
          <View style={styles.logoWrapper}>
            <Image 
              source={logoImage} 
              style={styles.logoImage} 
              resizeMode="contain"
            />
          </View>
          <View style={styles.brandContainer}>
            <Text style={styles.title}>Roomio</Text>
            <View style={styles.badgeContainer}>
              <View style={styles.badge}>
                <Ionicons name="shield-checkmark" size={14} color="#2563EB" />
                <Text style={styles.badgeText}>SERVICE MANAGEMENT</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.subtitle}>
            Complete hotel management solution
          </Text>
          <Text style={styles.description}>
            Streamline room assignments, guest services, and hotel operations
            all in one powerful platform
          </Text>
        </View>

        {/* Features Grid */}
        <View style={styles.featuresGrid}>
          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="bed-outline" size={20} color="#2563EB" />
            </View>
            <Text style={styles.featureText}>Room Management</Text>
          </View>
          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="person-outline" size={20} color="#2563EB" />
            </View>
            <Text style={styles.featureText}>Guest Services</Text>
          </View>
          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="restaurant-outline" size={20} color="#2563EB" />
            </View>
            <Text style={styles.featureText}>Food Orders</Text>
          </View>
          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="analytics-outline" size={20} color="#2563EB" />
            </View>
            <Text style={styles.featureText}>Analytics</Text>
          </View>
        </View>

        {/* CTA Button */}
        <View style={styles.ctaContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => router.push("/admin-login")}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </View>
          </Pressable>
          <Text style={styles.helperText}>
            Access your admin dashboard
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.versionContainer}>
            <Text style={styles.versionText}>VERSION 2.4.0</Text>
            <View style={styles.versionDivider} />
            <Text style={styles.versionText}>BUILD 902</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  backgroundDecor: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bgCircle1: {
    position: "absolute",
    top: -100,
    right: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  bgCircle2: {
    position: "absolute",
    top: 120,
    left: -120,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
  },
  bgCircle3: {
    position: "absolute",
    bottom: -60,
    right: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(37, 99, 235, 0.05)",
  },
  bgCircle4: {
    position: "absolute",
    bottom: 100,
    left: -80,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoWrapper: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  brandContainer: {
    alignItems: "center",
    marginTop: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 1,
  },
  badgeContainer: {
    marginTop: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  badgeText: {
    fontSize: 11,
    color: "#2563EB",
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  descriptionContainer: {
    alignItems: "center",
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  featureCard: {
    width: "45%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  featureText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  ctaContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    width: "100%",
    maxWidth: 300,
  },
  buttonPressed: {
    backgroundColor: "#1D4ED8",
    transform: [{ scale: 0.98 }],
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 12,
  },
  footer: {
    alignItems: "center",
    position: "absolute",
    bottom: 30,
  },
  versionContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  versionDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  versionText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "500",
    letterSpacing: 0.5,
  },
});