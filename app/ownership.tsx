import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useTheme } from "../context/ThemeContext";
const logoImage = require("../assets/images/logo.png");
import { Image } from "react-native";

export default function Ownership() {
  const router = useRouter();
  const auth = getAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // protect this page
    if (!auth.currentUser) {
      router.replace("/admin-login");
    }

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [auth, router]);

  const colors = {
    background: isDark ? "#0F172A" : "#F8FAFC",
    card: isDark ? "#1E293B" : "#FFFFFF",
    textPrimary: isDark ? "#F8FAFC" : "#1E293B",
    textSecondary: isDark ? "#94A3B8" : "#64748B",
    accent: "#3B82F6",
    success: "#22C55E",
    border: isDark ? "#334155" : "#E2E8F0",
    headerBg: isDark ? "#1E293B" : "#FFFFFF",
    navItemBg: isDark ? "#334155" : "#F1F5F9",
  };

  const PropertyCard = ({
    title,
    description,
    icon,
    isAvailable,
    onPress
  }: {
    title: string;
    description: string;
    icon: any;
    isAvailable: boolean;
    onPress?: () => void
  }) => (
    <Pressable
      onPress={isAvailable ? onPress : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: isAvailable ? (pressed ? 0.95 : 1) : 1,
          transform: [{ scale: isAvailable && Platform.OS !== "web" ? (pressed ? 0.98 : 1) : 1 }]
        },
        !isAvailable && styles.cardDisabled
      ]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconBg, { backgroundColor: isAvailable ? colors.accent + "15" : colors.navItemBg }]}>
          <Ionicons name={icon} size={28} color={isAvailable ? colors.accent : colors.textSecondary} />
        </View>
        {!isAvailable && (
          <View style={[styles.badge, { backgroundColor: isDark ? "#334155" : "#F1F5F9" }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>Coming Soon</Text>
          </View>
        )}
      </View>

      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{description}</Text>

      <View style={styles.actionArea}>
        {isAvailable ? (
          <View style={[styles.activeButton, { backgroundColor: colors.accent }]}>
            <Text style={styles.activeButtonText}>Open Dashboard</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </View>
        ) : (
          <View style={[styles.disabledButton, { backgroundColor: isDark ? "#334155" : "#F1F5F9" }]}>
            <Text style={[styles.disabledButtonText, { color: colors.textSecondary }]}>Notify Me</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      {/* Top Header Pill */}
      <View style={styles.topHeader}>
        <View style={[styles.logoPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Image source={logoImage} style={styles.logoImagePill} resizeMode="contain" />
          <Text style={[styles.brandText, { color: colors.textPrimary }]}>Roomio</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.contentWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          <View style={styles.headerSection}>
            <Text style={[styles.mainTitle, { color: colors.textPrimary }]}>Select Property Type</Text>
            <Text style={[styles.mainSubtitle, { color: colors.textSecondary }]}>
              Currently supported: <Text style={{ color: colors.accent, fontWeight: "700" }}>Hotel dashboard</Text>
            </Text>
          </View>

          <View style={styles.grid}>
            <PropertyCard
              title="Hotel"
              description="Manage bookings, guests, and daily operations seamlessly with our integrated hotel management suite."
              icon="bed-outline"
              isAvailable={true}
              onPress={() => router.replace("/(tabs)/dashboard")}
            />

            <View style={styles.row}>
              <View style={styles.half}>
                <PropertyCard
                  title="Villas"
                  description="Specialized tools for short-term rentals and private villa management."
                  icon="home-outline"
                  isAvailable={false}
                />
              </View>
              <View style={styles.half}>
                <PropertyCard
                  title="PGs"
                  description="Complete management system for paying guest accommodations and hostels."
                  icon="people-outline"
                  isAvailable={false}
                />
              </View>
            </View>
          </View>

        </Animated.View>
      </ScrollView>

      {/* Footer Bar */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.footerLeft}>
          <Ionicons name="shield-checkmark" size={14} color={colors.success} />
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>Secure Admin Session</Text>
        </View>
        <View style={styles.footerRight}>
          <Text style={[styles.footerLink, { color: colors.textSecondary }]}>Documentation</Text>
          <Text style={[styles.footerLink, { color: colors.textSecondary }]}>Support</Text>
          <Text style={[styles.versionText, { color: colors.textSecondary }]}>v2.4.0-stable</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  logoPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  logoImagePill: {
    width: 24,
    height: 24,
  },
  brandText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    flexGrow: 1,
  },
  contentWrapper: {
    maxWidth: 800,
    width: "100%",
    alignSelf: "center",
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 48,
  },
  mainTitle: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
    textAlign: "center",
  },
  mainSubtitle: {
    fontSize: 16,
    marginTop: 12,
    textAlign: "center",
    fontWeight: "500",
  },
  grid: {
    gap: 20,
  },
  row: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: 20,
  },
  half: {
    flex: 1,
  },
  card: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    justifyContent: "space-between",
    minHeight: 220,
  },
  cardDisabled: {
    borderStyle: "dashed",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  iconBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    marginBottom: 24,
  },
  actionArea: {
    marginTop: "auto",
  },
  activeButton: {
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  activeButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  footer: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 11,
    fontWeight: "600",
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  footerLink: {
    fontSize: 11,
    fontWeight: "600",
  },
  versionText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  }
});