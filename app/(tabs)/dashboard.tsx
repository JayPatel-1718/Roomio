import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  addDoc,
} from "firebase/firestore";
import { Audio } from "expo-av";
import * as Notifications from "expo-notifications";
import { db } from "../../firebase/firebaseConfig";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

import { useRouter } from "expo-router";
import { setupRooms } from "../../utils/setupRooms";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";

const TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

type SelectedRequest =
  | {
    id: string;
    type: "service";
    name?: string;
    roomNumber?: any;
  }
  | {
    id: string;
    type: "food";
    name?: string;
    roomNumber?: any;
  };

export default function Dashboard() {
  const router = useRouter();
  const auth = getAuth();
  const { width } = useWindowDimensions();
  const systemColorScheme = useColorScheme();

  const isWide = width >= 900;

  // ✅ Theme state (dark/light)
  const [isDark, setIsDark] = useState(systemColorScheme === "dark");

  const [user, setUser] = useState<User | null>(auth.currentUser);

  const [activeRooms, setActiveRooms] = useState(0);
  const [availableRooms, setAvailableRooms] = useState(0);

  const [requests, setRequests] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  const [showNotifications, setShowNotifications] = useState(false);

  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SelectedRequest | null>(null);
  const [selectedTime, setSelectedTime] = useState<number>(15);

  const lastPermAlertAt = useRef<number>(0);
  const showPermissionAlertOnce = (title: string, msg: string) => {
    const now = Date.now();
    if (now - lastPermAlertAt.current < 4000) return;
    lastPermAlertAt.current = now;
    Alert.alert(title, msg);
  };

  // Sound Logic
  const prevRequestsLength = useRef(0);
  const prevOrdersLength = useRef(0);
  const isFirstLoad = useRef(true);

  const playNotificationSound = async () => {
    if (Platform.OS === "web") return;
    try {
      const { sound } = await Audio.Sound.createAsync(
        {
          uri: "https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3",
        },
        { shouldPlay: true }
      );
    } catch (error) {
      console.log("Error playing sound:", error);
    }
  };

  const scheduleNotification = async () => {
    if (Platform.OS === "web") return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "New Request! 🔔",
          body: "A new service request or food order has arrived.",
          sound: true,
        },
        trigger: null,
      });
    } catch (error) {
      console.log("Error scheduling notification:", error);
    }
  };

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") return;
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    })();
  }, []);

  useEffect(() => {
    if (isFirstLoad.current) {
      if (requests.length > 0) prevRequestsLength.current = requests.length;
      if (orders.length > 0) prevOrdersLength.current = orders.length;
      isFirstLoad.current = false;
      return;
    }

    const newRequests = requests.length;
    const newOrders = orders.length;

    if (newRequests > prevRequestsLength.current || newOrders > prevOrdersLength.current) {
      playNotificationSound();
      scheduleNotification();
    }

    prevRequestsLength.current = newRequests;
    prevOrdersLength.current = newOrders;
  }, [requests.length, orders.length]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [auth]);

  useEffect(() => {
    if (!user) {
      router.replace("/admin-login");
      return;
    }

    const uid = user.uid;

    const roomsRef = collection(db, "users", uid, "rooms");

    const activeQuery = query(roomsRef, where("status", "==", "occupied"));
    const unsubActive = onSnapshot(
      activeQuery,
      (snap) => setActiveRooms(snap.size),
      (err) => {
        console.error("Active rooms listener error:", err);
        showPermissionAlertOnce(
          "Firestore Error",
          "Missing permission to read rooms. Check Firestore rules."
        );
      }
    );

    const availableQuery = query(roomsRef, where("status", "==", "available"));
    const unsubAvailable = onSnapshot(
      availableQuery,
      (snap) => setAvailableRooms(snap.size),
      (err) => {
        console.error("Available rooms listener error:", err);
        showPermissionAlertOnce(
          "Firestore Error",
          "Missing permission to read rooms. Check Firestore rules."
        );
      }
    );

    const requestsQuery = query(collection(db, "serviceRequests"), where("adminId", "==", uid));

    const unsubRequests = onSnapshot(
      requestsQuery,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const pendingOnly = all.filter((r: any) => (r.status || "pending") === "pending");
        setRequests(pendingOnly);
      },
      (err) => {
        console.error("Service requests listener error:", err);
        showPermissionAlertOnce(
          "Permission Denied",
          "Your Firestore rules are blocking access to serviceRequests.\n\nFix rules to allow admin read where adminId == auth.uid."
        );
      }
    );

    const ordersQuery = query(
      collection(db, "foodOrders"),
      where("adminId", "==", uid),
      where("status", "==", "pending")
    );

    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        console.log("📦 Food orders received:", snap.size);
        const orderData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setOrders(orderData);
      },
      (err) => {
        console.error("Food orders listener error:", err);
        console.error("Error details:", err.code, err.message);
        showPermissionAlertOnce(
          "Food Orders Error",
          `Cannot read food orders: ${err.message}\n\nCheck rules for /foodOrders collection and adminId query.`
        );
      }
    );

    return () => {
      unsubActive();
      unsubAvailable();
      unsubRequests();
      unsubOrders();
    };
  }, [user, router]);

  const acceptServiceRequest = async (id: string, type: string, roomNumber: any) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, "serviceRequests", id), {
        status: "in-progress",
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert(
        "✅ Request Accepted",
        `${type} request accepted${roomNumber ? ` for Room ${roomNumber}` : ""}.`
      );
    } catch (e: any) {
      console.error("Accept service request error:", e);
      Alert.alert("Error", e?.message || "Failed to accept request. Check permissions/rules.");
    }
  };

  const openTimeModal = (id: string, name?: string, roomNumber?: any) => {
    setSelectedRequest({ id, type: "food", name, roomNumber });
    setSelectedTime(15);
    setShowTimeModal(true);
  };

  const acceptFoodOrderWithTime = async () => {
    if (!selectedRequest || selectedRequest.type !== "food" || !user) return;

    const { id, roomNumber } = selectedRequest;

    const orderData = orders.find((o) => o.id === id);

    try {
      await updateDoc(doc(db, "foodOrders", id), {
        status: "in-progress",
        acceptedAt: serverTimestamp(),
        estimatedTime: selectedTime,
        updatedAt: serverTimestamp(),
      });

      if (orderData) {
        const readyAt = Timestamp.fromMillis(Date.now() + selectedTime * 60 * 1000);

        const serviceRequestRef = await addDoc(collection(db, "serviceRequests"), {
          adminId: user.uid,
          type: "Food Order",
          status: "in-progress",
          roomNumber: orderData.roomNumber || roomNumber,
          guestName: orderData.guestName || "Guest",
          guestMobile: orderData.guestMobile || "",
          dishName: orderData.items || orderData.item || "Food Order",
          orderDetails: orderData.orderDetails || [],
          totalAmount: orderData.totalAmount || orderData.totalPrice || 0,
          estimatedTime: selectedTime,
          readyAt,
          acceptedAt: serverTimestamp(),
          source: "foodOrder",
          foodOrderId: id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          mealCategory: orderData.mealCategory || "lunch",
          quantity: orderData.quantity || 1,
          price: orderData.price || orderData.totalAmount || orderData.totalPrice || 0,
        });

        console.log("✅ Created service request for tracking:", serviceRequestRef.id);

        const orderRef = await addDoc(collection(db, "orders"), {
          adminId: user.uid,
          type: "Food Order",
          status: "in-progress",
          roomNumber: orderData.roomNumber || roomNumber,
          guestName: orderData.guestName || "Guest",
          guestMobile: orderData.guestMobile || "",
          dishName: orderData.items || orderData.item || "Food Order",
          orderDetails: orderData.orderDetails || [],
          totalAmount: orderData.totalAmount || orderData.totalPrice || 0,
          estimatedTime: selectedTime,
          readyAt,
          acceptedAt: serverTimestamp(),
          source: "admin",
          serviceRequestId: serviceRequestRef.id,
          foodOrderId: id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          mealCategory: orderData.mealCategory || "lunch",
          quantity: orderData.quantity || 1,
          price: orderData.price || orderData.totalAmount || orderData.totalPrice || 0,
        });

        console.log("✅ Created order for guest dashboard:", orderRef.id);
      }

      Alert.alert(
        "✅ Order Accepted",
        `Food order accepted${roomNumber ? ` for Room ${roomNumber}` : ""
        }.\n\nEstimated time: ${selectedTime} minutes\n\nNow visible in Tracking and Guest Dashboard.`
      );

      setShowTimeModal(false);
      setSelectedRequest(null);
      setShowNotifications(false);
    } catch (e: any) {
      console.error("Accept food order error:", e);
      console.error("Full error:", JSON.stringify(e, null, 2));
      Alert.alert("Error", e?.message || "Failed to accept order. Check permissions/rules.");
    }
  };

  // ✅ Dynamic theme object
  const theme = isDark
    ? {
      bgMain: "#010409",
      bgCard: "rgba(13, 17, 23, 0.6)",
      bgNav: "rgba(1, 4, 9, 0.8)",
      textMain: "#f0f6fc",
      textMuted: "#8b949e",
      glass: "rgba(255, 255, 255, 0.03)",
      glassBorder: "rgba(255, 255, 255, 0.1)",
      shadow: "rgba(0, 0, 0, 0.6)",
      primary: "#2563eb",
      primaryHover: "#1d4ed8",
      primaryGlow: "rgba(37, 99, 235, 0.35)",
      accent: "#38bdf8",
      success: "#22c55e",
      warning: "#f59e0b",
      danger: "#ef4444",
    }
    : {
      bgMain: "#f8fafc",
      bgCard: "#ffffff",
      bgNav: "rgba(248, 250, 252, 0.9)",
      textMain: "#0f172a",
      textMuted: "#64748b",
      glass: "rgba(37, 99, 235, 0.04)",
      glassBorder: "rgba(37, 99, 235, 0.12)",
      shadow: "rgba(37, 99, 235, 0.15)",
      primary: "#2563eb",
      primaryHover: "#1d4ed8",
      primaryGlow: "rgba(37, 99, 235, 0.25)",
      accent: "#0ea5e9",
      success: "#16a34a",
      warning: "#f59e0b",
      danger: "#dc2626",
    };

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgMain }]}>
      {/* TIME SELECTION MODAL */}
      <Modal
        visible={showTimeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimeModal(false)}
      >
        <Pressable
          style={[styles.timeModalOverlay, { backgroundColor: `${theme.shadow}99` }]}
          onPress={() => setShowTimeModal(false)}
        >
          <Pressable
            style={[
              styles.timeModalCard,
              {
                backgroundColor: theme.bgCard,
                borderColor: theme.glassBorder,
                maxWidth: isWide ? 480 : 400,
              },
            ]}
            onPress={() => { }}
          >
            <View style={styles.timeModalHeader}>
              <View style={[styles.timeModalIcon, { backgroundColor: `${theme.primary}18` }]}>
                <Ionicons name="time-outline" size={28} color={theme.primary} />
              </View>
              <Text style={[styles.timeModalTitle, { color: theme.textMain }]}>
                Set Estimated Time
              </Text>
              <Text style={[styles.timeModalSubtitle, { color: theme.textMuted }]}>
                How long will this take to complete?
              </Text>
            </View>

            <View style={styles.timeGrid}>
              {TIME_OPTIONS.map((time) => (
                <Pressable
                  key={time}
                  onPress={() => setSelectedTime(time)}
                  style={({ pressed }) => [
                    styles.timeOption,
                    {
                      backgroundColor:
                        selectedTime === time ? `${theme.primary}18` : theme.glass,
                      borderColor: selectedTime === time ? theme.primary : theme.glassBorder,
                    },
                    pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <Text
                    style={[
                      styles.timeOptionText,
                      { color: selectedTime === time ? theme.primary : theme.textMain },
                    ]}
                  >
                    {time}
                  </Text>
                  <Text
                    style={[
                      styles.timeOptionLabel,
                      { color: selectedTime === time ? theme.primary : theme.textMuted },
                    ]}
                  >
                    min
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.timeModalActions}>
              <Pressable
                onPress={() => setShowTimeModal(false)}
                style={({ pressed }) => [
                  styles.timeCancelBtn,
                  { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={[styles.timeCancelText, { color: theme.textMuted }]}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={acceptFoodOrderWithTime}
                style={({ pressed }) => [
                  styles.timeConfirmBtn,
                  { backgroundColor: theme.success },
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.timeConfirmText}>Accept</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notifications Modal */}
      <Modal
        visible={showNotifications}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotifications(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: `${theme.shadow}99` }]}
          onPress={() => setShowNotifications(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.bgCard,
                borderColor: theme.glassBorder,
                maxWidth: isWide ? 600 : undefined,
              },
            ]}
            onPress={() => { }}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalIcon, { backgroundColor: `${theme.primary}18` }]}>
                  <Ionicons name="notifications-outline" size={20} color={theme.primary} />
                </View>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.textMain }]}>Notifications</Text>
                  <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>
                    Service Requests & Food Orders
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setShowNotifications(false)}
                style={({ pressed }) => [
                  styles.modalClose,
                  { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="close" size={18} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Service Requests */}
              <View style={styles.modalSectionHeader}>
                <View style={styles.modalSectionLeft}>
                  <View style={[styles.sectionIconSmall, { backgroundColor: theme.primary }]}>
                    <Ionicons name="construct-outline" size={16} color="#fff" />
                  </View>
                  <Text style={[styles.modalSectionTitle, { color: theme.textMain }]}>
                    Service Requests
                  </Text>
                </View>
                <View style={[styles.modalCountPill, { backgroundColor: theme.glass }]}>
                  <Text style={[styles.modalCountText, { color: theme.primary }]}>
                    {requests.length}
                  </Text>
                </View>
              </View>

              {requests.length === 0 ? (
                <View
                  style={[
                    styles.modalEmpty,
                    { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                  ]}
                >
                  <Ionicons name="clipboard-outline" size={22} color={theme.textMuted} />
                  <Text style={[styles.modalEmptyText, { color: theme.textMuted }]}>
                    No pending service requests
                  </Text>
                </View>
              ) : (
                requests.map((r) => (
                  <View
                    key={r.id}
                    style={[
                      styles.modalItem,
                      { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                    ]}
                  >
                    <View style={styles.modalItemLeft}>
                      <View style={[styles.roomPill, { backgroundColor: `${theme.primary}12` }]}>
                        <Text style={[styles.roomPillText, { color: theme.primary }]}>
                          Room {r.roomNumber ?? "-"}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalItemTitle, { color: theme.textMain }]}>
                          {r.type ?? "Service"}
                        </Text>
                        <Text style={[styles.modalItemSub, { color: theme.textMuted }]}>
                          {r.guestName ? `Guest: ${r.guestName}` : "Guest: -"}
                          {r.guestMobile ? ` • ${r.guestMobile}` : ""}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalItemRight}>
                      <Pressable
                        onPress={() => acceptServiceRequest(r.id, r.type, r.roomNumber)}
                        style={({ pressed }) => [
                          styles.acceptBtn,
                          { backgroundColor: theme.success },
                          pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                        ]}
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={styles.acceptText}>Accept</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}

              {/* Food Orders */}
              <View style={[styles.modalSectionHeader, { marginTop: 16 }]}>
                <View style={styles.modalSectionLeft}>
                  <View style={[styles.sectionIconSmall, { backgroundColor: theme.success }]}>
                    <Ionicons name="restaurant-outline" size={16} color="#fff" />
                  </View>
                  <Text style={[styles.modalSectionTitle, { color: theme.textMain }]}>
                    Food Orders
                  </Text>
                </View>
                <View style={[styles.modalCountPill, { backgroundColor: theme.glass }]}>
                  <Text style={[styles.modalCountText, { color: theme.success }]}>
                    {orders.length}
                  </Text>
                </View>
              </View>

              {orders.length === 0 ? (
                <View
                  style={[
                    styles.modalEmpty,
                    { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                  ]}
                >
                  <Ionicons name="fast-food-outline" size={22} color={theme.textMuted} />
                  <Text style={[styles.modalEmptyText, { color: theme.textMuted }]}>
                    No food orders
                  </Text>
                </View>
              ) : (
                orders.map((o) => (
                  <View
                    key={o.id}
                    style={[
                      styles.modalItem,
                      { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                    ]}
                  >
                    <View style={styles.modalItemLeft}>
                      <View style={[styles.roomPill, { backgroundColor: `${theme.success}12` }]}>
                        <Text style={[styles.roomPillText, { color: theme.success }]}>
                          Room {o.roomNumber ?? "-"}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalItemTitle, { color: theme.textMain }]}>
                          {o.items || o.item || "Food Order"}
                        </Text>
                        <Text style={[styles.modalItemSub, { color: theme.textMuted }]}>
                          Total: ₹{o.totalAmount || o.totalPrice || 0}
                          {o.guestName ? ` • ${o.guestName}` : ""}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalItemRight}>
                      <Pressable
                        onPress={() => openTimeModal(o.id, o.item, o.roomNumber)}
                        style={({ pressed }) => [
                          styles.acceptBtn,
                          { backgroundColor: theme.success },
                          pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                        ]}
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={styles.acceptText}>Accept</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Animated.ScrollView
        style={[styles.container, { backgroundColor: theme.bgMain, opacity: fadeAnim }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.backgroundDecor}>
          <View style={[styles.bgCircle1, { backgroundColor: `${theme.primaryGlow}` }]} />
          <View style={[styles.bgCircle2, { backgroundColor: `${theme.primaryGlow}` }]} />
          <View style={[styles.bgCircle3, { backgroundColor: `${theme.primaryGlow}` }]} />
        </View>

        <View style={[styles.header, isWide && styles.headerWide]}>
          <View>
            <Text style={[styles.greeting, { color: theme.textMuted }]}>Welcome back</Text>
            <Text style={[styles.title, { color: theme.textMain }]}>Admin Dashboard</Text>
          </View>

          <View style={styles.headerRight}>
            {/* Theme Toggle */}
            <Pressable
              onPress={() => setIsDark(!isDark)}
              style={({ pressed }) => [
                styles.themeToggle,
                { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons
                name={isDark ? "sunny-outline" : "moon-outline"}
                size={20}
                color={theme.primary}
              />
            </Pressable>

            <Pressable
              onPress={() => router.push("/modals/add-guest")}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addText}>Add Guest</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowNotifications(true)}
              style={({ pressed }) => [
                styles.notification,
                { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons name="notifications-outline" size={20} color={theme.primary} />
              {requests.length + orders.length > 0 ? (
                <View style={[styles.notifBadge, { backgroundColor: theme.danger }]}>
                  <Text style={styles.notifBadgeText}>{requests.length + orders.length}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.bgCard,
              borderColor: theme.glassBorder,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.textMain }]}>Room Overview</Text>
            <View style={[styles.roleBadge, { backgroundColor: `${theme.primary}18` }]}>
              <Ionicons name="business-outline" size={14} color={theme.primary} />
              <Text style={[styles.role, { color: theme.primary }]}>HOTEL OPS</Text>
            </View>
          </View>

          <View
            style={[styles.metricsRow, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
          >
            <View style={styles.metricBox}>
              <View style={styles.metricHeader}>
                <View style={[styles.dot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Active Rooms</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.primary }]}>{activeRooms}</Text>
              <Text style={[styles.metricSubtext, { color: theme.textMuted }]}>
                Currently occupied
              </Text>
            </View>

            <View style={[styles.metricDivider, { backgroundColor: theme.glassBorder }]} />

            <View style={styles.metricBox}>
              <View style={styles.metricHeader}>
                <View style={[styles.dot, { backgroundColor: theme.success }]} />
                <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Available</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.success }]}>{availableRooms}</Text>
              <Text style={[styles.metricSubtext, { color: theme.textMuted }]}>Ready to check-in</Text>
            </View>
          </View>

          <Pressable
            onPress={() => setupRooms(101, 20)}
            style={({ pressed }) => [
              styles.setupBtn,
              { backgroundColor: theme.success },
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <Ionicons name="leaf-outline" size={18} color="#fff" />
            <Text style={styles.setupText}>Initialize Hotel Rooms</Text>
          </Pressable>
        </Animated.View>

        {/* SERVICE REQUESTS */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLeft}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.primary }]}>
              <Ionicons name="construct-outline" size={18} color="#fff" />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.textMain }]}>Service Requests</Text>
          </View>
          <View style={[styles.sectionCount, { backgroundColor: theme.glass }]}>
            <Text style={[styles.sectionCountText, { color: theme.primary }]}>{requests.length}</Text>
          </View>
        </View>

        {requests.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              { backgroundColor: theme.glass, borderColor: theme.glassBorder },
            ]}
          >
            <Ionicons name="clipboard-outline" size={24} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No pending requests</Text>
          </View>
        ) : (
          requests.map((r) => (
            <View
              key={r.id}
              style={[styles.listItem, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
            >
              <View style={styles.itemLeft}>
                <View style={[styles.roomPill, { backgroundColor: `${theme.primary}12` }]}>
                  <Text style={[styles.roomPillText, { color: theme.primary }]}>
                    Room {r.roomNumber ?? "-"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: theme.textMain }]}>{r.type ?? "Service"}</Text>
                  <Text style={[styles.itemSub, { color: theme.textMuted }]}>
                    {r.guestName ? `Guest: ${r.guestName}` : "Guest: -"}
                    {r.guestMobile ? ` • ${r.guestMobile}` : ""}
                  </Text>
                </View>
              </View>

              <View style={styles.itemRight}>
                <Pressable
                  onPress={() => acceptServiceRequest(r.id, r.type, r.roomNumber)}
                  style={({ pressed }) => [
                    styles.acceptBtn,
                    { backgroundColor: theme.success },
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.acceptText}>Accept</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {/* FOOD ORDERS */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLeft}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.success }]}>
              <Ionicons name="restaurant-outline" size={18} color="#fff" />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.textMain }]}>Food Orders</Text>
          </View>
          <View style={[styles.sectionCount, { backgroundColor: theme.glass }]}>
            <Text style={[styles.sectionCountText, { color: theme.success }]}>{orders.length}</Text>
          </View>
        </View>

        {orders.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              { backgroundColor: theme.glass, borderColor: theme.glassBorder },
            ]}
          >
            <Ionicons name="fast-food-outline" size={24} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No active orders</Text>
          </View>
        ) : (
          orders.map((o) => (
            <View
              key={o.id}
              style={[styles.listItem, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
            >
              <View style={styles.itemLeft}>
                <View style={[styles.roomPill, { backgroundColor: `${theme.success}12` }]}>
                  <Text style={[styles.roomPillText, { color: theme.success }]}>
                    Room {o.roomNumber ?? "-"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: theme.textMain }]}>
                    {o.items || o.item || "Food Order"}
                  </Text>
                  <Text style={[styles.itemSub, { color: theme.textMuted }]}>
                    Total: ₹{o.totalAmount || o.totalPrice || 0}
                    {o.guestName ? ` • ${o.guestName}` : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.itemRight}>
                <Pressable
                  onPress={() => openTimeModal(o.id, o.item, o.roomNumber)}
                  style={({ pressed }) => [
                    styles.acceptBtn,
                    { backgroundColor: theme.success },
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.acceptText}>Accept</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  backgroundDecor: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 },
  bgCircle1: {
    position: "absolute",
    top: -140,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.6,
  },
  bgCircle2: {
    position: "absolute",
    top: 200,
    left: -140,
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.4,
  },
  bgCircle3: {
    position: "absolute",
    bottom: -60,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.3,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 12,
  },
  headerWide: {
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  greeting: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },

  themeToggle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  addText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  notification: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  notifBadgeText: { color: "#fff", fontWeight: "900", fontSize: 10 },

  card: {
    borderRadius: 28,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
    marginBottom: 28,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  cardTitle: { fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 6,
  },
  role: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },

  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderWidth: 1.5,
    marginBottom: 20,
  },
  metricBox: { flex: 1 },
  metricHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  metricLabel: { fontWeight: "700", fontSize: 13, letterSpacing: 0.5 },
  metricValue: { marginTop: 10, fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  metricSubtext: { marginTop: 4, fontSize: 12, fontWeight: "600" },
  metricDivider: { width: 2, height: 50, marginHorizontal: 16 },

  setupBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 18,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  setupText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 16,
  },
  sectionLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionIconSmall: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  sectionCount: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  sectionCountText: { fontWeight: "900", fontSize: 14 },

  emptyState: {
    padding: 28,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1.5,
  },
  emptyText: { marginTop: 10, fontWeight: "700", fontSize: 14 },

  listItem: {
    padding: 18,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  itemLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  roomPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  roomPillText: { fontWeight: "900", fontSize: 12, letterSpacing: 0.5 },
  itemTitle: { fontWeight: "900", fontSize: 15 },
  itemSub: { fontSize: 13, marginTop: 3, fontWeight: "600" },
  itemRight: { alignItems: "flex-end" },

  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  acceptText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  timeModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  timeModalCard: {
    borderRadius: 32,
    padding: 28,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1.5,
  },
  timeModalHeader: { alignItems: "center", marginBottom: 28 },
  timeModalIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  timeModalTitle: { fontSize: 24, fontWeight: "900", marginBottom: 10, textAlign: "center" },
  timeModalSubtitle: { fontSize: 15, textAlign: "center", fontWeight: "600", lineHeight: 22 },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 28 },
  timeOption: {
    flex: 1,
    minWidth: 90,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: "center",
    borderWidth: 2.5,
  },
  timeOptionText: { fontSize: 28, fontWeight: "900" },
  timeOptionLabel: { fontSize: 13, fontWeight: "800", marginTop: 6, letterSpacing: 0.5 },
  timeModalActions: { flexDirection: "row", gap: 14 },
  timeCancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  timeCancelText: { fontWeight: "900", fontSize: 16 },
  timeConfirmBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  timeConfirmText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },

  modalOverlay: {
    flex: 1,
    justifyContent: Platform.OS === "web" ? "center" : "flex-end",
    alignItems: Platform.OS === "web" ? "center" : "stretch",
    padding: Platform.OS === "web" ? 20 : 0,
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderRadius: Platform.OS === "web" ? 28 : 0,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 22,
    maxHeight: "85%",
    borderTopWidth: 1.5,
    width: Platform.OS === "web" ? "100%" : undefined,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  modalHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  modalIcon: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 13, fontWeight: "700", marginTop: 3 },
  modalClose: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  modalBody: { marginTop: 16 },
  modalBodyContent: { paddingBottom: 24 },

  modalSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  modalSectionLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalSectionTitle: { fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  modalCountPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  modalCountText: { fontWeight: "900", fontSize: 13 },

  modalItem: {
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalItemLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  modalItemRight: { alignItems: "flex-end" },
  modalItemTitle: { fontWeight: "900", fontSize: 14 },
  modalItemSub: { fontSize: 12, marginTop: 3, fontWeight: "600" },

  modalEmpty: {
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    marginBottom: 12,
  },
  modalEmptyText: { fontWeight: "700", marginTop: 10, fontSize: 13 },
});