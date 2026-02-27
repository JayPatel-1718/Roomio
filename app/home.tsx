import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image, Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View, Platform } from "react-native";
import { useTheme } from "../context/ThemeContext";

// Import your logo image
import logoImage from "../assets/images/logo.png";

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { theme: currentTheme } = useTheme();
  const isDark = currentTheme === "dark";

  // Determine if the device is a desktop/tablet (width > 768) for responsive scaling
  const isDesktop = width > 768;

  // Responsive values
  const logoSize = isDesktop ? 42 : 32;
  const fontSizeTitle = isDesktop ? 56 : 42;
  const fontSizeSubtitle = isDesktop ? 18 : 16;
  const buttonMaxWidth = isDesktop ? 220 : 180;

  const themeColors = {
    background: isDark ? '#05070A' : '#F8FAFC',
    textPrimary: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? '#94A3B8' : '#64748B',
    textMuted: isDark ? '#475569' : '#94A3B8',
    accent: '#3B82F6',
    cardBg: isDark ? '#0F172A' : '#FFFFFF',
    cardBorder: isDark ? '#1E293B' : '#F1F5F9',
    badgeBg: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
    footerDot: isDark ? '#10B981' : '#10B981',
  };

  const features = [
    {
      title: "Smart Booking",
      desc: isDark ? "Automated engine for seamless stays" : "Real-time engine",
      icon: isDark ? "calendar" : "calendar-outline",
    },
    {
      title: "Guest Analytics",
      desc: isDark ? "Deep behavioral data & insights" : "Behavioral insights",
      icon: isDark ? "trending-up" : "stats-chart-outline",
    },
    {
      title: "Staff Coordination",
      desc: isDark ? "Real-time team workflows & tasks" : "Unified workflows",
      icon: isDark ? "people" : "people-outline",
    }
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
      <View style={styles.container}>
        {/* Background Decor */}
        <View style={styles.backgroundDecor}>
          <View style={[styles.bgCircleTop, {
            backgroundColor: isDark ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.03)',
            top: -200, right: -150, width: 600, height: 600
          }]} />
          {!isDark && (
            <View style={[styles.bgCircleBottom, {
              backgroundColor: 'rgba(59,130,246,0.02)',
              bottom: -150, left: -200, width: 700, height: 700
            }]} />
          )}
        </View>

        {/* Header Branding */}
        <View style={styles.header}>
          <Image source={logoImage} style={{ width: logoSize, height: logoSize }} resizeMode="contain" />
          <Text style={[styles.brandName, { color: themeColors.textPrimary }]}>Roomio</Text>
        </View>

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Badge */}
          <View style={[styles.badge, { backgroundColor: themeColors.badgeBg }]}>
            <Text style={[styles.badgeText, { color: themeColors.accent }]}>
              {isDark ? '2026 PREMIUM SAAS EDITION' : '2026 PREMIUM SAAS EDITION'}
            </Text>
          </View>

          {/* Hero Section */}
          <Text style={[styles.heroHeading, { color: themeColors.textPrimary, fontSize: fontSizeTitle }]}>
            Complete hotel management solution
          </Text>
          <Text style={[styles.heroSubtext, { color: themeColors.textSecondary, fontSize: fontSizeSubtitle }]}>
            {isDark
              ? "Elevate your hospitality experience with a streamlined, intelligent platform built for the next generation of hosts."
              : "The all-in-one platform for modern hospitality teams.\nExperience seamless control and elevated guest experiences."
            }
          </Text>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              { backgroundColor: themeColors.accent },
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
            ]}
            onPress={() => router.push("/admin-login")}
          >
            <Text style={styles.ctaText}>Access Dashboard</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFF" />
          </Pressable>
        </View>

        {/* Features Row */}
        <View style={[styles.featuresRow, isDesktop && styles.featuresRowDesktop]}>
          {features.map((item, idx) => (
            <View key={idx} style={[styles.featureCard, {
              backgroundColor: themeColors.cardBg,
              borderColor: themeColors.cardBorder,
              width: isDesktop ? 220 : '100%'
            }]}>
              <View style={[styles.featureIconContainer, { backgroundColor: themeColors.badgeBg }]}>
                <Ionicons name={item.icon as any} size={20} color={themeColors.accent} />
              </View>
              <Text style={[styles.featureTitle, { color: themeColors.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.featureDesc, { color: themeColors.textMuted }]}>{item.desc}</Text>
            </View>
          ))}
        </View>

        {/* Footer info */}
        <View style={styles.footer}>
          {isDark ? (
            <View style={styles.footerRow}>
              <View style={[styles.dot, { backgroundColor: themeColors.footerDot }]} />
              <Text style={[styles.footerText, { color: themeColors.textMuted }]}>
                TRUSTED BY 500+ PREMIUM HOTELS WORLDWIDE
              </Text>
            </View>
          ) : (
            <Text style={[styles.footerText, { color: themeColors.textMuted, fontSize: 10, letterSpacing: 1 }]}>
              ROOMIO © 2026 · PREMIUM CLOUD INFRASTRUCTURE
            </Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  backgroundDecor: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: -1,
  },
  bgCircleTop: {
    position: 'absolute',
    borderRadius: 300,
  },
  bgCircleBottom: {
    position: 'absolute',
    borderRadius: 350,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'absolute',
    top: 60,
  },
  brandName: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  mainContent: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 60,
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroHeading: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -1.5,
    lineHeight: 52,
    marginBottom: 20,
    maxWidth: 800,
  },
  heroSubtext: {
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 600,
    marginBottom: 32,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 40,
    ...Platform.select({
      ios: { shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 8 },
      web: { boxShadow: '0 8px 16px rgba(59, 130, 246, 0.3)' }
    })
  },
  ctaText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  featuresRow: {
    flexDirection: 'column',
    gap: 16,
    width: '100%',
    alignItems: 'center',
  },
  featuresRowDesktop: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  featureCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  featureDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    bottom: 50,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  footerText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  }
});
