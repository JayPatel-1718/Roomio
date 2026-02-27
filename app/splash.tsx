import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, SafeAreaView, StyleSheet, Text, useWindowDimensions, View, useColorScheme, Platform } from "react-native";
import { auth } from "../firebase/firebaseConfig";

// Import your logo image
import logoImage from "../assets/images/logo.png";

export default function Splash() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const systemColorScheme = useColorScheme();

  // Theme state - Forced to light theme for splash
  const isDark = false;

  const [percent, setPercent] = useState(0);

  // Determine if the device is a desktop/tablet (width > 600) for responsive scaling
  const isDesktop = width > 600;

  // Responsive values
  const logoSize = isDesktop ? 120 : 90;
  const logoCardSize = isDesktop ? 180 : 140;
  const fontSizeTitle = isDesktop ? 52 : 42;
  const fontSizeBadge = isDesktop ? 14 : 12;
  const fontSizeProgress = isDesktop ? 16 : 14;
  const spacingMultiplier = isDesktop ? 1.4 : 1;

  // Theme colors - matching the premium look of the reference images
  const themeColors = {
    background: isDark ? '#05070A' : '#FFFFFF',
    textPrimary: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? '#94A3B8' : '#64748B',
    textMuted: isDark ? '#475569' : '#94A3B8',
    accent: '#3B82F6',
    accentGlow: 'rgba(59, 130, 246, 0.3)',
    loaderBg: isDark ? '#1E293B' : '#F1F5F9',
    cardBg: isDark ? '#0F172A' : '#FFFFFF',
    cardBorder: isDark ? '#1E293B' : '#F1F5F9',
    // Background circles
    circle1: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.05)',
    circle2: isDark ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.03)',
  };

  const progress = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const logoFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Add listener for percentage display
    const listener = progress.addListener(({ value }) => {
      setPercent(Math.floor(value * 100));
    });

    // Start animations
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 40,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(logoFade, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.timing(progress, {
      toValue: 1,
      duration: 3200,
      useNativeDriver: false,
    }).start(() => {
      const user = auth.currentUser;
      if (user) {
        router.replace("/(tabs)/dashboard");
      } else {
        router.replace("/home");
      }
    });

    return () => progress.removeListener(listener);
  }, []);

  const widthInterpolated = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
      <View style={styles.container}>
        {/* Decorative Background */}
        <View style={styles.backgroundDecor}>
          <View style={[styles.bgCircle1, { backgroundColor: themeColors.circle1 }]} />
          <View style={[styles.bgCircle2, { backgroundColor: themeColors.circle2 }]} />
        </View>

        {/* Main Brand Section */}
        <Animated.View
          style={[
            styles.brandSection,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
              marginBottom: 80 * spacingMultiplier,
            },
          ]}
        >
          {/* Detailed Logo Card - Matching the image's centered icon looks */}
          <Animated.View style={[styles.logoCard, {
            backgroundColor: themeColors.cardBg,
            borderColor: themeColors.cardBorder,
            width: logoCardSize,
            height: logoCardSize,
            opacity: logoFade,
          }]}>
            <Image
              source={logoImage}
              style={{ width: logoSize, height: logoSize }}
              resizeMode="contain"
            />
          </Animated.View>

          <Text style={[styles.title, { fontSize: fontSizeTitle, color: themeColors.textPrimary }]}>
            Roomio
          </Text>
          <Text style={[styles.subtitle, { fontSize: fontSizeBadge, color: themeColors.textSecondary }]}>
            SERVICE MANAGEMENT
          </Text>
        </Animated.View>

        {/* Progress & Loading Section */}
        <Animated.View style={[styles.progressContainer, { opacity: fadeAnim }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.preparingText, { color: themeColors.textSecondary, fontSize: fontSizeProgress }]}>
              Preparing your workspace
            </Text>
            <Text style={[styles.percentageText, { color: themeColors.accent, fontSize: fontSizeProgress }]}>
              {percent}%
            </Text>
          </View>

          <View style={[styles.progressBar, { backgroundColor: themeColors.loaderBg }]}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: widthInterpolated, backgroundColor: themeColors.accent }
              ]}
            >
              <View style={styles.progressGlow} />
            </Animated.View>
          </View>

          <View style={styles.loadingInfo}>
            <Text style={[styles.synchronizingText, { color: themeColors.textMuted }]}>
              {percent < 60 ? 'SYNCHRONIZING ASSETS' : 'ENTERPRISE EDITION'}
            </Text>
          </View>
        </Animated.View>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          <Text style={[styles.footerText, { color: themeColors.textMuted }]}>
            {isDark ? 'V2.4.0 \u2022 Enterprise Edition' : 'ENTERPRISE EDITION'}
          </Text>
          <Text style={[styles.buildText, { color: themeColors.textMuted }]}>
            {isDark ? 'BUILD 902' : 'v1.2.0.402'}
          </Text>
        </Animated.View>
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
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
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
  },
  bgCircle2: {
    position: "absolute",
    bottom: -150,
    left: -150,
    width: 500,
    height: 500,
    borderRadius: 250,
  },
  brandSection: {
    alignItems: "center",
  },
  logoCard: {
    borderRadius: 32,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
      }
    }),
  },
  title: {
    fontWeight: "800",
    letterSpacing: -1,
    marginBottom: 8,
  },
  subtitle: {
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  progressContainer: {
    width: "100%",
    maxWidth: 500,
    alignItems: "center",
  },
  progressHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  preparingText: {
    fontWeight: "600",
  },
  percentageText: {
    fontWeight: "800",
    fontVariant: ['tabular-nums'],
  },
  progressBar: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressGlow: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 10,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  loadingInfo: {
    marginTop: 20,
    alignItems: "center",
  },
  synchronizingText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  footer: {
    position: "absolute",
    bottom: 50,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  buildText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    opacity: 0.6,
  },
});