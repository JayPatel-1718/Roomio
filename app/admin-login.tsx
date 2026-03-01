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
const logoImage = require("../assets/images/logo.png");
import { useTheme } from "../context/ThemeContext";
import { auth } from "../firebase/firebaseConfig";
import { userHasRooms } from "../utils/setupRooms";

const SAVED_EMAIL_KEY = "roomio_saved_admin_email";
const SAVED_PASS_KEY = "roomio_saved_admin_password";
const LOGIN_COUNTS_KEY = "roomio_admin_login_counts";
const SHOW_SAVED_AFTER = 3;

export default function AdminLogin() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isFocused, setIsFocused] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });

  // Colors based on theme
  const colors = {
    background: isDark ? "#0F172A" : "#F8FAFC",
    card: isDark ? "#1E293B" : "#FFFFFF",
    textPrimary: isDark ? "#F8FAFC" : "#1E293B",
    textSecondary: isDark ? "#94A3B8" : "#64748B",
    inputBg: isDark ? "#334155" : "#F8FAFC",
    inputBorder: isDark ? "#475569" : "#E2E8F0",
    buttonBg: "#3B82F6",
    buttonText: "#FFFFFF",
    checkboxBorder: isDark ? "#475569" : "#CBD5E1",
    accent: "#3B82F6",
    error: "#EF4444",
    success: "#22C55E",
  };

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
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
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
      const hasRooms = await userHasRooms();
      if (!hasRooms) {
        router.replace("/onboarding");
      } else {
        router.replace("/ownership");
      }
    }, 1200);
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      if (rememberMe) {
        if (Platform.OS !== "web") {
          await SecureStore.setItemAsync(SAVED_EMAIL_KEY, email.trim());
          await SecureStore.setItemAsync(SAVED_PASS_KEY, password);
        }
        setSavedEmail(email.trim());
        setSavedPassword(password);
      }

      const raw = await AsyncStorage.getItem(LOGIN_COUNTS_KEY);
      const counts = raw ? JSON.parse(raw) : {};
      counts[email.trim()] = (counts[email.trim()] ?? 0) + 1;
      await AsyncStorage.setItem(LOGIN_COUNTS_KEY, JSON.stringify(counts));

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
      setShowSavedChoice(false);
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, savedEmail, savedPassword);
      animateSuccess();
    } catch (e: any) {
      console.error("Continue Auth Error:", e);
      Alert.alert("Continue Failed", "Saved login failed. Please login manually again.");
      setShowSavedChoice(false);
      setEmail(savedEmail);
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
        <View style={styles.successContent}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: fadeAnim }}>
            <View style={[styles.successIconWrapper, { backgroundColor: colors.success + "20" }]}>
              <Ionicons name="checkmark-circle" size={80} color={colors.success} />
            </View>
          </Animated.View>
          <Text style={[styles.successText, { color: colors.textPrimary }]}>Login Successful</Text>
          <Text style={[styles.successSubtext, { color: colors.textSecondary }]}>Redirecting to dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.contentWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Top Brand Header */}
          <View style={styles.brandHeader}>
            <View style={styles.logoRow}>
              <Image source={logoImage} style={styles.logoImageBrand} resizeMode="contain" />
              <Text style={[styles.brandName, { color: colors.textPrimary }]}>Roomio</Text>
            </View>
            <Text style={[styles.adminPanelLabel, { color: colors.textSecondary }]}>ADMIN PANEL</Text>
          </View>

          {/* Main Card */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]}>Welcome Back</Text>
              <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>
                Please enter your details to sign in
              </Text>
            </View>

            {showSavedChoice && savedEmail ? (
              <View style={styles.savedAccountView}>
                <Pressable onPress={handleContinueSaved} style={[styles.savedCard, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                  <View style={styles.savedIcon}>
                    <Ionicons name="person-circle" size={40} color={colors.accent} />
                  </View>
                  <View style={styles.savedInfo}>
                    <Text style={[styles.savedLabel, { color: colors.textSecondary }]}>Continue as</Text>
                    <Text style={[styles.savedEmail, { color: colors.textPrimary }]}>{savedEmail}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </Pressable>

                <Pressable onPress={() => setShowSavedChoice(false)} style={styles.useAnotherLink}>
                  <Text style={[styles.useAnotherText, { color: colors.accent }]}>Use another account</Text>
                </Pressable>

                <Pressable
                  style={[styles.loginButton, { backgroundColor: colors.buttonBg }]}
                  onPress={handleContinueSaved}
                  disabled={loading}
                >
                  {loading ? (
                    <Text style={styles.buttonText}>Signing In...</Text>
                  ) : (
                    <View style={styles.buttonContent}>
                      <Text style={styles.buttonText}>Sign In to Dashboard</Text>
                      <Ionicons name="arrow-forward" size={18} color="#FFF" />
                    </View>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={styles.formSection}>
                {/* Email Field */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.textPrimary }]}>Email Address</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: isFocused.email ? colors.accent : colors.inputBorder }]}>
                    <Ionicons name="mail-outline" size={20} color={isFocused.email ? colors.accent : colors.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="admin@roomio.io"
                      placeholderTextColor={colors.textSecondary + "80"}
                      style={[styles.input, { color: colors.textPrimary }]}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      onFocus={() => setIsFocused(f => ({ ...f, email: true }))}
                      onBlur={() => setIsFocused(f => ({ ...f, email: false }))}
                    />
                  </View>
                </View>

                {/* Password Field */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={[styles.label, { color: colors.textPrimary }]}>Password</Text>
                    <Pressable>
                      <Text style={[styles.forgotText, { color: colors.accent }]}>Forgot password?</Text>
                    </Pressable>
                  </View>
                  <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: isFocused.password ? colors.accent : colors.inputBorder }]}>
                    <Ionicons name="lock-closed-outline" size={20} color={isFocused.password ? colors.accent : colors.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      placeholder="••••••••"
                      placeholderTextColor={colors.textSecondary + "80"}
                      style={[styles.input, { color: colors.textPrimary }]}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      onFocus={() => setIsFocused(f => ({ ...f, password: true }))}
                      onBlur={() => setIsFocused(f => ({ ...f, password: false }))}
                    />
                    <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>

                {/* Remember Me */}
                <Pressable onPress={() => setRememberMe(!rememberMe)} style={styles.checkboxRow}>
                  <View style={[styles.checkbox, { borderColor: rememberMe ? colors.accent : colors.checkboxBorder, backgroundColor: rememberMe ? colors.accent : "transparent" }]}>
                    {rememberMe && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                  <Text style={[styles.checkboxLabel, { color: colors.textSecondary }]}>Remember this device</Text>
                </Pressable>

                {/* Login Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.loginButton,
                    { backgroundColor: colors.buttonBg, opacity: pressed || loading ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
                  ]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <Text style={styles.buttonText}>Signing In...</Text>
                  ) : (
                    <View style={styles.buttonContent}>
                      <Text style={styles.buttonText}>Sign In to Dashboard</Text>
                      <Ionicons name="arrow-forward" size={18} color="#FFF" />
                    </View>
                  )}
                </Pressable>
              </View>
            )}


          </View>

          {/* Bottom Status Info */}
          <View style={styles.pageFooter}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.statusText, { color: colors.textSecondary }]}>SYSTEM OPERATIONAL</Text>
            </View>
            <Text style={[styles.versionText, { color: colors.textSecondary }]}>V2.4.0-STABLE</Text>
            <Text style={[styles.copyrightText, { color: colors.textSecondary }]}>© 2024 ROOMIO INC.</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  contentWrapper: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  brandHeader: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoImageBrand: {
    width: 32,
    height: 32,
  },
  brandName: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  adminPanelLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    marginTop: 8,
    opacity: 0.8,
  },
  card: {
    borderRadius: 24,
    padding: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  formSection: {
    gap: 20,
  },
  inputGroup: {
    gap: 10,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
  },
  forgotText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    height: 56,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  eyeBtn: {
    padding: 8,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  loginButton: {
    height: 56,
    borderRadius: 28, // Pill shape like the image
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },

  pageFooter: {
    marginTop: 40,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  versionText: {
    fontSize: 10,
    fontWeight: "700",
  },
  copyrightText: {
    fontSize: 10,
    fontWeight: "700",
  },
  // Saved account styles
  savedAccountView: {
    gap: 20,
  },
  savedCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  savedIcon: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  savedInfo: {
    flex: 1,
  },
  savedLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
  },
  savedEmail: {
    fontSize: 14,
    fontWeight: "700",
  },
  useAnotherLink: {
    alignItems: "center",
  },
  useAnotherText: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Success styles
  successContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  successIconWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  successText: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  successSubtext: {
    fontSize: 16,
    fontWeight: "500",
  },
});
