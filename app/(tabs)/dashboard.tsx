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

// Time options in minutes
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

  const [user, setUser] = useState<User | null>(auth.currentUser);

  const [activeRooms, setActiveRooms] = useState(0);
  const [availableRooms, setAvailableRooms] = useState(0);

  // pending lists
  const [requests, setRequests] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  // modals
  const [showNotifications, setShowNotifications] = useState(false);

  // time modal (food only)
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SelectedRequest | null>(
    null
  );
  const [selectedTime, setSelectedTime] = useState<number>(15);

  // avoid alert spam
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
    if (Platform.OS === "web") return; // Audio usually needs interaction on web
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: "https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3" },
        { shouldPlay: true }
      );
    } catch (error) {
      console.log("Error playing sound:", error);
    }
  };

  const scheduleNotification = async () => {
    if (Platform.OS === "web") return; // Notifications on web need VAPID/ServiceWorker
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
      if (Platform.OS === 'web') return;
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    })();
  }, []);

  // Effect to track changes and play sound
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

    // Rooms (user scoped)
    const roomsRef = collection(db, "users", uid, "rooms");

    // Active rooms
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

    // Available rooms
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

    /**
     * ✅ Service requests (ROOT collection)
     * To avoid "index required", we only filter by adminId in Firestore,
     * then filter "pending" in JS.
     */
    const requestsQuery = query(
      collection(db, "serviceRequests"),
      where("adminId", "==", uid)
    );

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

    // ✅ FIXED: Food orders from ROOT collection (not user subcollection)
    const ordersQuery = query(
      collection(db, "foodOrders"), // ✅ ROOT level
      where("adminId", "==", uid),  // ✅ Filter by adminId
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

  // ✅ ACCEPT SERVICE REQUEST -> make it "in-progress" so Tracking can show it
  const acceptServiceRequest = async (id: string, type: string, roomNumber: any) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, "serviceRequests", id), {
        status: "in-progress", // ✅ IMPORTANT (was "accepted")
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert(
        "✅ Request Accepted",
        `${type} request accepted${roomNumber ? ` for Room ${roomNumber}` : ""}.`
      );

      // Optional: go to tracking screen
      // router.push("/tracking");
    } catch (e: any) {
      console.error("Accept service request error:", e);
      Alert.alert("Error", e?.message || "Failed to accept request. Check permissions/rules.");
    }
  };

  // ✅ Open time modal for food
  const openTimeModal = (id: string, name?: string, roomNumber?: any) => {
    setSelectedRequest({ id, type: "food", name, roomNumber });
    setSelectedTime(15);
    setShowTimeModal(true);
  };

  // ✅ ACCEPT FOOD ORDER with time -> update foodOrders + create serviceRequest for tracking + create order for guest dashboard
  const acceptFoodOrderWithTime = async () => {
    if (!selectedRequest || selectedRequest.type !== "food" || !user) return;

    const { id, roomNumber } = selectedRequest;

    // capture order before updating (snapshot may remove it)
    const orderData = orders.find((o) => o.id === id);

    try {
      // 1) Update food order status at ROOT collection
      await updateDoc(doc(db, "foodOrders", id), { // ✅ ROOT level
        status: "in-progress",
        acceptedAt: serverTimestamp(),
        estimatedTime: selectedTime,
        updatedAt: serverTimestamp(),
      });

      // 2) Create service request for tracking (so Tracking.tsx can see it)
      if (orderData) {
        const readyAt = Timestamp.fromMillis(Date.now() + selectedTime * 60 * 1000);

        // ✅ CRITICAL: Create in serviceRequests collection for admin tracking
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
          foodOrderId: id, // Link back to original food order
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          // Add meal category if available
          mealCategory: orderData.mealCategory || "lunch",
          quantity: orderData.quantity || 1,
          price: orderData.price || orderData.totalAmount || orderData.totalPrice || 0,
        });

        console.log("✅ Created service request for tracking:", serviceRequestRef.id);

        // 3) Create/Update in 'orders' collection for guest dashboard
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
          serviceRequestId: serviceRequestRef.id, // Link to service request
          foodOrderId: id, // Link to original food order
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
        `Food order accepted${roomNumber ? ` for Room ${roomNumber}` : ""}.\n\nEstimated time: ${selectedTime} minutes\n\nNow visible in Tracking and Guest Dashboard.`
      );

      setShowTimeModal(false);
      setSelectedRequest(null);
      setShowNotifications(false);

      // Optional: open tracking immediately
      // router.push("/tracking");
    } catch (e: any) {
      console.error("Accept food order error:", e);
      console.error("Full error:", JSON.stringify(e, null, 2));
      Alert.alert("Error", e?.message || "Failed to accept order. Check permissions/rules.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* TIME SELECTION MODAL */}
      <Modal
        visible={showTimeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimeModal(false)}
      >
        <Pressable
          style={styles.timeModalOverlay}
          onPress={() => setShowTimeModal(false)}
        >
          <Pressable style={styles.timeModalCard} onPress={() => { }}>
            <View style={styles.timeModalHeader}>
              <View style={styles.timeModalIcon}>
                <Ionicons name="time-outline" size={24} color="#2563EB" />
              </View>
              <Text style={styles.timeModalTitle}>Set Estimated Time</Text>
              <Text style={styles.timeModalSubtitle}>
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
                    selectedTime === time && styles.timeOptionActive,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Text
                    style={[
                      styles.timeOptionText,
                      selectedTime === time && styles.timeOptionTextActive,
                    ]}
                  >
                    {time}
                  </Text>
                  <Text
                    style={[
                      styles.timeOptionLabel,
                      selectedTime === time && styles.timeOptionLabelActive,
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
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={styles.timeCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={acceptFoodOrderWithTime}
                style={({ pressed }) => [
                  styles.timeConfirmBtn,
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
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotifications(false)}>
          <Pressable style={styles.modalCard} onPress={() => { }}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIcon}>
                  <Ionicons name="notifications-outline" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Notifications</Text>
                  <Text style={styles.modalSubtitle}>Service Requests & Food Orders</Text>
                </View>
              </View>

              <Pressable
                onPress={() => setShowNotifications(false)}
                style={({ pressed }) => [
                  styles.modalClose,
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
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
                  <View style={[styles.sectionIcon, { backgroundColor: "#2563EB" }]}>
                    <Ionicons name="construct-outline" size={16} color="#fff" />
                  </View>
                  <Text style={styles.modalSectionTitle}>Service Requests</Text>
                </View>
                <View style={styles.modalCountPill}>
                  <Text style={styles.modalCountText}>{requests.length}</Text>
                </View>
              </View>

              {requests.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Ionicons name="clipboard-outline" size={22} color="#9CA3AF" />
                  <Text style={styles.modalEmptyText}>No pending service requests</Text>
                </View>
              ) : (
                requests.map((r) => (
                  <View key={r.id} style={styles.modalItem}>
                    <View style={styles.modalItemLeft}>
                      <View style={styles.roomPill}>
                        <Text style={styles.roomPillText}>Room {r.roomNumber ?? "-"}</Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalItemTitle}>{r.type ?? "Service"}</Text>
                        <Text style={styles.modalItemSub}>
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
                  <View style={[styles.sectionIcon, { backgroundColor: "#16A34A" }]}>
                    <Ionicons name="restaurant-outline" size={16} color="#fff" />
                  </View>
                  <Text style={styles.modalSectionTitle}>Food Orders</Text>
                </View>
                <View style={styles.modalCountPill}>
                  <Text style={styles.modalCountText}>{orders.length}</Text>
                </View>
              </View>

              {orders.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Ionicons name="fast-food-outline" size={22} color="#9CA3AF" />
                  <Text style={styles.modalEmptyText}>No food orders</Text>
                </View>
              ) : (
                orders.map((o) => (
                  <View key={o.id} style={styles.modalItem}>
                    <View style={styles.modalItemLeft}>
                      <View style={styles.roomPill}>
                        <Text style={styles.roomPillText}>Room {o.roomNumber ?? "-"}</Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalItemTitle}>{o.items || o.item || "Food Order"}</Text>
                        <Text style={styles.modalItemSub}>
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

      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.backgroundDecor}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <View style={styles.bgCircle3} />
        </View>

        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.title}>Admin Dashboard</Text>
          </View>

          <View style={styles.headerRight}>
            <Pressable
              onPress={() => router.push("/modals/add-guest")}
              style={({ pressed }) => [
                styles.addButton,
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
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons name="notifications-outline" size={20} color="#2563EB" />
              {requests.length + orders.length > 0 ? (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{requests.length + orders.length}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Room Overview</Text>
            <View style={styles.roleBadge}>
              <Ionicons name="business-outline" size={14} color="#2563EB" />
              <Text style={styles.role}>HOTEL OPS</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <View style={styles.metricHeader}>
                <View style={[styles.dot, { backgroundColor: "#2563EB" }]} />
                <Text style={styles.metricLabel}>Active Rooms</Text>
              </View>
              <Text style={[styles.metricValue, { color: "#2563EB" }]}>{activeRooms}</Text>
              <Text style={styles.metricSubtext}>Currently occupied</Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricBox}>
              <View style={styles.metricHeader}>
                <View style={[styles.dot, { backgroundColor: "#16A34A" }]} />
                <Text style={styles.metricLabel}>Available</Text>
              </View>
              <Text style={[styles.metricValue, { color: "#16A34A" }]}>{availableRooms}</Text>
              <Text style={styles.metricSubtext}>Ready to check-in</Text>
            </View>
          </View>

          <Pressable
            onPress={() => setupRooms(101, 20)}
            style={({ pressed }) => [styles.setupBtn, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <Ionicons name="leaf-outline" size={18} color="#fff" />
            <Text style={styles.setupText}>Initialize Hotel Rooms</Text>
          </Pressable>
        </View>

        {/* SERVICE REQUESTS */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLeft}>
            <View style={styles.sectionIcon}>
              <Ionicons name="construct-outline" size={18} color="#fff" />
            </View>
            <Text style={styles.sectionTitle}>Service Requests</Text>
          </View>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{requests.length}</Text>
          </View>
        </View>

        {requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={24} color="#9CA3AF" />
            <Text style={styles.emptyText}>No pending requests</Text>
          </View>
        ) : (
          requests.map((r) => (
            <View key={r.id} style={styles.listItem}>
              <View style={styles.itemLeft}>
                <View style={styles.roomPill}>
                  <Text style={styles.roomPillText}>Room {r.roomNumber ?? "-"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{r.type ?? "Service"}</Text>
                  <Text style={styles.itemSub}>
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
            <View style={[styles.sectionIcon, { backgroundColor: "#16A34A" }]}>
              <Ionicons name="restaurant-outline" size={18} color="#fff" />
            </View>
            <Text style={styles.sectionTitle}>Food Orders</Text>
          </View>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{orders.length}</Text>
          </View>
        </View>

        {orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="fast-food-outline" size={24} color="#9CA3AF" />
            <Text style={styles.emptyText}>No active orders</Text>
          </View>
        ) : (
          orders.map((o) => (
            <View key={o.id} style={styles.listItem}>
              <View style={styles.itemLeft}>
                <View style={styles.roomPill}>
                  <Text style={styles.roomPillText}>Room {o.roomNumber ?? "-"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{o.items || o.item || "Food Order"}</Text>
                  <Text style={styles.itemSub}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16 },

  backgroundDecor: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  bgCircle1: {
    position: "absolute",
    top: -100,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  bgCircle2: {
    position: "absolute",
    top: 140,
    left: -100,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(37, 99, 235, 0.05)",
  },
  bgCircle3: {
    position: "absolute",
    bottom: 20,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
  },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  greeting: { color: "#6B7280", fontSize: 12, fontWeight: "600", letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  addText: { color: "#fff", fontWeight: "700" },

  notification: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#DC2626",
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  notifBadgeText: { color: "#fff", fontWeight: "900", fontSize: 10 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 16,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  role: { fontSize: 11, color: "#2563EB", fontWeight: "700", letterSpacing: 1.2 },

  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 14,
  },
  metricBox: { flex: 1 },
  metricHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metricLabel: { color: "#6B7280", fontWeight: "600", fontSize: 12 },
  metricValue: { marginTop: 6, fontSize: 28, fontWeight: "800" },
  metricSubtext: { marginTop: 2, color: "#9CA3AF", fontSize: 12 },
  metricDivider: { width: 1, height: 44, backgroundColor: "#E5E7EB", marginHorizontal: 12 },

  setupBtn: {
    backgroundColor: "#22C55E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  setupText: { color: "#fff", fontWeight: "700" },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 10 },
  sectionLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  sectionCount: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionCountText: { color: "#2563EB", fontWeight: "800" },

  emptyState: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyText: { color: "#9CA3AF", marginTop: 6, fontWeight: "600" },

  listItem: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  itemLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  roomPill: { backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  roomPillText: { color: "#111827", fontWeight: "700", fontSize: 12 },
  itemTitle: { color: "#374151", fontWeight: "700" },
  itemSub: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  itemRight: { alignItems: "flex-end" },

  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16A34A",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  acceptText: { color: "#fff", fontWeight: "900" },

  timeModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.60)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  timeModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10
  },
  timeModalHeader: { alignItems: "center", marginBottom: 24 },
  timeModalIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(37, 99, 235, 0.10)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  timeModalTitle: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 8, textAlign: "center" },
  timeModalSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", fontWeight: "600" },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  timeOption: { flex: 1, minWidth: 80, backgroundColor: "#F3F4F6", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 12, alignItems: "center", borderWidth: 2, borderColor: "#E5E7EB" },
  timeOptionActive: { backgroundColor: "rgba(37, 99, 235, 0.10)", borderColor: "#2563EB" },
  timeOptionText: { fontSize: 24, fontWeight: "800", color: "#111827" },
  timeOptionTextActive: { color: "#2563EB" },
  timeOptionLabel: { fontSize: 12, fontWeight: "700", color: "#6B7280", marginTop: 4 },
  timeOptionLabelActive: { color: "#2563EB" },
  timeModalActions: { flexDirection: "row", gap: 12 },
  timeCancelBtn: { flex: 1, backgroundColor: "#F3F4F6", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  timeCancelText: { color: "#6B7280", fontWeight: "800", fontSize: 16 },
  timeConfirmBtn: { flex: 1, backgroundColor: "#16A34A", paddingVertical: 14, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#16A34A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  timeConfirmText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    padding: Platform.OS === 'web' ? 20 : 0,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderRadius: Platform.OS === 'web' ? 22 : 0,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 18,
    maxHeight: "82%",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    width: Platform.OS === 'web' ? '100%' : undefined,
    maxWidth: Platform.OS === 'web' ? 500 : undefined,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  modalHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(37, 99, 235, 0.10)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  modalSubtitle: { fontSize: 12, fontWeight: "600", color: "#6B7280", marginTop: 2 },
  modalClose: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  modalBody: { marginTop: 12 },
  modalBodyContent: { paddingBottom: 22 },

  modalSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  modalSectionLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalSectionTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },
  modalCountPill: { backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  modalCountText: { color: "#111827", fontWeight: "900", fontSize: 12 },

  modalItem: { backgroundColor: "#FFFFFF", padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: "#E5E7EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modalItemLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  modalItemRight: { alignItems: "flex-end" },
  modalItemTitle: { color: "#374151", fontWeight: "800" },
  modalItemSub: { color: "#6B7280", fontSize: 12, marginTop: 2 },

  modalEmpty: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, padding: 16, alignItems: "center", marginBottom: 6 },
  modalEmptyText: { color: "#9CA3AF", fontWeight: "700", marginTop: 6 },
});