import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Platform,
  StatusBar,
} from "react-native";

// Import your logo image
import logoImage from "../assets/images/logo.png";

export default function Splash() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  // Determine responsive breakpoints for optimal scaling across all devices
  const isDesktop = width > 1024;
  const isTablet = width > 600 && width <= 1024;
  const isMobile = width <= 600;

  // Responsive scaling values - refined for better visual balance
  const logoSize = isDesktop ? 180 : isTablet ? 140 : 110;
  const fontSizeTitle = isDesktop ? 52 : isTablet ? 44 : 38;
  const fontSizeBadge = isDesktop ? 14 : isTablet ? 13 : 12;
  const fontSizeLoading = isDesktop ? 17 : isTablet ? 15 : 14;
  const spacingMultiplier = isDesktop ? 1.8 : isTablet ? 1.4 : 1;
  const progressWidth = isDesktop ? "60%" : isTablet ? "70%" : "85%";
  const progressHeight = isDesktop ? 10 : isTablet ? 9 : 8;

  const progress = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fade in and scale animation - smoother entry
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous subtle pulse animation for logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Progress bar animation
    Animated.timing(progress, {
      toValue: 1,
      duration: 2400,
      useNativeDriver: false,
    }).start(() => {
      router.replace("/home");
    });

    // Web-specific: inject enhanced CSS for hover/transition effects
    if (Platform.OS === "web") {
      const style = document.createElement("style");
      style.textContent = `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .splash-container {
          transition: transform 0.2s ease;
        }
        .splash-container:hover {
          transform: scale(1.002);
        }
        .progress-track {
          transition: box-shadow 0.3s ease;
        }
        .progress-track:hover {
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08) !important;
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, []);

  const widthInterpolated = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const glowOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.8, 0.3],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={[styles.container, Platform.OS === "web" && "splash-container"]}>
        {/* Decorative Background - Enhanced responsive scaling */}
        <View style={styles.backgroundDecor}>
          <View style={[
            styles.bgCircle1,
            isDesktop && styles.bgCircle1Desktop,
            isTablet && styles.bgCircle1Tablet,
          ]} />
          <View style={[
            styles.bgCircle2,
            isDesktop && styles.bgCircle2Desktop,
            isTablet && styles.bgCircle2Tablet,
          ]} />
          <View style={[
            styles.bgCircle3,
            isDesktop && styles.bgCircle3Desktop,
            isTablet && styles.bgCircle3Tablet,
          ]} />
          <View style={[
            styles.bgCircle4,
            isDesktop && styles.bgCircle4Desktop,
            isTablet && styles.bgCircle4Tablet,
          ]} />
          <View style={styles.bgGradient} />
        </View>

        {/* Logo Section - Enhanced animations and spacing */}
        <Animated.View
          style={[
            styles.logoSection,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
              marginBottom: 90 * spacingMultiplier,
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
                borderRadius: logoSize / 2,
              }
            ]}>
              {/* Enhanced glow effect behind logo */}
              <View style={[
                styles.logoGlow,
                {
                  width: logoSize * 1.4,
                  height: logoSize * 1.4,
                  borderRadius: (logoSize * 1.4) / 2,
                }
              ]} />
              <Image
                source={logoImage}
                style={styles.logoImage}
                resizeMode="contain"
              />
              {/* Subtle shine overlay */}
              <View style={styles.logoShine} />
            </View>
          </Animated.View>

          <View style={styles.brandContainer}>
            <Text style={[
              styles.logo,
              {
                fontSize: fontSizeTitle,
                lineHeight: fontSizeTitle * 1.2,
              }
            ]}>Roomio</Text>
            <View style={styles.badge}>
              <Ionicons
                name="shield-checkmark"
                size={isDesktop ? 20 : isTablet ? 17 : 15}
                color="#2563EB"
              />
              <Text style={[
                styles.badgeText,
                { fontSize: fontSizeBadge }
              ]}>SERVICE MANAGEMENT</Text>
            </View>
          </View>
        </Animated.View>

        {/* Progress Section - Enhanced visual feedback */}
        <Animated.View style={[
          styles.progressSection,
          { opacity: fadeAnim },
          { width: progressWidth }
        ]}>
          <View style={[
            styles.loader,
            Platform.OS === "web" && "progress-track",
            { height: progressHeight },
            isDesktop && styles.loaderDesktop,
          ]}>
            <Animated.View
              style={[
                styles.loaderFill,
                {
                  width: widthInterpolated,
                  height: progressHeight,
                },
              ]}
            >
              {/* Animated glow at the leading edge */}
              <Animated.View
                style={[
                  styles.loaderGlow,
                  {
                    opacity: glowOpacity,
                    height: progressHeight,
                  },
                ]}
              />
              {/* Subtle shine effect */}
              <View style={styles.loaderShine} />
            </Animated.View>
          </View>

          <View style={[
            styles.loadingContainer,
            { marginTop: 28 * spacingMultiplier }
          ]}>
            <View style={styles.loadingDots}>
              {[0, 1, 2].map((index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.dot,
                    {
                      opacity: progress.interpolate({
                        inputRange: [0, 0.33, 0.66, 1],
                        outputRange: index === 1
                          ? [0.4, 1, 0.4, 1]
                          : index === 0
                            ? [0.4, 0.4, 1, 0.4]
                            : [1, 0.4, 0.4, 1],
                      }),
                      transform: [{
                        scale: progress.interpolate({
                          inputRange: [0, 0.33, 0.66, 1],
                          outputRange: index === 1
                            ? [1, 1.3, 1, 1.3]
                            : [1, 1, 1, 1],
                        }),
                      }],
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[
              styles.loading,
              {
                fontSize: fontSizeLoading,
                lineHeight: fontSizeLoading * 1.4,
              }
            ]}>Initializing System</Text>
          </View>
        </Animated.View>

        {/* Footer - Better positioning across screen sizes */}
        <Animated.View style={[
          styles.footer,
          { opacity: fadeAnim },
          isDesktop && styles.footerDesktop,
          { bottom: Math.min(40, height * 0.05) }
        ]}>
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

// ✨ Enhanced Styles - Optimized for all platforms
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
    overflow: "hidden",
    pointerEvents: "none",
  },
  bgGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "linear-gradient(180deg, rgba(37,99,235,0.02) 0%, transparent 70%)",
  },
  bgCircle1: {
    position: "absolute",
    top: -120,
    right: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(37, 99, 235, 0.07)",
  },
  bgCircle1Tablet: {
    top: -140,
    right: -120,
    width: 340,
    height: 340,
    borderRadius: 170,
  },
  bgCircle1Desktop: {
    top: -180,
    right: -140,
    width: 450,
    height: 450,
    borderRadius: 225,
  },
  bgCircle2: {
    position: "absolute",
    top: "45%",
    left: -140,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(37, 99, 235, 0.05)",
  },
  bgCircle2Tablet: {
    left: -170,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  bgCircle2Desktop: {
    left: -200,
    width: 380,
    height: 380,
    borderRadius: 190,
  },
  bgCircle3: {
    position: "absolute",
    bottom: -80,
    right: -70,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
  },
  bgCircle3Tablet: {
    bottom: -100,
    right: -90,
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  bgCircle3Desktop: {
    bottom: -130,
    right: -120,
    width: 340,
    height: 340,
    borderRadius: 170,
  },
  bgCircle4: {
    position: "absolute",
    bottom: "25%",
    left: -100,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(37, 99, 235, 0.03)",
  },
  bgCircle4Tablet: {
    bottom: "20%",
    left: -130,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  bgCircle4Desktop: {
    bottom: "15%",
    left: -170,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  logoSection: {
    alignItems: "center",
    zIndex: 1,
  },
  logoContainer: {
    marginBottom: 28,
    alignItems: "center",
  },
  logoWrapper: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 16,
    position: "relative",
    overflow: "hidden",
  },
  logoGlow: {
    position: "absolute",
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    zIndex: 0,
  },
  logoImage: {
    width: "85%",
    height: "85%",
    zIndex: 2,
  },
  logoShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%, rgba(255,255,255,0.1) 100%)",
    zIndex: 1,
    pointerEvents: "none",
  },
  brandContainer: {
    alignItems: "center",
  },
  logo: {
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.5,
    marginBottom: 14,
    textAlign: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 22,
    gap: 7,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.18)",
  },
  badgeText: {
    color: "#2563EB",
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  progressSection: {
    alignItems: "center",
    zIndex: 1,
  },
  loader: {
    width: "100%",
    backgroundColor: "#E5E7EB",
    borderRadius: 100,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    position: "relative",
  },
  loaderDesktop: {
    maxWidth: 550,
  },
  loaderFill: {
    backgroundColor: "#2563EB",
    borderRadius: 100,
    position: "relative",
    overflow: "hidden",
  },
  loaderGlow: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 30,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 100,
  },
  loaderShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
    animationName: "shimmer",
    animationDuration: "1.8s",
    animationIterationCount: "infinite",
  },
  loadingContainer: {
    alignItems: "center",
  },
  loadingDots: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#2563EB",
  },
  loading: {
    color: "#6B7280",
    fontWeight: "700",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 24,
    zIndex: 1,
  },
  footerDesktop: {
    bottom: 50,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    gap: 9,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.18)",
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  statusText: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  versionContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
    fontWeight: "600",
    letterSpacing: 0.8,
  },
});