import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  Alert,
  Modal,
  AppState,
  Dimensions,
  Animated,
} from "react-native";
import { useEffect, useMemo, useState, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  serverTimestamp,
  writeBatch,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase/firebaseConfig";

type RequestStatus = "pending" | "in-progress" | "completed" | "archived";
type MealCategory = "breakfast" | "lunch" | "dinner";

type ServiceRequest = {
  id: string;
  adminId: string;
  type?: string;
  status?: RequestStatus;

  roomNumber?: number | string;
  guestName?: string;
  guestMobile?: string;

  mealCategory?: MealCategory;
  dishName?: string;
  notes?: string;
  quantity?: number;
  price?: number;

  estimatedTime?: number | null;
  acceptedAt?: any;
  readyAt?: any;

  createdAt?: any;
  updatedAt?: any;
  completedAt?: any;
  archivedAt?: any;
};

type Room = {
  id: string;
  roomNumber: number | string;
  status: "occupied" | "available" | "maintenance" | "dirty";
};

export default function Tracking() {
  const router = useRouter();
  const [user, setUser] = useState(auth.currentUser);
  const appState = useRef(AppState.currentState);
  const { width } = Dimensions.get("window");

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);

  const [filter, setFilter] = useState<
    "all" | "pending" | "in-progress" | "completed"
  >("all");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceRequest | null>(null);

  const [isDeletingOrders, setIsDeletingOrders] = useState(false);
  const [showArchivePrompt, setShowArchivePrompt] = useState(false);
  const [completedRequests, setCompletedRequests] = useState<ServiceRequest[]>(
    []
  );

  const lastAppForegroundTime = useRef<number | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => {
      subscription.remove();
    };
  }, [user]);

  const handleAppStateChange = async (nextAppState: string) => {
    if (nextAppState === "active" && appState.current !== "active") {
      if (user) {
        const now = Date.now();
        const lastTime = lastAppForegroundTime.current;
        if (lastTime && now - lastTime > 60 * 60 * 1000) {
          checkForArchivedRequests();
        }
      }
    }
    appState.current = nextAppState;
    if (nextAppState === "active") {
      lastAppForegroundTime.current = Date.now();
    }
  };

  const checkForArchivedRequests = async () => {
    if (!user) return;
    try {
      const qRef = query(
        collection(db, "serviceRequests"),
        where("adminId", "==", user.uid),
        where("status", "==", "completed")
      );
      const snap = await getDocs(qRef);
      const completedDocs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as ServiceRequest[];
      if (completedDocs.length > 0) {
        setCompletedRequests(completedDocs);
        setShowArchivePrompt(true);
      }
    } catch (e) {
      console.error("Check archived requests error:", e);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (!u) router.replace("/admin-login");
      else {
        lastAppForegroundTime.current = Date.now();
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const roomsRef = collection(db, "users", user.uid, "rooms");
    const unsubRooms = onSnapshot(
      roomsRef,
      (snap) => {
        const roomList: Room[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          const rawStatus = String(data.status || "available").toLowerCase();
          const status: Room["status"] =
            rawStatus === "occupied" ||
            rawStatus === "available" ||
            rawStatus === "maintenance" ||
            rawStatus === "dirty"
              ? rawStatus
              : "available";
          return {
            id: docSnap.id,
            roomNumber:
              data.roomNumber ?? data.room ?? data.number ?? docSnap.id,
            status,
          };
        });
        setRooms(roomList);
        setRoomsLoaded(true);
      },
      (err) => {
        console.error("Rooms snapshot error:", err);
        setRooms([]);
        setRoomsLoaded(false);
      }
    );
    return () => unsubRooms();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const qRef = query(
      collection(db, "serviceRequests"),
      where("adminId", "==", user.uid),
      where("status", "in", ["pending", "in-progress", "completed"])
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list: ServiceRequest[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        list.sort((a: any, b: any) => {
          const at = a?.createdAt?.toMillis?.() ?? 0;
          const bt = b?.createdAt?.toMillis?.() ?? 0;
          return bt - at;
        });
        setRequests(list);
      },
      (err) => {
        console.error("Requests snapshot error:", err);
        Alert.alert("Error", err?.message || "Failed to load tracking items.");
      }
    );
    return () => unsub();
  }, [user]);

  const grouped = useMemo(() => {
    const pending = requests.filter(
      (r) => (r.status || "pending") === "pending"
    );
    const inProgress = requests.filter(
      (r) => (r.status || "pending") === "in-progress"
    );
    const completed = requests.filter(
      (r) => (r.status || "pending") === "completed"
    );
    return { pending, inProgress, completed };
  }, [requests]);

  const filtered = useMemo(() => {
    const normalized = requests.map((r) => ({
      ...r,
      status: (r.status || "pending") as Exclude<RequestStatus, "archived">,
    }));
    if (filter === "all") {
      return normalized.filter(
        (r) => r.status === "pending" || r.status === "in-progress"
      );
    }
    return normalized.filter((r) => r.status === filter);
  }, [requests, filter]);

  const formatTime = (t: any) => {
    try {
      const d = t?.toDate?.();
      return d ? d.toLocaleString() : "—";
    } catch {
      return "—";
    }
  };

  const remainingText = (
    readyAt: any,
    estimatedTime: any,
    acceptedAt: any
  ) => {
    try {
      const dt = readyAt?.toDate?.();
      if (dt) {
        const diff = dt.getTime() - Date.now();
        if (diff <= 0) return "Ready now";
        const mins = Math.ceil(diff / 60000);
        return `Ready in ${mins} min`;
      }
      const accepted = acceptedAt?.toDate?.();
      if (accepted && estimatedTime) {
        const endTime = accepted.getTime() + estimatedTime * 60 * 1000;
        const diff = endTime - Date.now();
        if (diff <= 0) return "Ready now";
        const mins = Math.ceil(diff / 60000);
        return `Ready in ${mins} min`;
      }
      return "ETA not set";
    } catch {
      return "ETA not set";
    }
  };

  const getProgress = (r: ServiceRequest) => {
    const status = (r.status || "pending") as RequestStatus;
    if (status === "completed" || status === "archived") return 100;
    if (status === "pending") return 0;
    try {
      const acceptedAt = r.acceptedAt?.toDate?.();
      const estimatedTime = r.estimatedTime || 0;
      if (!acceptedAt || !estimatedTime) return 0;
      const now = Date.now();
      const start = acceptedAt.getTime();
      const total = estimatedTime * 60 * 1000;
      const end = start + total;
      if (now >= end) return 100;
      const elapsed = now - start;
      return Math.round(Math.min(Math.max((elapsed / total) * 100, 0), 100));
    } catch {
      return 0;
    }
  };

  const statusColors = (status?: string) => {
    const s = (status || "pending").toLowerCase();
    if (s === "completed" || s === "archived")
      return { bg: "rgba(22, 163, 74, 0.12)", text: "#16A34A" };
    if (s === "in-progress")
      return { bg: "rgba(37, 99, 235, 0.12)", text: "#2563EB" };
    return { bg: "rgba(245, 158, 11, 0.14)", text: "#F59E0B" };
  };

  const getStatusIcon = (status?: string): any => {
    const s = (status || "pending").toLowerCase();
    if (s === "completed") return "checkmark-circle";
    if (s === "in-progress") return "sync-circle";
    return "hourglass-outline";
  };

// ✅ FIXED: Complete without redirecting to Done tab
const updateStatus = async (id: string, next: Exclude<RequestStatus, "archived">) => {
  try {
    const updates: any = {
      status: next,
      updatedAt: serverTimestamp(),
    };

    if (next === "in-progress") {
      updates.acceptedAt = serverTimestamp();
      await updateDoc(doc(db, "serviceRequests", id), updates);
      Alert.alert("✅ Started", "Request is now in progress.", [{ text: "OK" }]);
    }
    
    if (next === "completed") {
      updates.completedAt = serverTimestamp();
      
      // First, get the current request data
      const requestDoc = await getDocs(query(
        collection(db, "serviceRequests"),
        where("__name__", "==", id)
      ));
      
      if (!requestDoc.empty) {
        const requestData = requestDoc.docs[0].data();
        
        // Update service request
        await updateDoc(doc(db, "serviceRequests", id), updates);
        
        // If it's a Food Order, also update the corresponding order in 'orders' collection
        if (requestData.type === "Food Order") {
          try {
            const orderRef = doc(db, "orders", id);
            
            // Try to update existing order
            await updateDoc(orderRef, {
              status: "completed",
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              estimatedTime: requestData.estimatedTime || null,
              readyAt: requestData.readyAt || null,
            }).catch(async () => {
              // If order doesn't exist in 'orders' collection, create it
              // (this handles cases where the order was created before we added the sync)
              await setDoc(orderRef, {
                adminId: user?.uid,
                type: "Food Order",
                status: "completed",
                roomNumber: requestData.roomNumber,
                guestName: requestData.guestName || "Guest",
                guestMobile: requestData.guestMobile || "",
                dishName: requestData.dishName || "Food Order",
                mealCategory: requestData.mealCategory || "lunch",
                notes: requestData.notes || "",
                quantity: requestData.quantity || 1,
                price: requestData.price || 0,
                estimatedTime: requestData.estimatedTime || null,
                readyAt: requestData.readyAt || null,
                acceptedAt: requestData.acceptedAt || serverTimestamp(),
                completedAt: serverTimestamp(),
                createdAt: requestData.createdAt || serverTimestamp(),
                updatedAt: serverTimestamp(),
                source: "admin",
                serviceRequestId: id,
              });
            });
          } catch (error) {
            console.log("Error updating order in 'orders' collection:", error);
            // Continue even if order update fails
          }
        }
      } else {
        // If we can't find the request, just update it directly
        await updateDoc(doc(db, "serviceRequests", id), updates);
      }
      
      Alert.alert(
        "✅ Completed", 
        "Request marked as completed. It will now appear in the Done tab.",
        [{ text: "OK" }]
      );
    }
  } catch (e: any) {
    console.error("Update status failed:", e);
    Alert.alert("Error", e?.message || "Failed to update status.");
  }
};

  const archiveCompleted = async () => {
    if (completedRequests.length === 0) {
      Alert.alert("Info", "No completed requests to archive.");
      return;
    }
    try {
      const batch = writeBatch(db);
      completedRequests.forEach((r) => {
        batch.update(doc(db, "serviceRequests", r.id), {
          status: "archived",
          archivedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      Alert.alert(
        "Success",
        `${completedRequests.length} completed request${completedRequests.length === 1 ? "" : "s"} archived.`
      );
      setCompletedRequests([]);
      setShowArchivePrompt(false);
    } catch (e: any) {
      console.error("Archive error:", e);
      Alert.alert("Error", e?.message || "Failed to archive requests.");
    }
  };

  const deleteArchived = async () => {
    if (!user) return;
    try {
      setIsDeletingOrders(true);
      const qRef = query(
        collection(db, "serviceRequests"),
        where("adminId", "==", user.uid),
        where("status", "==", "archived")
      );
      const snap = await getDocs(qRef);
      const toDelete = snap.docs.map((d) => d.id);
      if (toDelete.length === 0) {
        Alert.alert("Info", "No archived requests to delete.");
        return;
      }
      Alert.alert(
        "Delete Archived Requests",
        `Delete ${toDelete.length} archived request${toDelete.length === 1 ? "" : "s"}? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const batch = writeBatch(db);
                toDelete.forEach((id) =>
                  batch.delete(doc(db, "serviceRequests", id))
                );
                await batch.commit();
                Alert.alert("Success", "Archived requests deleted.");
              } catch (e: any) {
                console.error("Delete error:", e);
                Alert.alert(
                  "Error",
                  e?.message || "Failed to delete requests."
                );
              } finally {
                setIsDeletingOrders(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      console.error("Delete archived error:", e);
      Alert.alert(
        "Error",
        e?.message || "Failed to load archived requests."
      );
      setIsDeletingOrders(false);
    }
  };

  const openDetails = (r: ServiceRequest) => {
    setSelected(r);
    setDetailsOpen(true);
  };

  const cleanupCheckedOutFoodOrders = async () => {
    if (!user) return;
    try {
      setIsDeletingOrders(true);
      const occupiedRoomNumbers = rooms
        .filter((r) => r.status === "occupied")
        .map((r) => String(r.roomNumber));
      const qRef = query(
        collection(db, "serviceRequests"),
        where("adminId", "==", user.uid),
        where("status", "in", ["pending", "in-progress"])
      );
      const snap = await getDocs(qRef);
      const toDelete: { id: string; roomNumber: string }[] = [];
      snap.docs.forEach((docSnap) => {
        const data: any = docSnap.data();
        if (data.type !== "Food Order") return;
        const room = String(data.roomNumber ?? "");
        if (!occupiedRoomNumbers.includes(room)) {
          toDelete.push({ id: docSnap.id, roomNumber: room });
        }
      });
      if (toDelete.length === 0) {
        Alert.alert(
          "No Cleanup Needed",
          "All active food orders belong to occupied rooms."
        );
        return;
      }
      Alert.alert(
        "Cleanup Food Orders",
        `Found ${toDelete.length} active food order${toDelete.length === 1 ? "" : "s"} for non-occupied rooms. Delete them?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const batch = writeBatch(db);
                toDelete.forEach((o) =>
                  batch.delete(doc(db, "serviceRequests", o.id))
                );
                await batch.commit();
                Alert.alert(
                  "Success",
                  `${toDelete.length} order${toDelete.length === 1 ? "" : "s"} deleted.`
                );
              } catch (e: any) {
                console.error("Delete error:", e);
                Alert.alert("Error", e?.message || "Failed to delete orders.");
              } finally {
                setIsDeletingOrders(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      console.error("Cleanup error:", e);
      Alert.alert("Error", e?.message || "Cleanup failed.");
      setIsDeletingOrders(false);
    }
  };

  const occupiedCount = rooms.filter((r) => r.status === "occupied").length;
  const availableCount = rooms.filter((r) => r.status === "available").length;

  const isSmallScreen = width < 375;
  const fontSizeMultiplier = isSmallScreen ? 0.85 : 1;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Archive Prompt Modal */}
      <Modal
        visible={showArchivePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowArchivePrompt(false)}
      >
        <View style={styles.archiveOverlay}>
          <View style={styles.archiveCard}>
            <View style={styles.archiveIconWrap}>
              <View style={styles.archiveIconRing}>
                <Ionicons name="archive-outline" size={30} color="#16A34A" />
              </View>
            </View>

            <Text style={styles.archiveTitle}>
              Archive Completed Requests?
            </Text>

            <Text style={styles.archiveMessage}>
              You have {completedRequests.length} completed request
              {completedRequests.length === 1 ? "" : "s"} waiting to be
              archived.
            </Text>

            <Text style={styles.archiveSubtext}>
              Archiving will move them out of active tracking. You can delete
              archived requests anytime.
            </Text>

            <View style={styles.archiveButtons}>
              <Pressable
                onPress={() => setShowArchivePrompt(false)}
                style={({ pressed }) => [
                  styles.archiveBtnBase,
                  styles.archiveBtnCancel,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={styles.archiveBtnCancelText}>Dismiss</Text>
              </Pressable>

              <Pressable
                onPress={archiveCompleted}
                style={({ pressed }) => [
                  styles.archiveBtnBase,
                  styles.archiveBtnAction,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="checkmark-done" size={16} color="#fff" />
                <Text style={styles.archiveBtnActionText}>Archive All</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Details Modal */}
      <Modal
        visible={detailsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalHeaderIcon}>
                  <Ionicons
                    name="document-text-outline"
                    size={18}
                    color="#2563EB"
                  />
                </View>
                <Text style={styles.modalTitle}>Request Details</Text>
              </View>
              <Pressable
                onPress={() => setDetailsOpen(false)}
                style={({ pressed }) => [
                  styles.modalClose,
                  pressed && { opacity: 0.7, backgroundColor: "#E5E7EB" },
                ]}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </View>

            {selected ? (
              <ScrollView
                style={styles.modalBody}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalBodyContent}
              >
                {/* Status Banner */}
                <View
                  style={[
                    styles.modalStatusBanner,
                    {
                      backgroundColor: statusColors(selected.status).bg,
                      borderLeftColor: statusColors(selected.status).text,
                    },
                  ]}
                >
                  <Ionicons
                    name={getStatusIcon(selected.status)}
                    size={18}
                    color={statusColors(selected.status).text}
                  />
                  <Text
                    style={[
                      styles.modalStatusText,
                      { color: statusColors(selected.status).text },
                    ]}
                  >
                    {(selected.status ?? "pending").toUpperCase()}
                  </Text>
                </View>

                <View style={styles.detailGrid}>
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconWrap}>
                      <Ionicons
                        name="layers-outline"
                        size={16}
                        color="#6B7280"
                      />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Type</Text>
                      <Text style={styles.detailValue}>
                        {selected.type ?? "—"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailDivider} />

                  <View style={styles.detailRow}>
                    <View style={styles.detailIconWrap}>
                      <Ionicons name="bed-outline" size={16} color="#6B7280" />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Room</Text>
                      <Text style={styles.detailValue}>
                        Room {selected.roomNumber ?? "—"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailDivider} />

                  <View style={styles.detailRow}>
                    <View style={styles.detailIconWrap}>
                      <Ionicons
                        name="person-outline"
                        size={16}
                        color="#6B7280"
                      />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Guest</Text>
                      <Text style={styles.detailValue}>
                        {selected.guestName ?? "—"}
                        {selected.guestMobile
                          ? ` • ${selected.guestMobile}`
                          : ""}
                      </Text>
                    </View>
                  </View>

                  {selected.type === "Food Order" ? (
                    <>
                      <View style={styles.detailDivider} />
                      <View style={styles.detailRow}>
                        <View style={styles.detailIconWrap}>
                          <Ionicons
                            name="restaurant-outline"
                            size={16}
                            color="#6B7280"
                          />
                        </View>
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Dish</Text>
                          <Text style={styles.detailValue}>
                            {selected.dishName ?? "—"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.detailDivider} />
                      <View style={styles.detailRow}>
                        <View style={styles.detailIconWrap}>
                          <Ionicons
                            name="fast-food-outline"
                            size={16}
                            color="#6B7280"
                          />
                        </View>
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Meal Category</Text>
                          <Text style={styles.detailValue}>
                            {selected.mealCategory ?? "—"}
                          </Text>
                        </View>
                      </View>

                      {selected.quantity && (
                        <>
                          <View style={styles.detailDivider} />
                          <View style={styles.detailRow}>
                            <View style={styles.detailIconWrap}>
                              <Ionicons
                                name="copy-outline"
                                size={16}
                                color="#6B7280"
                              />
                            </View>
                            <View style={styles.detailContent}>
                              <Text style={styles.detailLabel}>Quantity</Text>
                              <Text style={styles.detailValue}>
                                {selected.quantity}
                              </Text>
                            </View>
                          </View>
                        </>
                      )}

                      {selected.price && (
                        <>
                          <View style={styles.detailDivider} />
                          <View style={styles.detailRow}>
                            <View style={styles.detailIconWrap}>
                              <Ionicons
                                name="pricetag-outline"
                                size={16}
                                color="#6B7280"
                              />
                            </View>
                            <View style={styles.detailContent}>
                              <Text style={styles.detailLabel}>Price</Text>
                              <Text style={styles.detailValue}>
                                ₹{selected.price}
                              </Text>
                            </View>
                          </View>
                        </>
                      )}

                      <View style={styles.detailDivider} />
                      <View style={styles.detailRow}>
                        <View style={styles.detailIconWrap}>
                          <Ionicons
                            name="timer-outline"
                            size={16}
                            color="#6B7280"
                          />
                        </View>
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Estimated Time</Text>
                          <Text style={styles.detailValue}>
                            {selected.estimatedTime
                              ? `${selected.estimatedTime} minutes`
                              : "—"}
                          </Text>
                        </View>
                      </View>

                      {selected.status !== "completed" &&
                      selected.status !== "archived" ? (
                        <>
                          <View style={styles.detailDivider} />
                          <View style={styles.detailRow}>
                            <View style={styles.detailIconWrap}>
                              <Ionicons
                                name="hourglass-outline"
                                size={16}
                                color="#6B7280"
                              />
                            </View>
                            <View style={styles.detailContent}>
                              <Text style={styles.detailLabel}>ETA</Text>
                              <Text
                                style={[
                                  styles.detailValue,
                                  { color: "#2563EB", fontWeight: "900" },
                                ]}
                              >
                                {remainingText(
                                  selected.readyAt,
                                  selected.estimatedTime,
                                  selected.acceptedAt
                                )}
                              </Text>
                            </View>
                          </View>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>

                {selected.notes ? (
                  <View style={styles.notesContainer}>
                    <View style={styles.notesHeader}>
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={14}
                        color="#F59E0B"
                      />
                      <Text style={styles.notesLabel}>Notes</Text>
                    </View>
                    <View style={styles.notesBox}>
                      <Text style={styles.notesText}>{selected.notes}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.timestampCard}>
                  <Text style={styles.timestampTitle}>Timeline</Text>
                  <View style={styles.timelineContainer}>
                    <View style={styles.timelineLine} />
                    <View style={styles.timestampRow}>
                      <View style={styles.timestampDot} />
                      <View style={styles.timestampContent}>
                        <Text style={styles.timestampLabel}>Created</Text>
                        <Text style={styles.timestampValue}>
                          {formatTime(selected.createdAt)}
                        </Text>
                      </View>
                    </View>
                    {selected.acceptedAt ? (
                      <View style={styles.timestampRow}>
                        <View
                          style={[
                            styles.timestampDot,
                            { backgroundColor: "#2563EB" },
                          ]}
                        />
                        <View style={styles.timestampContent}>
                          <Text style={styles.timestampLabel}>Accepted</Text>
                          <Text style={styles.timestampValue}>
                            {formatTime(selected.acceptedAt)}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    {selected.completedAt ? (
                      <View style={styles.timestampRow}>
                        <View
                          style={[
                            styles.timestampDot,
                            { backgroundColor: "#16A34A" },
                          ]}
                        />
                        <View style={styles.timestampContent}>
                          <Text style={styles.timestampLabel}>Completed</Text>
                          <Text style={styles.timestampValue}>
                            {formatTime(selected.completedAt)}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <View style={styles.headerContent}>
            <View style={styles.headerTitleRow}>
              <Animated.View
                style={[
                  styles.liveDot,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              />
              <Text
                style={[
                  styles.greeting,
                  { fontSize: 11 * fontSizeMultiplier },
                ]}
              >
                LIVE TRACKING
              </Text>
            </View>
            <Text
              style={[
                styles.title,
                { fontSize: Math.min(24 * fontSizeMultiplier, 26) },
              ]}
            >
              Service Requests
            </Text>
          </View>

          <View style={styles.headerRight}>
            <Pressable
              onPress={cleanupCheckedOutFoodOrders}
              disabled={isDeletingOrders || !roomsLoaded}
              style={({ pressed }) => [
                styles.headerActionBtn,
                styles.cleanupBtn,
                (isDeletingOrders || !roomsLoaded) &&
                  styles.cleanupBtnDisabled,
                pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
              ]}
            >
              <Ionicons
                name={isDeletingOrders ? "refresh" : "trash-outline"}
                size={16 * fontSizeMultiplier}
                color="#DC2626"
              />
            </Pressable>

            <Pressable
              onPress={deleteArchived}
              disabled={isDeletingOrders || !roomsLoaded}
              style={({ pressed }) => [
                styles.headerActionBtn,
                styles.archiveBtnSmall,
                (isDeletingOrders || !roomsLoaded) &&
                  styles.cleanupBtnDisabled,
                pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
              ]}
            >
              <Ionicons
                name="archive-outline"
                size={16 * fontSizeMultiplier}
                color="#7C3AED"
              />
            </Pressable>
          </View>
        </Animated.View>

        {/* Info Strip */}
        <Animated.View style={[styles.infoStrip, { opacity: fadeAnim }]}>
          <View style={styles.infoLeft}>
            <View style={styles.infoItem}>
              <View
                style={[styles.infoDotSmall, { backgroundColor: "#16A34A" }]}
              />
              <Text
                style={[
                  styles.infoText,
                  { fontSize: 12 * fontSizeMultiplier },
                ]}
              >
                {occupiedCount} occupied
              </Text>
            </View>
            <View style={styles.infoSeparator} />
            <View style={styles.infoItem}>
              <View
                style={[styles.infoDotSmall, { backgroundColor: "#2563EB" }]}
              />
              <Text
                style={[
                  styles.infoText,
                  { fontSize: 12 * fontSizeMultiplier },
                ]}
              >
                {availableCount} available
              </Text>
            </View>
          </View>
          <View style={styles.activeBadge}>
            <Ionicons
              name="pulse"
              size={12 * fontSizeMultiplier}
              color="#2563EB"
            />
            <Text
              style={[
                styles.syncText,
                { fontSize: 11 * fontSizeMultiplier },
              ]}
            >
              {requests.length}
            </Text>
          </View>
        </Animated.View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard
            label="Pending"
            value={grouped.pending.length}
            color="#F59E0B"
            icon="hourglass-outline"
            fontSizeMultiplier={fontSizeMultiplier}
          />
          <StatCard
            label="Active"
            value={grouped.inProgress.length}
            color="#2563EB"
            icon="sync-outline"
            fontSizeMultiplier={fontSizeMultiplier}
          />
          <StatCard
            label="Done"
            value={grouped.completed.length}
            color="#16A34A"
            icon="checkmark-done-outline"
            fontSizeMultiplier={fontSizeMultiplier}
          />
        </View>

        {/* Filters */}
        <View style={styles.filterTabs}>
          {[
            {
              key: "all",
              label: "Active",
              count: grouped.pending.length + grouped.inProgress.length,
              icon: "flash-outline",
            },
            {
              key: "pending",
              label: "Pending",
              count: grouped.pending.length,
              icon: "hourglass-outline",
            },
            {
              key: "in-progress",
              label: "Progress",
              count: grouped.inProgress.length,
              icon: "sync-outline",
            },
            {
              key: "completed",
              label: "Done",
              count: grouped.completed.length,
              icon: "checkmark-done-outline",
            },
          ].map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setFilter(t.key as any)}
              style={({ pressed }) => [
                styles.filterTab,
                filter === t.key && styles.filterTabActive,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons
                name={t.icon as any}
                size={13 * fontSizeMultiplier}
                color={filter === t.key ? "#fff" : "#9CA3AF"}
              />
              <Text
                style={[
                  styles.filterTabText,
                  filter === t.key && styles.filterTabTextActive,
                  { fontSize: 11 * fontSizeMultiplier },
                ]}
                numberOfLines={1}
              >
                {t.count}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Content */}
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons
                name="inbox-outline"
                size={40 * fontSizeMultiplier}
                color="#D1D5DB"
              />
            </View>
            <Text
              style={[
                styles.emptyText,
                { fontSize: 17 * fontSizeMultiplier },
              ]}
            >
              All Clear
            </Text>
            <Text
              style={[
                styles.emptySub,
                { fontSize: 13 * fontSizeMultiplier },
              ]}
            >
              No matching requests for this filter.
            </Text>
          </View>
        ) : (
          filtered.map((r) => {
            const c = statusColors(r.status);
            const status = (r.status || "pending").toUpperCase();

            const title =
              r.type === "Food Order"
                ? r.dishName || "Food Order"
                : r.type || "Service Request";

            const progress = getProgress(r);
            const isCompleted = r.status === "completed";
            const isPending = (r.status || "pending") === "pending";

            const showProgressBar =
              r.type === "Food Order" &&
              !isPending &&
              !isCompleted &&
              (r.estimatedTime || 0) > 0;

            const typeIcon: any =
              r.type === "Food Order"
                ? "restaurant-outline"
                : r.type === "Housekeeping"
                  ? "sparkles-outline"
                  : r.type === "Maintenance"
                    ? "construct-outline"
                    : "ellipsis-horizontal-circle-outline";

            return (
              <Pressable
                key={r.id}
                onPress={() => openDetails(r)}
                style={({ pressed }) => [
                  styles.card,
                  pressed && {
                    opacity: 0.97,
                    transform: [{ scale: 0.985 }],
                  },
                  isPending && styles.cardPending,
                  r.status === "in-progress" && styles.cardInProgress,
                  isCompleted && styles.cardCompleted,
                ]}
              >
                {/* Card Header */}
                <View style={styles.cardTop}>
                  <View style={styles.cardTopLeft}>
                    <View
                      style={[
                        styles.typeIconWrap,
                        { backgroundColor: c.bg },
                      ]}
                    >
                      <Ionicons
                        name={typeIcon}
                        size={14 * fontSizeMultiplier}
                        color={c.text}
                      />
                    </View>
                    <View style={styles.roomPill}>
                      <Ionicons
                        name="bed"
                        size={11 * fontSizeMultiplier}
                        color="#6B7280"
                      />
                      <Text
                        style={[
                          styles.roomPillText,
                          { fontSize: 11 * fontSizeMultiplier },
                        ]}
                      >
                        {r.roomNumber ?? "—"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardTopRight}>
                    <View
                      style={[styles.statusPill, { backgroundColor: c.bg }]}
                    >
                      <Ionicons
                        name={getStatusIcon(r.status)}
                        size={10 * fontSizeMultiplier}
                        color={c.text}
                      />
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color: c.text,
                            fontSize: 10 * fontSizeMultiplier,
                          },
                        ]}
                      >
                        {status}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.detailsBtn}
                      onPress={() => openDetails(r)}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={14 * fontSizeMultiplier}
                        color="#9CA3AF"
                      />
                    </Pressable>
                  </View>
                </View>

                {/* Card Body */}
                <Text
                  style={[
                    styles.cardTitle,
                    { fontSize: 16 * fontSizeMultiplier },
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>

                <Text
                  style={[
                    styles.cardSub,
                    { fontSize: 12 * fontSizeMultiplier },
                  ]}
                  numberOfLines={1}
                >
                  {r.type === "Food Order"
                    ? r.mealCategory
                      ? `${r.mealCategory.charAt(0).toUpperCase() + r.mealCategory.slice(1)}`
                      : "Meal"
                    : r.type ?? "Service"}
                  {r.guestName ? ` · ${r.guestName}` : ""}
                  {r.quantity ? ` · Qty: ${r.quantity}` : ""}
                </Text>

                {/* Progress */}
                {showProgressBar ? (
                  <View style={styles.progressContainer}>
                    <View style={styles.progressTrack}>
                      <Animated.View
                        style={[
                          styles.progressFill,
                          {
                            width: `${progress}%`,
                            backgroundColor:
                              progress >= 80 ? "#16A34A" : "#2563EB",
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.progressText,
                        { fontSize: 11 * fontSizeMultiplier },
                      ]}
                    >
                      {progress}%
                    </Text>
                  </View>
                ) : null}

                {/* ETA / Time */}
                <View style={styles.cardMeta}>
                  <View style={styles.cardMetaLeft}>
                    <Ionicons
                      name="time-outline"
                      size={13 * fontSizeMultiplier}
                      color="#9CA3AF"
                    />
                    {isPending ? (
                      <Text
                        style={[
                          styles.timeText,
                          { fontSize: 11 * fontSizeMultiplier },
                        ]}
                      >
                        Awaiting action
                      </Text>
                    ) : !isCompleted ? (
                      <Text
                        style={[
                          styles.timeText,
                          {
                            fontSize: 11 * fontSizeMultiplier,
                            color: "#2563EB",
                          },
                        ]}
                      >
                        {r.type === "Food Order"
                          ? remainingText(
                              r.readyAt,
                              r.estimatedTime,
                              r.acceptedAt
                            )
                          : "In progress"}
                      </Text>
                    ) : (
                      <Text
                        style={[
                          styles.timeText,
                          {
                            color: "#16A34A",
                            fontSize: 11 * fontSizeMultiplier,
                          },
                        ]}
                      >
                        Completed
                      </Text>
                    )}
                  </View>

                  {r.price ? (
                    <Text
                      style={[
                        styles.priceTag,
                        { fontSize: 12 * fontSizeMultiplier },
                      ]}
                    >
                      ₹{r.price}
                    </Text>
                  ) : null}
                </View>

                {/* Actions */}
                {!isCompleted ? (
                  <View style={styles.actionsRow}>
                    {isPending ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.actionBtn,
                          styles.actionBlue,
                          pressed && {
                            opacity: 0.9,
                            transform: [{ scale: 0.97 }],
                          },
                        ]}
                        onPress={() => updateStatus(r.id, "in-progress")}
                      >
                        <Ionicons
                          name="play"
                          size={15 * fontSizeMultiplier}
                          color="#fff"
                        />
                        <Text
                          style={[
                            styles.actionText,
                            { fontSize: 13 * fontSizeMultiplier },
                          ]}
                        >
                          Start
                        </Text>
                      </Pressable>
                    ) : null}

                    {r.status === "in-progress" ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.actionBtn,
                          styles.actionGreen,
                          pressed && {
                            opacity: 0.9,
                            transform: [{ scale: 0.97 }],
                          },
                        ]}
                        onPress={() => updateStatus(r.id, "completed")}
                      >
                        <Ionicons
                          name="checkmark-done"
                          size={15 * fontSizeMultiplier}
                          color="#fff"
                        />
                        <Text
                          style={[
                            styles.actionText,
                            { fontSize: 13 * fontSizeMultiplier },
                          ]}
                        >
                          Complete
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}

        <View style={styles.spacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
  fontSizeMultiplier = 1,
}: {
  label: string;
  value: number;
  color: string;
  icon: any;
  fontSizeMultiplier: number;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBg, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={20 * fontSizeMultiplier} color={color} />
      </View>
      <Text
        style={[
          styles.statNumber,
          { fontSize: 24 * fontSizeMultiplier, color },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, { fontSize: 10 * fontSizeMultiplier }]}>
        {label}
      </Text>
      <View style={[styles.statAccent, { backgroundColor: color }]} />
    </View>
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
  },
  content: {
    padding: 16,
    paddingBottom: 30,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 10,
  },
  headerContent: {
    flex: 1,
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  greeting: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#9CA3AF",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -0.5,
    lineHeight: 30,
  },

  headerActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  cleanupBtn: {
    backgroundColor: "rgba(220, 38, 38, 0.05)",
    borderColor: "rgba(220, 38, 38, 0.12)",
  },
  cleanupBtnDisabled: { opacity: 0.4 },

  archiveBtnSmall: {
    backgroundColor: "rgba(124, 58, 237, 0.05)",
    borderColor: "rgba(124, 58, 237, 0.12)",
  },

  // Info Strip
  infoStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  infoSeparator: {
    width: 1,
    height: 16,
    backgroundColor: "#E5E7EB",
  },
  infoText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
    lineHeight: 16,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  syncText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#2563EB",
    lineHeight: 14,
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
    minHeight: 110,
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  statIconBg: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
    lineHeight: 28,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#9CA3AF",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statAccent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  statContent: { flex: 1 },

  // Filters
  filterTabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
    gap: 3,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
    minHeight: 44,
  },
  filterTabActive: {
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#9CA3AF",
    textAlign: "center",
  },
  filterTabTextActive: { color: "#fff" },

  // Empty
  emptyState: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 22,
    padding: 44,
    alignItems: "center",
    marginVertical: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
    fontWeight: "600",
  },

  // Cards
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardPending: {
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  cardInProgress: {
    borderLeftWidth: 3,
    borderLeftColor: "#2563EB",
  },
  cardCompleted: {
    borderLeftWidth: 3,
    borderLeftColor: "#16A34A",
    opacity: 0.8,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  roomPill: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  roomPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4B5563",
  },
  detailsBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "600",
    marginBottom: 12,
    lineHeight: 17,
  },

  // Progress
  progressContainer: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: "#F3F4F6",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#6B7280",
    minWidth: 35,
    textAlign: "right",
  },

  // Card Meta
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardMetaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  priceTag: {
    fontSize: 13,
    fontWeight: "900",
    color: "#374151",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  cardBottom: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  timeText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "700",
  },

  // Actions
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    marginTop: 2,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  actionBlue: {
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  actionGreen: {
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  actionText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    maxHeight: "88%",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -0.3,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: {
    maxHeight: "80%",
  },
  modalBodyContent: {
    padding: 20,
    paddingBottom: 34,
  },

  // Modal Status Banner
  modalStatusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    borderLeftWidth: 4,
    marginBottom: 20,
  },
  modalStatusText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },

  // Detail Grid
  detailGrid: {
    backgroundColor: "#FAFBFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    overflow: "hidden",
    marginBottom: 18,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  detailIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  detailContent: {
    flex: 1,
  },
  detailDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginHorizontal: 16,
  },

  detailSection: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#9CA3AF",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    lineHeight: 20,
  },

  // Notes
  notesContainer: {
    marginBottom: 18,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#F59E0B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notesBox: {
    backgroundColor: "#FFFBEB",
    padding: 16,
    borderRadius: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.12)",
  },
  notesText: {
    fontSize: 13,
    color: "#92400E",
    fontWeight: "600",
    lineHeight: 20,
  },

  // Timestamps
  timestampCard: {
    backgroundColor: "#FAFBFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    padding: 18,
  },
  timestampTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  timelineContainer: {
    position: "relative",
    paddingLeft: 4,
  },
  timelineLine: {
    position: "absolute",
    left: 8,
    top: 12,
    bottom: 12,
    width: 2,
    backgroundColor: "#E5E7EB",
    borderRadius: 1,
  },
  timestampRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  timestampDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#D1D5DB",
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 1,
  },
  timestampContent: {
    flex: 1,
  },
  timestampLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    marginBottom: 2,
  },
  timestampValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },

  // Archive Modal
  archiveOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  archiveCard: {
    backgroundColor: "#fff",
    borderRadius: 26,
    padding: 30,
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 10,
  },
  archiveIconWrap: {
    marginBottom: 20,
  },
  archiveIconRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(22, 163, 74, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(22, 163, 74, 0.12)",
  },
  archiveTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  archiveMessage: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    marginBottom: 6,
    textAlign: "center",
    lineHeight: 21,
  },
  archiveSubtext: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
    marginBottom: 26,
    textAlign: "center",
    lineHeight: 18,
  },
  archiveButtons: {
    width: "100%",
    gap: 10,
  },
  archiveBtnBase: {
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
  },
  archiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.18)",
    minHeight: 36,
  },
  archiveBtnCancel: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  archiveBtnCancelText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#6B7280",
  },
  archiveBtnAction: {
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  archiveBtnActionText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
  },

  archiveText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#2563EB",
    lineHeight: 13,
  },
  cleanupText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#DC2626",
    lineHeight: 13,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    minHeight: 36,
  },
  role: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "#2563EB",
    lineHeight: 13,
  },

  spacer: { height: 20 },
});