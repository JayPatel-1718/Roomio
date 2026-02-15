import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  SafeAreaView,
  Animated,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Import your logo image - CORRECTED PATH
import logoImage from "../assets/images/logo.png";

const SAVED_EMAIL_KEY = "roomio_saved_admin_email";
const SAVED_PASS_KEY = "roomio_saved_admin_password";
const LOGIN_COUNTS_KEY = "roomio_admin_login_counts";
const SHOW_SAVED_AFTER = 3; // ✅ "more than 3 times" => show after 3 successful logins

export default function AdminLogin() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [success, setSuccess] = useState(false);

  // ✅ Saved account UI state
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [savedLoginCount, setSavedLoginCount] = useState(0);
  const [showSavedChoice, setShowSavedChoice] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0)).current;

  // ✅ Load saved account + count on startup
  useEffect(() => {
    const loadSaved = async () => {
      try {
        let se: string | null = null;
        let sp: string | null = null;

        if (Platform.OS !== 'web') {
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

          // ✅ Show saved choice only if used >= 3 times and credentials exist
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
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      // ✅ UPDATED: go to ownership selection screen after login
      router.replace("/ownership");
    }, 1200);
  };

  // ✅ Increment login count for an email
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

  // ✅ Save credentials securely
  const saveCredentials = async (emailAddr: string, pass: string) => {
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(SAVED_EMAIL_KEY, emailAddr);
        await SecureStore.setItemAsync(SAVED_PASS_KEY, pass);
      }
      setSavedEmail(emailAddr);
      setSavedPassword(pass);
    } catch (e) {
      console.log("Failed to save credentials:", e);
    }
  };

  // ✅ Normal login using typed email/password
  const handleLogin = async () => {
    if (!email || !password) return;

    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);

      // Save credentials for future "Continue"
      await saveCredentials(email.trim(), password);

      // Update login count
      await bumpLoginCount(email.trim());

      animateSuccess();
    } catch (error) {
      Alert.alert("Login Failed", "Invalid admin credentials");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Continue login using saved credentials
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

      animateSuccess();
    } catch (e) {
      Alert.alert(
        "Continue Failed",
        "Saved login failed. Please login manually again."
      );
      setShowSavedChoice(false);
      setEmail(savedEmail);
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Success Screen (unchanged)
  if (success) {
    return (
      <SafeAreaView style={styles.successContainer}>
        <View style={styles.successBackground}>
          <View style={styles.successCircle1} />
          <View style={styles.successCircle2} />
        </View>
        <Animated.View
          style={[
            styles.successIconContainer,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          <View style={styles.successIconBg}>
            <Ionicons name="checkmark-circle" size={80} color="#16A34A" />
          </View>
        </Animated.View>
        <Text style={styles.successText}>Login Successful</Text>
        <Text style={styles.successSubtext}>Redirecting to dashboard...</Text>
      </SafeAreaView>
    );
  }

  // ✅ Saved Account Choice Screen (NEW)
  if (showSavedChoice && savedEmail) {
    return (
      <SafeAreaView style={styles.container}>
        {/* Decorative Background */}
        <View style={styles.backgroundDecor}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <View style={styles.bgCircle3} />
        </View>

        {/* Header with Logo Image */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={logoImage}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brand}>Roomio</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#2563EB" />
            <Text style={styles.role}>ADMIN PANEL</Text>
          </View>
        </View>

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
                <Ionicons
                  name="person-circle-outline"
                  size={26}
                  color="#2563EB"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.savedLabel}>Continue as</Text>
                <Text style={styles.savedEmail} numberOfLines={1}>
                  {savedEmail}
                </Text>
                <Text style={styles.savedHint}>
                  Used {savedLoginCount} times on this device
                </Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                loading && styles.buttonDisabled,
                pressed && !loading && styles.buttonPressed,
              ]}
              onPress={handleContinueSaved}
              disabled={loading}
            >
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>
                  {loading ? "Continuing..." : "Continue"}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </View>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowSavedChoice(false);
                setEmail(savedEmail);
                setPassword("");
              }}
              style={styles.useAnotherBtn}
            >
              <Text style={styles.useAnotherText}>Use another account</Text>
            </Pressable>
          </View>
        </View>

        {/* Security Notice */}
        <View style={styles.securityNotice}>
          <Ionicons name="shield-outline" size={16} color="#6B7280" />
          <Text style={styles.securityText}>Secured with 256-bit encryption</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.statusContainer}>
            <View style={styles.statusDot} />
            <Text style={styles.status}>System Operational</Text>
          </View>
          <View style={styles.versionContainer}>
            <Text style={styles.version}>VERSION 2.4.0</Text>
            <View style={styles.versionDivider} />
            <Text style={styles.version}>BUILD 902</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ✅ Normal login form
  return (
    <SafeAreaView style={styles.container}>
      {/* Decorative Background */}
      <View style={styles.backgroundDecor}>
        <View style={styles.bgCircle1} />
        <View style={styles.bgCircle2} />
        <View style={styles.bgCircle3} />
      </View>

      {/* Header with Logo Image */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image
            source={logoImage}
            style={styles.logoImage}
            resizeMode="contain"
          />
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
          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputWrapper}>
            <View style={styles.inputIconContainer}>
              <Ionicons name="mail-outline" size={20} color="#2563EB" />
            </View>
            <TextInput
              placeholder="Enter your email"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrapper}>
            <View style={styles.inputIconContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#2563EB" />
            </View>
            <TextInput
              placeholder="Enter your password"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
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

          <Pressable
            style={({ pressed }) => [
              styles.button,
              loading && styles.buttonDisabled,
              pressed && !loading && styles.buttonPressed,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <Ionicons name="sync" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>Logging in...</Text>
              </View>
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>Login to Dashboard</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Security Notice */}
      <View style={styles.securityNotice}>
        <Ionicons name="shield-outline" size={16} color="#6B7280" />
        <Text style={styles.securityText}>Secured with 256-bit encryption</Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.statusContainer}>
          <View style={styles.statusDot} />
          <Text style={styles.status}>System Operational</Text>
        </View>
        <View style={styles.versionContainer}>
          <Text style={styles.version}>VERSION 2.4.0</Text>
          <View style={styles.versionDivider} />
          <Text style={styles.version}>BUILD 902</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ✅ Updated styles with logo image support
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 24,
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
    top: -80,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  bgCircle2: {
    position: "absolute",
    top: 150,
    left: -100,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(37, 99, 235, 0.05)",
  },
  bgCircle3: {
    position: "absolute",
    bottom: 50,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
  },
  header: {
    alignItems: "center",
    marginTop: 32,
    marginBottom: 32,
  },
  logoContainer: {
    marginBottom: 16,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    width: 80,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  brand: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 0.5,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
    gap: 6,
  },
  role: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  cardHeader: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 6,
  },
  formSection: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 12,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  inputIconContainer: {
    width: 48,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.05)",
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111827",
  },
  eyeButton: {
    padding: 16,
  },
  button: {
    backgroundColor: "#2563EB",
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonPressed: {
    backgroundColor: "#1D4ED8",
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  securityNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 6,
  },
  securityText: {
    fontSize: 12,
    color: "#6B7280",
  },
  footer: {
    alignItems: "center",
    marginTop: "auto",
    paddingTop: 24,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },
  status: {
    fontSize: 13,
    color: "#16A34A",
    fontWeight: "600",
  },
  versionContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
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
    fontWeight: "500",
    letterSpacing: 0.5,
  },

  // ✅ NEW styles for saved account screen
  savedAccountBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  savedIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  savedLabel: { color: "#6B7280", fontSize: 12, fontWeight: "700" },
  savedEmail: { color: "#111827", fontSize: 15, fontWeight: "800" },
  savedHint: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },
  useAnotherBtn: {
    marginTop: 14,
    alignItems: "center",
  },
  useAnotherText: {
    color: "#2563EB",
    fontWeight: "800",
  },

  // Success Screen Styles
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
    top: "30%",
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(22, 163, 74, 0.08)",
  },
  successCircle2: {
    position: "absolute",
    bottom: "25%",
    right: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(22, 163, 74, 0.05)",
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successIconBg: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  successText: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  successSubtext: {
    fontSize: 15,
    color: "#6B7280",
  },
});