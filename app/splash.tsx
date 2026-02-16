import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Image, Platform, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

// Import your logo image
import logoImage from "../assets/images/logo.png";

export default function Splash() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Responsive sizes based on screen width
  const isDesktop = width >= 1024;
  const isTablet = width >= 768 && width < 1024;
  const logoSize = isDesktop ? 160 : isTablet ? 130 : 100;
  const fontSize = isDesktop ? 52 : isTablet ? 44 : 36;
  const loaderWidth = isDesktop ? "60%" : isTablet ? "70%" : "80%";

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
      <View style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
        {/* Decorative Background - Enhanced for desktop */}
        <View style={styles.backgroundDecor}>
          <View style={[styles.bgCircle1, isDesktop && styles.bgCircle1Desktop]} />
          <View style={[styles.bgCircle2, isDesktop && styles.bgCircle2Desktop]} />
          <View style={[styles.bgCircle3, isDesktop && styles.bgCircle3Desktop]} />
          <View style={[styles.bgCircle4, isDesktop && styles.bgCircle4Desktop]} />

          {/* Additional decorative elements for desktop */}
          {isDesktop && (
            <>
              <View style={styles.bgCircle5} />
              <View style={styles.bgGrid} />
            </>
          )}
        </View>

        {/* Logo Section */}
        <Animated.View
          style={[
            styles.logoSection,
            isDesktop && styles.logoSectionDesktop,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.logoContainer,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={[
              styles.logoWrapper,
              {
                width: logoSize,
                height: logoSize,
                shadowOpacity: isDesktop ? 0.35 : 0.25,
                shadowRadius: isDesktop ? 30 : 20,
              }
            ]}>
              <Image
                source={logoImage}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          <View style={styles.brandContainer}>
            <Text style={[styles.logo, { fontSize }]}>Roomio</Text>
            <View style={[styles.badge, isDesktop && styles.badgeDesktop]}>
              <Ionicons name="shield-checkmark" size={isDesktop ? 18 : 14} color="#2563EB" />
              <Text style={[styles.badgeText, isDesktop && styles.badgeTextDesktop]}>
                SERVICE MANAGEMENT
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Progress Section */}
        <Animated.View style={[
          styles.progressSection,
          { opacity: fadeAnim },
          isDesktop && styles.progressSectionDesktop
        ]}>
          <View style={[styles.loader, { width: loaderWidth }]}>
            <Animated.View
              style={[styles.loaderFill, { width: widthInterpolated }]}
            >
              <View style={styles.loaderGlow} />
            </Animated.View>
          </View>

          <View style={styles.loadingContainer}>
            <View style={styles.loadingDots}>
              {[0, 1, 2].map((i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.dot,
                    isDesktop && styles.dotDesktop,
                    {
                      opacity: progress.interpolate({
                        inputRange: [0, 0.33, 0.66, 1],
                        outputRange: i === 0 ? [0.3, 1, 0.3, 1] :
                          i === 1 ? [0.3, 0.3, 1, 0.3] :
                            [0.3, 1, 0.3, 1],
                      }),
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.loading, isDesktop && styles.loadingDesktop]}>
              Initializing System
            </Text>
          </View>
        </Animated.View>

        {/* Footer */}
        <Animated.View style={[
          styles.footer,
          { opacity: fadeAnim },
          isDesktop && styles.footerDesktop
        ]}>
          <View style={[styles.statusContainer, isDesktop && styles.statusContainerDesktop]}>
            <View style={[styles.statusDot, isDesktop && styles.statusDotDesktop]} />
            <Text style={[styles.statusText, isDesktop && styles.statusTextDesktop]}>
              Secure Connection
            </Text>
          </View>
          <View style={styles.versionContainer}>
            <Text style={[styles.versionText, isDesktop && styles.versionTextDesktop]}>
              VERSION 2.4.0
            </Text>
            <View style={[styles.versionDivider, isDesktop && styles.versionDividerDesktop]} />
            <Text style={[styles.versionText, isDesktop && styles.versionTextDesktop]}>
              BUILD 902
            </Text>
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
  webContainer: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
  },
  backgroundDecor: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
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
    width: 400,
    height: 400,
    borderRadius: 200,
    top: -150,
    right: -120,
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
    width: 300,
    height: 300,
    borderRadius: 150,
    left: -150,
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
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: -100,
    right: -80,
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
    width: 250,
    height: 250,
    borderRadius: 125,
    left: -120,
  },
  bgCircle5: {
    position: "absolute",
    top: "20%",
    right: "15%",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(37, 99, 235, 0.03)",
  },
  bgGrid: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'radial-gradient(circle at 25px 25px, rgba(37, 99, 235, 0.03) 2px, transparent 2px)',
    backgroundSize: '50px 50px',
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 80,
  },
  logoSectionDesktop: {
    marginBottom: 100,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoWrapper: {
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 8 },
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
  badgeDesktop: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
  },
  badgeText: {
    fontSize: 11,
    color: "#2563EB",
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  badgeTextDesktop: {
    fontSize: 13,
    letterSpacing: 2,
  },
  progressSection: {
    width: "100%",
    alignItems: "center",
  },
  progressSectionDesktop: {
    marginTop: 20,
  },
  loader: {
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
    marginTop: 24,
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
  dotDesktop: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  loading: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  loadingDesktop: {
    fontSize: 16,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    alignItems: "center",
  },
  footerDesktop: {
    bottom: 60,
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
  statusContainerDesktop: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 15,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },
  statusDotDesktop: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "600",
  },
  statusTextDesktop: {
    fontSize: 14,
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
  versionDividerDesktop: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  versionText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  versionTextDesktop: {
    fontSize: 13,
  },
});