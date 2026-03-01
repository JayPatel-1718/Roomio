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
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
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
  orderBy,
  limit,
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
  const { theme: currentTheme, colors: theme, mode, setMode } = useTheme();
  const isDark = currentTheme === "dark";

  const isWide = width >= 900;

  const [user, setUser] = useState<User | null>(auth.currentUser);

  const [activeRooms, setActiveRooms] = useState(0);
  const [availableRooms, setAvailableRooms] = useState(0);
  const [occupiedCount, setOccupiedCount] = useState(0);
  const [totalRooms, setTotalRooms] = useState(0);
  const [occupancyRate, setOccupancyRate] = useState(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

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

    // Combined Rooms Listener for stats
    const roomsRef = collection(db, "users", uid, "rooms");
    const unsubRooms = onSnapshot(roomsRef, (snap) => {
      const allRooms = snap.docs.map(d => d.data());
      setTotalRooms(snap.size);

      const occupied = allRooms.filter(r => r.status === "occupied").length;
      const available = allRooms.filter(r => r.status === "available").length;

      setActiveRooms(occupied + available); // "Active" as in operational
      setOccupiedCount(occupied); // Helper for UI
      setAvailableRooms(available);

      const rate = snap.size > 0 ? (occupied / snap.size) * 100 : 0;
      setOccupancyRate(Math.round(rate));
    });

    // Recent Activity (Guests)
    const guestsQuery = query(
      collection(db, "guests"),
      where("adminId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const unsubGuests = onSnapshot(guestsQuery, (snap) => {
      setRecentActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const requestsQuery = query(
      collection(db, "serviceRequests"),
      where("adminId", "==", uid),
      where("status", "==", "pending")
    );
    const unsubRequests = onSnapshot(requestsQuery, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const ordersQuery = query(
      collection(db, "foodOrders"),
      where("adminId", "==", uid),
      where("status", "==", "pending")
    );
    const unsubOrders = onSnapshot(ordersQuery, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubRooms();
      unsubGuests();
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
      <View style={styles.mainLayout}>
        <View style={styles.mainArea}>
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
                    maxWidth: 480,
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

          <Animated.ScrollView
            style={[styles.container, { opacity: fadeAnim }]}
            contentContainerStyle={[
              styles.content,
              isWide && styles.contentWide
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* NEW HEADER DESIGN */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={[styles.greeting, { color: theme.textMuted }]}>
                  {new Date().getHours() < 12 ? "GOOD MORNING" : "GOOD AFTERNOON"}, ADMIN
                </Text>
                <Text style={[styles.title, { color: theme.textMain }]}>
                  Dashboard Overview
                </Text>
              </View>

              <View style={styles.headerRight}>
                <Pressable
                  onPress={() => setMode(isDark ? "light" : "dark")}
                  style={[styles.headerToolBtn, { borderColor: theme.glassBorder }]}
                >
                  <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={theme.textMain} />
                </Pressable>

                <Pressable style={[styles.headerToolBtn, { borderColor: theme.glassBorder }]}>
                  <Ionicons name="notifications-outline" size={20} color={theme.textMain} />
                  {requests.length + orders.length > 0 && (
                    <View style={[styles.headerBadge, { backgroundColor: theme.danger }]} />
                  )}
                </Pressable>

                {isWide && <View style={[styles.headerDivider, { backgroundColor: theme.glassBorder }]} />}

                <Pressable
                  onPress={() => router.push("/modals/add-guest")}
                  style={[styles.desktopAddBtn, { backgroundColor: theme.primary }]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.desktopAddBtnText}>Add Guest</Text>
                </Pressable>
              </View>
            </View>

            {/* SUMMARY CARDS GRID */}
            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <View style={styles.metricHeaderRow}>
                  <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Active Rooms</Text>
                  <View style={[styles.metricDot, { backgroundColor: theme.success }]} />
                </View>
                <View>
                  <Text style={[styles.metricValue, { color: theme.textMain }]}>{activeRooms}</Text>
                  <Text style={[styles.metricTrend, { color: theme.textMuted }]}>Total active</Text>
                </View>
              </View>

              <View style={[styles.metricCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <View style={styles.metricHeaderRow}>
                  <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Available Rooms</Text>
                  <View style={[styles.metricDot, { backgroundColor: theme.warning }]} />
                </View>
                <View>
                  <Text style={[styles.metricValue, { color: theme.textMain }]}>{availableRooms}</Text>
                  <Text style={[styles.metricTrend, { color: theme.textMuted }]}>Ready now</Text>
                </View>
              </View>

              <View style={[styles.metricCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <View style={styles.metricHeaderRow}>
                  <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Occupied Rooms</Text>
                  <View style={[styles.metricDot, { backgroundColor: theme.primary }]} />
                </View>
                <View>
                  <Text style={[styles.metricValue, { color: theme.textMain }]}>{occupiedCount}</Text>
                  <Text style={[styles.metricTrend, { color: theme.textMuted }]}>Currently taken</Text>
                </View>
              </View>

              <View style={[styles.metricCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <View style={styles.metricHeaderRow}>
                  <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Occupancy Rate</Text>
                  <View style={[styles.metricTrendPill, { backgroundColor: `${theme.success}15` }]}>
                    <Ionicons name="trending-up" size={10} color={theme.success} />
                    <Text style={[styles.metricTrendPillText, { color: theme.success }]}>+2%</Text>
                  </View>
                </View>
                <View>
                  <Text style={[styles.metricValue, { color: theme.textMain }]}>{occupancyRate}%</Text>
                  <Text style={[styles.metricTrend, { color: theme.textMuted }]}>Target 90%</Text>
                </View>
              </View>
            </View>

            {/* MIDDLE SECTION: SERVICE & FOOD */}
            <View style={[styles.sectionsRow, isWide && styles.sectionsRowWide]}>
              {/* SERVICE REQUESTS */}
              <View style={[styles.sectionCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <View style={styles.sectionCardHeader}>
                  <View style={styles.sectionHeaderLeftContent}>
                    <Text style={[styles.sectionTitle, { color: theme.textMain }]}>Service Requests</Text>
                    <View style={[styles.badgePill, { backgroundColor: theme.bgMain }]}>
                      <Text style={[styles.badgePillText, { color: theme.textMuted }]}>{requests.length}</Text>
                    </View>
                  </View>
                  <Pressable>
                    <Text style={[styles.viewAllText, { color: theme.primary }]}>View All</Text>
                  </Pressable>
                </View>

                {requests.length === 0 ? (
                  <View style={styles.innerEmpty}>
                    <View style={[styles.innerEmptyIcon, { backgroundColor: theme.bgMain }]}>
                      <Ionicons name="clipboard-outline" size={32} color={theme.textMuted} />
                    </View>
                    <Text style={[styles.innerEmptyText, { color: theme.textMuted }]}>No pending requests</Text>
                    <Text style={[styles.innerEmptySub, { color: theme.textMuted }]}>Everything is up to date.</Text>
                  </View>
                ) : (
                  requests.slice(0, 3).map((r) => (
                    <View key={r.id} style={[styles.requestItem, { borderBottomColor: theme.glassBorder }]}>
                      <View style={styles.requestMain}>
                        <Text style={[styles.requestRoom, { color: theme.primary }]}>Room {r.roomNumber}</Text>
                        <Text style={[styles.requestType, { color: theme.textMain }]}>{r.type}</Text>
                      </View>
                      <Pressable
                        onPress={() => acceptServiceRequest(r.id, "service", r.roomNumber)}
                        style={[styles.miniBtn, { backgroundColor: theme.success }]}
                      >
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>

              {/* FOOD ORDERS */}
              <View style={[styles.sectionCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <View style={styles.sectionCardHeader}>
                  <View style={styles.sectionHeaderLeftContent}>
                    <Text style={[styles.sectionTitle, { color: theme.textMain }]}>Food Orders</Text>
                    <View style={[styles.badgePill, { backgroundColor: theme.bgMain }]}>
                      <Text style={[styles.badgePillText, { color: theme.textMuted }]}>{orders.length}</Text>
                    </View>
                  </View>
                  <Pressable>
                    <Text style={[styles.viewAllText, { color: theme.primary }]}>View All</Text>
                  </Pressable>
                </View>

                {orders.length === 0 ? (
                  <View style={styles.innerEmpty}>
                    <View style={[styles.innerEmptyIcon, { backgroundColor: theme.bgMain }]}>
                      <Ionicons name="restaurant-outline" size={32} color={theme.textMuted} />
                    </View>
                    <Text style={[styles.innerEmptyText, { color: theme.textMuted }]}>No active orders</Text>
                    <Text style={[styles.innerEmptySub, { color: theme.textMuted }]}>Waiting for guest orders.</Text>
                  </View>
                ) : (
                  orders.slice(0, 3).map((o) => (
                    <View key={o.id} style={[styles.requestItem, { borderBottomColor: theme.glassBorder }]}>
                      <View style={styles.requestMain}>
                        <Text style={[styles.requestRoom, { color: theme.success }]}>Room {o.roomNumber}</Text>
                        <Text style={[styles.requestType, { color: theme.textMain }]} numberOfLines={1}>
                          {o.items || o.dishName || "Food Order"}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => openTimeModal(o.id, o.items || o.dishName, o.roomNumber)}
                        style={[styles.miniBtn, { backgroundColor: theme.success }]}
                      >
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </View>

            {/* RECENT ACTIVITY TABLE */}
            <View style={[styles.tableCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
              <View style={styles.tableHeaderSection}>
                <Text style={[styles.tableTitle, { color: theme.textMain }]}>Recent Activity</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.table}>
                  {/* Header Row */}
                  <View style={[styles.tableRow, styles.tableHeaderRow, { borderBottomColor: theme.glassBorder }]}>
                    <Text style={[styles.tableCol, styles.colRoomHeader, { color: theme.textMuted }]}>ROOM</Text>
                    <Text style={[styles.tableCol, styles.colGuestHeader, { color: theme.textMuted }]}>GUEST</Text>
                    <Text style={[styles.tableCol, styles.colStatusHeader, { color: theme.textMuted }]}>STATUS</Text>
                    <Text style={[styles.tableCol, styles.colDateHeader, { color: theme.textMuted }]}>CHECK IN</Text>
                    <Text style={[styles.tableCol, styles.colDateHeader, { color: theme.textMuted }]}>CHECK OUT</Text>
                  </View>

                  {/* Data Rows */}
                  {recentActivity.length === 0 ? (
                    <View style={styles.emptyTable}>
                      <Text style={{ color: theme.textMuted }}>No recent check-ins</Text>
                    </View>
                  ) : (
                    recentActivity.map((guest) => {
                      const checkin = guest.checkinAt?.toDate ? guest.checkinAt.toDate() : new Date();
                      const checkout = guest.checkoutAt?.toDate ? guest.checkoutAt.toDate() : new Date();

                      return (
                        <View key={guest.id} style={[styles.tableRow, { borderBottomColor: theme.glassBorder }]}>
                          <View style={styles.colRoomHeader}>
                            <Text style={[styles.tableRoomText, { color: theme.textMain }]}>{guest.roomNumber || "—"}</Text>
                          </View>
                          <View style={[styles.colGuestHeader, styles.guestInfoCell]}>
                            <View style={[styles.guestAvatar, { backgroundColor: theme.primaryGlow }]}>
                              <Ionicons name="person" size={14} color={theme.primary} />
                            </View>
                            <Text style={[styles.tableGuestText, { color: theme.textMain }]}>{guest.guestName}</Text>
                          </View>
                          <View style={styles.colStatusHeader}>
                            <View style={[styles.statusPill, { backgroundColor: guest.isActive ? `${theme.success}15` : `${theme.textMuted}10` }]}>
                              <Text style={[styles.statusPillText, { color: guest.isActive ? theme.success : theme.textMuted }]}>
                                {guest.isActive ? "Checked In" : "Scheduled"}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.colDateHeader}>
                            <Text style={[styles.tableDateText, { color: theme.textMain }]}>
                              {checkin.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                          </View>
                          <View style={styles.colDateHeader}>
                            <Text style={[styles.tableDateText, { color: theme.textMain }]}>
                              {checkout.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </ScrollView>
            </View>

            {/* SETUP BUTTON (Less prominent) */}
            <Pressable
              onPress={() => setupRooms(101, 20)}
              style={{ marginTop: 40, alignSelf: 'center', opacity: 0.2 }}
            >
              <Text style={{ color: theme.textMuted, fontSize: 10 }}>System Maintenance: Initialize Hotel Rooms</Text>
            </Pressable>
          </Animated.ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  mainLayout: { flex: 1, flexDirection: 'row' },

  mainArea: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  contentWide: { paddingHorizontal: 48, paddingTop: 40 },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  headerLeft: {
    gap: 4,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerToolBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  headerDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 8,
  },
  desktopAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  desktopAddBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },

  /* Metrics */
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginBottom: 40 },
  metricCard: { flex: 1, minWidth: 220, padding: 24, borderRadius: 24, borderWidth: 1, gap: 12 },
  metricHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricDot: { width: 10, height: 10, borderRadius: 5 },
  metricLabel: { fontWeight: '800', fontSize: 13 },
  metricValue: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  metricTrend: { fontSize: 12, fontWeight: '700' },
  metricTrendPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  metricTrendPillText: { fontSize: 11, fontWeight: '900' },

  /* Sections */
  sectionsRow: { flexDirection: 'column', gap: 24, marginBottom: 40 },
  sectionsRowWide: { flexDirection: 'row' },
  sectionCard: { flex: 1, padding: 28, borderRadius: 32, borderWidth: 1 },
  sectionCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  sectionHeaderLeftContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  badgePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  badgePillText: { fontWeight: '900', fontSize: 13 },
  viewAllText: { fontWeight: '800', fontSize: 14 },

  innerEmpty: { paddingVertical: 48, alignItems: 'center', gap: 12 },
  innerEmptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  innerEmptyText: { fontSize: 16, fontWeight: '800' },
  innerEmptySub: { fontSize: 14, fontWeight: '600', opacity: 0.7 },

  requestItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  requestMain: { flex: 1, gap: 4 },
  requestRoom: { fontSize: 12, fontWeight: '800' },
  requestType: { fontSize: 16, fontWeight: '700' },
  miniBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  /* Table */
  tableCard: { padding: 32, borderRadius: 32, borderWidth: 1, marginBottom: 40 },
  tableHeaderSection: { marginBottom: 32 },
  tableTitle: { fontSize: 22, fontWeight: '900' },
  table: { minWidth: 900 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1 },
  tableHeaderRow: { borderBottomWidth: 1, paddingBottom: 16 },
  tableCol: { fontWeight: '800', fontSize: 13 },
  colRoomHeader: { width: 120 },
  colGuestHeader: { flex: 1 },
  colStatusHeader: { width: 180 },
  colDateHeader: { width: 180 },

  guestInfoCell: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  guestAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  tableRoomText: { fontWeight: '900', fontSize: 15 },
  tableGuestText: { fontWeight: '800', fontSize: 15 },
  tableDateText: { fontSize: 14, fontWeight: '700' },
  statusPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  statusPillText: { fontSize: 12, fontWeight: '900' },
  emptyTable: { paddingVertical: 60, alignItems: 'center' },

  /* Modal */
  timeModalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  timeModalCard: { borderRadius: 32, padding: 32, width: "100%", borderWidth: 1, elevation: 20 },
  timeModalHeader: { alignItems: "center", marginBottom: 32 },
  timeModalIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  timeModalTitle: { fontSize: 26, fontWeight: "900", marginBottom: 12, textAlign: "center" },
  timeModalSubtitle: { fontSize: 16, textAlign: "center", fontWeight: "600" },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 32 },
  timeOption: { flex: 1, minWidth: 100, borderRadius: 20, paddingVertical: 20, alignItems: "center", borderWidth: 2.5 },
  timeOptionText: { fontSize: 28, fontWeight: "900" },
  timeOptionLabel: { fontSize: 12, fontWeight: "800", marginTop: 4 },
  timeModalActions: { flexDirection: "row", gap: 16 },
  timeCancelBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, alignItems: "center", borderWidth: 1.5 },
  timeCancelText: { fontWeight: "900", fontSize: 16 },
  timeConfirmBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  timeConfirmText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },
});