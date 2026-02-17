import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Image, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

// Import your logo image
import logoImage from "../assets/images/logo.png";

export default function Splash() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Determine if the device is a desktop/tablet (width > 600) for responsive scaling
  const isDesktop = width > 600;

  // Responsive values
  const logoSize = isDesktop ? 160 : 100;
  const fontSizeTitle = isDesktop ? 48 : 36;
  const fontSizeBadge = isDesktop ? 13 : 11;
  const fontSizeLoading = isDesktop ? 16 : 14;
  const spacingMultiplier = isDesktop ? 1.5 : 1;

  const progress = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fade in and scale animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Progress bar animation
    Animated.timing(progress, {
      toValue: 1,
      duration: 2200,
      useNativeDriver: false,
    }).start(() => {
      router.replace("/home");
    });
  }, []);

  const widthInterpolated = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Decorative Background - Responsive scaling */}
        <View style={styles.backgroundDecor}>
          <View style={[styles.bgCircle1, isDesktop && styles.bgCircle1Desktop]} />
          <View style={[styles.bgCircle2, isDesktop && styles.bgCircle2Desktop]} />
          <View style={[styles.bgCircle3, isDesktop && styles.bgCircle3Desktop]} />
          <View style={[styles.bgCircle4, isDesktop && styles.bgCircle4Desktop]} />
        </View>

        {/* Logo Section */}
        <Animated.View
          style={[
            styles.logoSection,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
              marginBottom: 80 * spacingMultiplier,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.logoContainer,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={[styles.logoWrapper, { width: logoSize, height: logoSize }]}>
              <Image
                source={logoImage}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          <View style={styles.brandContainer}>
            <Text style={[styles.logo, { fontSize: fontSizeTitle }]}>Roomio</Text>
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark" size={isDesktop ? 18 : 14} color="#2563EB" />
              <Text style={[styles.badgeText, { fontSize: fontSizeBadge }]}>SERVICE MANAGEMENT</Text>
            </View>
          </View>
        </Animated.View>

        {/* Progress Section */}
        <Animated.View style={[styles.progressSection, { opacity: fadeAnim }]}>
          <View style={[styles.loader, isDesktop && styles.loaderDesktop]}>
            <Animated.View
              style={[styles.loaderFill, { width: widthInterpolated }]}
            >
              <View style={styles.loaderGlow} />
            </Animated.View>
          </View>

          <View style={[styles.loadingContainer, { marginTop: 24 * spacingMultiplier }]}>
            <View style={styles.loadingDots}>
              <Animated.View
                style={[
                  styles.dot,
                  {
                    opacity: progress.interpolate({
                      inputRange: [0, 0.33, 0.66, 1],
                      outputRange: [0.3, 1, 0.3, 1],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.dot,
                  {
                    opacity: progress.interpolate({
                      inputRange: [0, 0.33, 0.66, 1],
                      outputRange: [0.3, 0.3, 1, 0.3],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.dot,
                  {
                    opacity: progress.interpolate({
                      inputRange: [0, 0.33, 0.66, 1],
                      outputRange: [0.3, 1, 0.3, 1],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={[styles.loading, { fontSize: fontSizeLoading }]}>Initializing System</Text>
          </View>
        </Animated.View>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          <View style={styles.statusContainer}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Secure Connection</Text>
          </View>
          <View style={styles.versionContainer}>
            <Text style={styles.versionText}>VERSION 2.4.0</Text>
            <View style={styles.versionDivider} />
            <Text style={styles.versionText}>BUILD 902</Text>
          </View>
        </Animated.View>
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
    overflow: 'hidden', // Keeps circles inside on mobile
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
  bgCircle1Desktop: {
    top: -150,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
  },
  bgCircle2: {
    position: "absolute",
    top: "40%",
    left: -120,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
  },
  bgCircle2Desktop: {
    left: -150,
    width: 350,
    height: 350,
    borderRadius: 175,
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
  bgCircle3Desktop: {
    bottom: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  bgCircle4: {
    position: "absolute",
    bottom: "30%",
    left: -80,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
  },
  bgCircle4Desktop: {
    bottom: "20%",
    left: -120,
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  logoSection: {
    alignItems: "center",
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoWrapper: {
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  brandContainer: {
    alignItems: "center",
  },
  logo: {
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 1,
    marginBottom: 12,
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
    color: "#2563EB",
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  progressSection: {
    width: "100%",
    alignItems: "center",
  },
  loader: {
    width: "80%",
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 100,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  loaderDesktop: {
    height: 10,
    maxWidth: 500, // Prevents bar from being too wide on large monitors
  },
  loaderFill: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 100,
    position: "relative",
  },
  loaderGlow: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 20,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 100,
  },
  loadingContainer: {
    alignItems: "center",
  },
  loadingDots: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563EB",
  },
  loading: {
    color: "#6B7280",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    alignItems: "center",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    marginBottom: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },
  statusText: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "600",
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