import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import {
  Alert, Animated, Image, Platform, Pressable,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View
} from "react-native";
import logoImage from "../assets/images/logo.png";
import { auth } from "../firebase/firebaseConfig";
import { userHasRooms } from "../utils/setupRooms";

const SAVED_EMAIL_KEY = "roomio_saved_admin_email";
const SAVED_PASS_KEY = "roomio_saved_admin_password";
const LOGIN_COUNTS_KEY = "roomio_admin_login_counts";
const SHOW_SAVED_AFTER = 3;

export default function AdminLogin() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isFocused, setIsFocused] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });

  // Saved account UI state
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [savedLoginCount, setSavedLoginCount] = useState(0);
  const [showSavedChoice, setShowSavedChoice] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Load saved account + count on startup
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    const loadSaved = async () => {
      try {
        let se: string | null = null;
        let sp: string | null = null;

        if (Platform.OS !== "web") {
          se = await SecureStore.getItemAsync(SAVED_EMAIL_KEY);
          sp = await SecureStore.getItemAsync(SAVED_PASS_KEY);
        }

        setSavedEmail(se);
        setSavedPassword(sp);

        if (se) {
          const raw = await AsyncStorage.getItem(LOGIN_COUNTS_KEY);
          const counts = raw ? JSON.parse(raw) : {};
          const countForEmail = counts?.[se] ?? 0;
          setSavedLoginCount(countForEmail);

          if (countForEmail >= SHOW_SAVED_AFTER && sp) {
            setShowSavedChoice(true);
          }
        }
      } catch (e) {
        console.log("Failed to load saved account:", e);
      }
    };

    loadSaved();
  }, []);

  const animateSuccess = () => {
    setSuccess(true);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();

    setTimeout(async () => {
      // Check if onboarding is needed
      const hasRooms = await userHasRooms();
      if (!hasRooms) {
        router.replace("/onboarding");
      } else {
        router.replace("/ownership");
      }
    }, 1200);
  };

  const bumpLoginCount = async (emailAddr: string) => {
    try {
      const raw = await AsyncStorage.getItem(LOGIN_COUNTS_KEY);
      const counts = raw ? JSON.parse(raw) : {};
      counts[emailAddr] = (counts[emailAddr] ?? 0) + 1;
      await AsyncStorage.setItem(LOGIN_COUNTS_KEY, JSON.stringify(counts));
      setSavedLoginCount(counts[emailAddr]);
    } catch (e) {
      console.log("Failed to update login count:", e);
    }
  };

  const saveCredentials = async (emailAddr: string, pass: string) => {
    try {
      if (Platform.OS !== "web") {
        await SecureStore.setItemAsync(SAVED_EMAIL_KEY, emailAddr);
        await SecureStore.setItemAsync(SAVED_PASS_KEY, pass);
      }
      setSavedEmail(emailAddr);
      setSavedPassword(pass);
    } catch (e) {
      console.log("Failed to save credentials:", e);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      await saveCredentials(email.trim(), password);
      await bumpLoginCount(email.trim());
      animateSuccess();
    } catch (error: any) {
      console.error("Login Error:", error);
      Alert.alert("Login Failed", error.message || "Invalid admin credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleContinueSaved = async () => {
    if (!savedEmail || !savedPassword) {
      Alert.alert("Not Available", "No saved account found.");
      setShowSavedChoice(false);
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, savedEmail, savedPassword);
      await bumpLoginCount(savedEmail);
      setSavedEmail(savedEmail);

      const hasRooms = await userHasRooms();
      if (!hasRooms) {
        router.replace("/onboarding");
      } else {
        router.replace("/ownership");
      }
    } catch (e: any) {
      console.error("Continue Auth Error:", e);
      Alert.alert("Continue Failed", e.message || "Saved login failed. Please login manually again.");
      setShowSavedChoice(false);
      setEmail(savedEmail);
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  // ✨ Success Screen
  if (success) {
    return (
      <SafeAreaView style={styles.successContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        <View style={styles.successBackground}>
          <View style={styles.successCircle1} />
          <View style={styles.successCircle2} />
          <View style={styles.successCircle3} />
        </View>
        <Animated.View
          style={[
            styles.successIconContainer,
            { transform: [{ scale: scaleAnim }], opacity: fadeAnim },
          ]}
        >
          <View style={styles.successIconBg}>
            <Animated.View style={styles.successPulse} />
            <Ionicons name="checkmark-circle" size={80} color="#16A34A" />
          </View>
        </Animated.View>
        <Animated.Text style={[styles.successText, { opacity: fadeAnim }]}>
          Login Successful
        </Animated.Text>
        <Animated.Text style={[styles.successSubtext, { opacity: fadeAnim }]}>
          Redirecting to dashboard...
        </Animated.Text>
      </SafeAreaView>
    );
  }

  // ✨ Saved Account Choice Screen
  if (showSavedChoice && savedEmail) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.backgroundDecor}>
            <View style={styles.bgCircle1} />
            <View style={styles.bgCircle2} />
            <View style={styles.bgCircle3} />
            <View style={styles.bgGradient} />
          </View>

          <Animated.View style={[styles.contentWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <Image source={logoImage} style={styles.logoImage} resizeMode="contain" />
                <View style={styles.logoGlow} />
              </View>
              <Text style={styles.brand}>Roomio</Text>
              <View style={styles.roleBadge}>
                <Ionicons name="shield-checkmark" size={14} color="#2563EB" />
                <Text style={styles.role}>ADMIN PANEL</Text>
              </View>
            </View>

            {/* Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Welcome Back</Text>
                <Text style={styles.cardSubtitle}>
                  Continue with your saved account or use another
                </Text>
              </View>

              <View style={styles.savedAccountBox}>
                <View style={styles.savedRow}>
                  <View style={styles.savedIcon}>
                    <Ionicons name="person-circle" size={28} color="#2563EB" />
                  </View>
                  <View style={styles.savedInfo}>
                    <Text style={styles.savedLabel}>Continue as</Text>
                    <Text style={styles.savedEmail} numberOfLines={1}>
                      {savedEmail}
                    </Text>
                    <View style={styles.savedMeta}>
                      <Ionicons name="time-outline" size={12} color="#9CA3AF" />
                      <Text style={styles.savedHint}>
                        Used {savedLoginCount} {savedLoginCount === 1 ? "time" : "times"} on this device
                      </Text>
                    </View>
                  </View>
                  <View style={styles.savedStatus}>
                    <View style={styles.statusIndicator} />
                    <Text style={styles.statusText}>Verified</Text>
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonPrimary,
                    loading && styles.buttonDisabled,
                    pressed && !loading && styles.buttonPressed,
                    Platform.OS === "web" && styles.buttonHover,
                  ]}
                  onPress={handleContinueSaved}
                  disabled={loading}
                >
                  <View style={styles.buttonContent}>
                    {loading ? (
                      <>
                        <Ionicons name="sync" size={20} color="#FFFFFF" />
                        <Text style={styles.buttonText}>Continuing...</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Continue as Admin</Text>
                        <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                      </>
                    )}
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setShowSavedChoice(false);
                    setEmail(savedEmail);
                    setPassword("");
                  }}
                  style={({ pressed }) => [
                    styles.useAnotherBtn,
                    pressed && styles.useAnotherBtnPressed,
                  ]}
                >
                  <Ionicons name="swap-horizontal" size={16} color="#2563EB" />
                  <Text style={styles.useAnotherText}>Use another account</Text>
                </Pressable>
              </View>
            </View>

            {/* Security Notice */}
            <View style={styles.securityNotice}>
              <View style={styles.securityIcon}>
                <Ionicons name="shield-checkmark" size={14} color="#16A34A" />
              </View>
              <Text style={styles.securityText}>
                Secured with 256-bit encryption • End-to-end protected
              </Text>
            </View>
          </Animated.View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.statusContainer}>
              <View style={styles.statusDot} />
              <Text style={styles.status}>System Operational</Text>
            </View>
            <View style={styles.versionContainer}>
              <Text style={styles.version}>v2.4.0</Text>
              <View style={styles.versionDivider} />
              <Text style={styles.version}>Build 902</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ✨ Normal Login Form
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.backgroundDecor}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <View style={styles.bgCircle3} />
          <View style={styles.bgGradient} />
        </View>

        <Animated.View style={[styles.contentWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image source={logoImage} style={styles.logoImage} resizeMode="contain" />
              <View style={styles.logoGlow} />
            </View>
            <Text style={styles.brand}>Roomio</Text>
            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#2563EB" />
              <Text style={styles.role}>ADMIN PANEL</Text>
            </View>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Welcome Back</Text>
              <Text style={styles.cardSubtitle}>
                Sign in to access the admin dashboard
              </Text>
            </View>

            <View style={styles.formSection}>
              {/* Email Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address</Text>
                <View style={[
                  styles.inputWrapper,
                  isFocused.email && styles.inputFocused,
                ]}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="mail-outline" size={20} color={isFocused.email ? "#2563EB" : "#9CA3AF"} />
                  </View>
                  <TextInput
                    placeholder="admin@roomio.com"
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    onFocus={() => setIsFocused(prev => ({ ...prev, email: true }))}
                    onBlur={() => setIsFocused(prev => ({ ...prev, email: false }))}
                  />
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Password</Text>
                  <Pressable style={styles.forgotLink}>
                    <Text style={styles.forgotText}>Forgot?</Text>
                  </Pressable>
                </View>
                <View style={[
                  styles.inputWrapper,
                  isFocused.password && styles.inputFocused,
                ]}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color={isFocused.password ? "#2563EB" : "#9CA3AF"} />
                  </View>
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    onFocus={() => setIsFocused(prev => ({ ...prev, password: true }))}
                    onBlur={() => setIsFocused(prev => ({ ...prev, password: false }))}
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#6B7280"
                    />
                  </Pressable>
                </View>
              </View>

              {/* Login Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonPrimary,
                  loading && styles.buttonDisabled,
                  pressed && !loading && styles.buttonPressed,
                  Platform.OS === "web" && styles.buttonHover,
                ]}
                onPress={handleLogin}
                disabled={loading}
              >
                <View style={styles.buttonContent}>
                  {loading ? (
                    <>
                      <Ionicons name="sync" size={20} color="#FFFFFF" />
                      <Text style={styles.buttonText}>Signing in...</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Login to Dashboard</Text>
                      <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                    </>
                  )}
                </View>
                <View style={styles.buttonShine} />
              </Pressable>

            </View>
          </View>

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <View style={styles.securityIcon}>
              <Ionicons name="shield-checkmark" size={14} color="#16A34A" />
            </View>
            <Text style={styles.securityText}>
              Secured with 256-bit encryption • End-to-end protected
            </Text>
          </View>
        </Animated.View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.statusContainer}>
            <View style={styles.statusDot} />
            <Text style={styles.status}>System Operational</Text>
          </View>
          <View style={styles.versionContainer}>
            <Text style={styles.version}>v2.4.0</Text>
            <View style={styles.versionDivider} />
            <Text style={styles.version}>Build 902</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ✨ Enhanced Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Platform.OS === "web" ? 24 : 24,
    paddingTop: Platform.OS === "web" ? 32 : 24,
    paddingBottom: 24,
  },
  contentWrapper: {
    flex: 1,
    maxWidth: Platform.OS === "web" ? 480 : undefined,
    width: "100%",
    alignSelf: Platform.OS === "web" ? "center" : "stretch",
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
    height: 300,
    backgroundColor: "linear-gradient(180deg, rgba(37,99,235,0.03) 0%, transparent 100%)",
  },
  bgCircle1: {
    position: "absolute",
    top: -100,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
  },
  bgCircle2: {
    position: "absolute",
    top: 200,
    left: -120,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
  },
  bgCircle3: {
    position: "absolute",
    bottom: 100,
    right: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(37, 99, 235, 0.05)",
  },
  header: {
    alignItems: "center",
    marginTop: Platform.OS === "web" ? 24 : 16,
    marginBottom: 32,
  },
  logoContainer: {
    marginBottom: 16,
    position: "relative",
    width: 88,
    height: 88,
    justifyContent: "center",
    alignItems: "center",
  },
  logoImage: {
    width: "100%",
    height: "100%",
    zIndex: 2,
  },
  logoGlow: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 44,
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    zIndex: 1,
  },
  brand: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.2)",
  },
  role: {
    fontSize: 11,
    color: "#2563EB",
    fontWeight: "800",
    letterSpacing: 2,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 32,
    elevation: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  cardHeader: {
    marginBottom: 28,
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  formSection: {
    gap: 8,
  },
  inputGroup: {
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    letterSpacing: 0.2,
  },
  forgotLink: {
    padding: 4,
  },
  forgotText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "600",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    transitionProperty: "border-color, box-shadow",
    transitionDuration: "150ms",
  },
  inputFocused: {
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  inputIconContainer: {
    width: 52,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  input: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },
  eyeButton: {
    padding: 16,
    paddingHorizontal: 18,
  },
  button: {
    height: 58,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    overflow: "hidden",
    position: "relative",
  },
  buttonPrimary: {
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonPressed: {
    backgroundColor: "#1D4ED8",
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonHover: {
    // Web-only hover handled via Pressable pressed state
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 2,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  buttonShine: {
    position: "absolute",
    top: 0,
    left: "-100%",
    width: "100%",
    height: "100%",
    backgroundColor: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "600",
    paddingHorizontal: 8,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
  quickActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
  },
  quickActionBtnPressed: {
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    transform: [{ scale: 0.98 }],
  },
  quickActionBtnHover: {
    // Web hover enhancement
  },
  quickActionText: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "700",
  },
  securityNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    gap: 8,
    paddingVertical: 12,
  },
  securityIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  securityText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
    lineHeight: 18,
  },
  footer: {
    alignItems: "center",
    marginTop: "auto",
    paddingTop: 24,
    paddingBottom: Platform.OS === "web" ? 32 : 24,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.2)",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  status: {
    fontSize: 13,
    color: "#16A34A",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  versionContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    gap: 10,
  },
  versionDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  version: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
    letterSpacing: 0.8,
  },

  // ✨ Saved Account Screen Styles
  savedAccountBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 20,
    gap: 16,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  savedIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.2)",
  },
  savedInfo: {
    flex: 1,
    gap: 2,
  },
  savedLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  savedEmail: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  savedMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  savedHint: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
  },
  savedStatus: {
    alignItems: "flex-end",
    gap: 4,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#16A34A",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  statusText: {
    fontSize: 11,
    color: "#16A34A",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  useAnotherBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
  },
  useAnotherBtnPressed: {
    opacity: 0.8,
  },
  useAnotherText: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 14,
  },

  // ✨ Success Screen Styles
  successContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  successBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  successCircle1: {
    position: "absolute",
    top: "25%",
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(22, 163, 74, 0.08)",
  },
  successCircle2: {
    position: "absolute",
    bottom: "20%",
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(22, 163, 74, 0.05)",
  },
  successCircle3: {
    position: "absolute",
    top: "60%",
    left: "10%",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(22, 163, 74, 0.06)",
  },
  successIconContainer: {
    marginBottom: 32,
    alignItems: "center",
  },
  successIconBg: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(22, 163, 74, 0.2)",
  },
  successPulse: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 70,
    backgroundColor: "rgba(22, 163, 74, 0.2)",
    animationName: "pulse",
    animationDuration: "2s",
    animationIterationCount: "infinite",
  },
  successText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  successSubtext: {
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "500",
    textAlign: "center",
  },
});

// ✨ Web-specific keyframes for animations (injected via style tag in production)
if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes pulse {
      0% { transform: scale(0.8); opacity: 0.5; }
      50% { transform: scale(1.1); opacity: 0.2; }
      100% { transform: scale(0.8); opacity: 0.5; }
    }
    .button:hover {
      filter: brightness(1.05);
    }
    .input-wrapper:focus-within {
      border-color: #2563EB !important;
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1) !important;
    }
  `;
  document.head.appendChild(style);
}