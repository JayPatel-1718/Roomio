import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  SafeAreaView,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  Timestamp,
  query,
  where,
  getDocs,
  serverTimestamp,
  writeBatch,
  addDoc,
} from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";
import { useRouter } from "expo-router";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

type Room = {
  id: string;
  roomNumber: number;
  floorNumber?: number;
  status: "occupied" | "available";
  guestName?: string | null;
  guestMobile?: string | null;
  checkoutAt?: Timestamp | null;
  guestId?: string | null;
  assignedAt?: Timestamp | null;
};

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  variant: "destructive" | "primary";
  onConfirm?: () => void | Promise<void>;
};

const padRoom = (n: number) => (n < 100 ? String(n).padStart(3, "0") : String(n));

const getFloorFromRoom = (r: Room) => {
  if (typeof r.floorNumber === "number") return r.floorNumber;
  return r.roomNumber >= 100 ? Math.floor(r.roomNumber / 100) : 0;
};

const floorLabel = (floor: number) => (floor === 0 ? "Ground Floor" : `Floor ${floor}`);

export default function RoomsScreen() {
  const auth = getAuth();
  const user = auth.currentUser;
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Floor expand state
  const [openFloors, setOpenFloors] = useState<Record<number, boolean>>({});

  // Edit/Init Room modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestMobile, setGuestMobile] = useState("");
  const [editCheckinDate, setEditCheckinDate] = useState<Date>(new Date());
  const [checkoutDate, setCheckoutDate] = useState<Date>(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(11, 0, 0, 0);
    return t;
  });
  const [initializing, setInitializing] = useState(false);

  // iOS picker modals
  const [showEditCheckinPicker, setShowEditCheckinPicker] = useState(false);
  const [showEditCheckoutPicker, setShowEditCheckoutPicker] = useState(false);
  const [iosTempEditCheckin, setIosTempEditCheckin] = useState<Date>(new Date());
  const [iosTempEditCheckout, setIosTempEditCheckout] = useState<Date>(new Date());

  // Web confirm modal
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    variant: "primary",
  });
  const [confirmBusy, setConfirmBusy] = useState(false);

  const askConfirm = (cfg: Omit<ConfirmState, "open">) => {
    if (Platform.OS !== "web") {
      Alert.alert(cfg.title, cfg.message, [
        { text: "Cancel", style: "cancel" },
        {
          text: cfg.confirmText,
          style: cfg.variant === "destructive" ? "destructive" : "default",
          onPress: cfg.onConfirm,
        },
      ]);
      return;
    }
    setConfirm({ open: true, ...cfg });
  };

  const closeConfirm = () => {
    setConfirm((c) => ({ ...c, open: false }));
    setConfirmBusy(false);
  };

  // Web datetime-local helpers
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const formatDateTimeLocal = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  const parseDateTimeLocal = (val: string) => {
    try {
      const [datePart, timePart] = val.split("T");
      if (!datePart || !timePart) return null;
      const [y, m, day] = datePart.split("-").map(Number);
      const [hh, mm] = timePart.split(":").map(Number);
      return new Date(y, m - 1, day, hh, mm, 0, 0);
    } catch {
      return null;
    }
  };

  const webNativeDateInputStyle: any = {
    flex: 1,
    minWidth: 0,
    height: 48,
    border: "none",
    outline: "none",
    background: "transparent",
    padding: "12px 12px",
    fontSize: 15,
    color: "#111827",
    fontWeight: 700,
    cursor: "pointer",
  };

  useEffect(() => {
    if (!user) {
      Alert.alert("Please login first", "You need to be logged in to view rooms");
      router.replace("/admin-login");
      return;
    }

    const uid = user.uid;
    setLoading(true);

    const roomsRef = collection(db, "users", uid, "rooms");
    const unsubRooms = onSnapshot(
      roomsRef,
      (snap) => {
        const all: Room[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        all.sort((a, b) => a.roomNumber - b.roomNumber);
        setRooms(all);
        setLoading(false);

        // Auto open first available floor in UI
        const floors = Array.from(new Set(all.map((r) => getFloorFromRoom(r)))).sort((a, b) => a - b);
        if (floors.length) {
          setOpenFloors((prev) => {
            if (Object.keys(prev).length) return prev;
            return { [floors[0]]: true };
          });
        }
      },
      (err) => {
        console.error("Rooms listener error:", err);
        Alert.alert("Error", "Failed to load rooms: " + err.message);
        setLoading(false);
      }
    );

    return () => unsubRooms();
  }, [user, router]);

  const filteredRooms = useMemo(() => {
    const q = (searchQuery || "").trim();
    if (!q) return rooms;
    return rooms.filter((r) => {
      const disp = padRoom(r.roomNumber);
      return disp.includes(q) || String(r.roomNumber).includes(q);
    });
  }, [rooms, searchQuery]);

  const floors = useMemo(() => {
    const map = new Map<number, Room[]>();
    for (const r of filteredRooms) {
      const f = getFloorFromRoom(r);
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [filteredRooms]);

  const occupiedCount = useMemo(() => rooms.filter((r) => r.status === "occupied").length, [rooms]);
  const availableCount = useMemo(() => rooms.filter((r) => r.status === "available").length, [rooms]);

  const openEditModal = (room: Room) => {
    setEditingRoom(room);
    setGuestName("");
    setGuestMobile("");
    setEditCheckinDate(new Date());

    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(11, 0, 0, 0);
    setCheckoutDate(t);

    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingRoom(null);
    setGuestName("");
    setGuestMobile("");
    setShowEditCheckinPicker(false);
    setShowEditCheckoutPicker(false);
  };

  const openAndroidDateTimePicker = ({
    initial,
    minimumDate,
    onPicked,
  }: {
    initial: Date;
    minimumDate?: Date;
    onPicked: (d: Date) => void;
  }) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: "date",
      minimumDate,
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        const pickedDate = new Date(date);

        DateTimePickerAndroid.open({
          value: pickedDate,
          mode: "time",
          onChange: (event2, time) => {
            if (event2.type !== "set" || !time) return;
            const finalDate = new Date(pickedDate);
            finalDate.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onPicked(finalDate);
          },
        });
      },
    });
  };

  const saveRoomDetails = async () => {
    if (!editingRoom || !user) return;

    if (!guestName.trim()) {
      Alert.alert("Invalid Name", "Guest name is required");
      return;
    }
    if (!/^[0-9]{10}$/.test(guestMobile)) {
      Alert.alert("Invalid Mobile", "Mobile number must be exactly 10 digits");
      return;
    }
    if (checkoutDate <= editCheckinDate) {
      Alert.alert("Invalid Dates", "Checkout must be after check-in time");
      return;
    }

    setInitializing(true);
    try {
      const uid = user.uid;

      // create guest record
      const guestRef = await addDoc(collection(db, "guests"), {
        adminId: uid,
        adminEmail: user.email,
        guestMobile,
        guestName: guestName.trim(),
        roomNumber: editingRoom.roomNumber,
        isActive: true,
        isLoggedIn: false,
        createdAt: serverTimestamp(),
        checkinAt: Timestamp.fromDate(editCheckinDate),
        checkoutAt: Timestamp.fromDate(checkoutDate),
        mealPlan: [],
      });

      // update room
      await updateDoc(doc(db, "users", uid, "rooms", editingRoom.id), {
        status: "occupied",
        guestName: guestName.trim(),
        guestMobile,
        assignedAt: Timestamp.fromDate(editCheckinDate),
        checkoutAt: Timestamp.fromDate(checkoutDate),
        guestId: guestRef.id,
        updatedAt: serverTimestamp(),
      });

      Alert.alert("✅ Success", `Room ${padRoom(editingRoom.roomNumber)} initialized for ${guestName}`);
      closeEditModal();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e?.message || "Failed to initialize room");
    } finally {
      setInitializing(false);
    }
  };

  const checkoutRoom = async (room: Room) => {
    if (!user) return;
    const uid = user.uid;

    askConfirm({
      title: "Confirm Checkout",
      message: `Checkout Room ${padRoom(room.roomNumber)}?\n\nThis will delete food orders & service requests for this room.`,
      confirmText: "Checkout",
      variant: "destructive",
      onConfirm: async () => {
        const batch = writeBatch(db);

        // update room
        batch.update(doc(db, "users", uid, "rooms", room.id), {
          status: "available",
          guestName: null,
          guestMobile: null,
          assignedAt: null,
          checkoutAt: null,
          guestId: null,
          updatedAt: serverTimestamp(),
        });

        // delete foodOrders
        const foodSnap = await getDocs(
          query(collection(db, "foodOrders"), where("adminId", "==", uid), where("roomNumber", "==", room.roomNumber))
        );
        foodSnap.docs.forEach((d) => batch.delete(d.ref));

        // delete serviceRequests
        const srvSnap = await getDocs(
          query(collection(db, "serviceRequests"), where("adminId", "==", uid), where("roomNumber", "==", room.roomNumber))
        );
        srvSnap.docs.forEach((d) => batch.delete(d.ref));

        // delete orders (guest dashboard)
        const ordSnap = await getDocs(
          query(collection(db, "orders"), where("adminId", "==", uid), where("roomNumber", "==", room.roomNumber))
        );
        ordSnap.docs.forEach((d) => batch.delete(d.ref));

        // mark guest inactive if known
        if (room.guestId) {
          batch.update(doc(db, "guests", room.guestId), {
            isActive: false,
            checkedOutAt: serverTimestamp(),
            checkoutReason: "manual",
          });
        }

        await batch.commit();
        Alert.alert("✅ Checked out", `Room ${padRoom(room.roomNumber)} is now available.`);
      },
    });
  };

  const formatDateTime = (ts: any) => {
    try {
      const dt: Date | null = ts?.toDate?.() ?? null;
      if (!dt) return "-";
      return dt.toLocaleDateString() + " " + dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "-";
    }
  };

  const remaining = (checkoutAt?: Timestamp | null) => {
    if (!checkoutAt) return null;
    const diff = checkoutAt.toMillis() - Date.now();
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return `${days}d ${remH}h left`;
  };

  if (!user) return null;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Ionicons name="bed" size={48} color="#2563EB" />
          <Text style={styles.loadingText}>Loading Rooms...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const webMinNow = formatDateTimeLocal(new Date());
  const webCheckinValue = formatDateTimeLocal(editCheckinDate);
  const webCheckoutValue = formatDateTimeLocal(checkoutDate);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Confirm Modal (web) */}
      <Modal visible={confirm.open} transparent animationType="fade" onRequestClose={closeConfirm}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{confirm.title}</Text>
            <Text style={styles.confirmMessage}>{confirm.message}</Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmBtnGhost} onPress={closeConfirm} disabled={confirmBusy}>
                <Text style={styles.confirmBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtnPrimary, confirm.variant === "destructive" && styles.confirmBtnDanger]}
                disabled={confirmBusy}
                onPress={async () => {
                  if (!confirm.onConfirm) return closeConfirm();
                  setConfirmBusy(true);
                  try {
                    await confirm.onConfirm();
                  } finally {
                    setConfirmBusy(false);
                    closeConfirm();
                  }
                }}
              >
                {confirmBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>{confirm.confirmText}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Initialize Modal */}
      <Modal visible={editModalOpen} animationType="slide" transparent onRequestClose={closeEditModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalIcon, { backgroundColor: "rgba(22, 163, 74, 0.1)" }]}>
                  <Ionicons name="log-in-outline" size={18} color="#16A34A" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>
                    Initialize Room {editingRoom ? padRoom(editingRoom.roomNumber) : ""}
                  </Text>
                  <Text style={styles.modalSubtitle}>Enter guest details to check-in</Text>
                </View>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={closeEditModal}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Guest Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                  <TextInput
                    placeholder="Enter guest name"
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                    value={guestName}
                    onChangeText={setGuestName}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Mobile Number</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="call-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                  <TextInput
                    placeholder="10-digit mobile number"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={10}
                    style={styles.input}
                    value={guestMobile}
                    onChangeText={(text) => {
                      if (/^\d*$/.test(text)) setGuestMobile(text);
                    }}
                  />
                </View>
              </View>

              {/* Check-in */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Check-in Date & Time</Text>

                {Platform.OS === "web" ? (
                  <View style={[styles.inputWrapper, { cursor: "pointer" } as any]}>
                    <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                    {/* @ts-ignore */}
                    <input
                      type="datetime-local"
                      value={webCheckinValue}
                      min={webMinNow}
                      step={60}
                      onChange={(e: any) => {
                        const d = parseDateTimeLocal(e.target.value);
                        if (d) {
                          setEditCheckinDate(d);
                          if (checkoutDate && d >= checkoutDate) {
                            const next = new Date(d);
                            next.setDate(next.getDate() + 1);
                            setCheckoutDate(next);
                          }
                        }
                      }}
                      style={webNativeDateInputStyle}
                    />
                  </View>
                ) : (
                  <Pressable
                    style={styles.inputWrapper}
                    onPress={() => {
                      if (Platform.OS === "android") {
                        openAndroidDateTimePicker({
                          initial: editCheckinDate,
                          minimumDate: new Date(),
                          onPicked: (d) => {
                            setEditCheckinDate(d);
                            if (checkoutDate && d >= checkoutDate) {
                              const next = new Date(d);
                              next.setDate(next.getDate() + 1);
                              setCheckoutDate(next);
                            }
                          },
                        });
                        return;
                      }
                      setIosTempEditCheckin(editCheckinDate);
                      setShowEditCheckinPicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                    <Text style={styles.dateValueText} numberOfLines={1}>
                      {editCheckinDate.toLocaleString()}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Checkout */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Check-out Date & Time</Text>

                {Platform.OS === "web" ? (
                  <View style={[styles.inputWrapper, { cursor: "pointer" } as any]}>
                    <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                    {/* @ts-ignore */}
                    <input
                      type="datetime-local"
                      value={webCheckoutValue}
                      min={webCheckinValue || webMinNow}
                      step={60}
                      onChange={(e: any) => {
                        const d = parseDateTimeLocal(e.target.value);
                        if (d) setCheckoutDate(d);
                      }}
                      style={webNativeDateInputStyle}
                    />
                  </View>
                ) : (
                  <Pressable
                    style={styles.inputWrapper}
                    onPress={() => {
                      if (Platform.OS === "android") {
                        openAndroidDateTimePicker({
                          initial: checkoutDate,
                          minimumDate: editCheckinDate,
                          onPicked: (d) => setCheckoutDate(d),
                        });
                        return;
                      }
                      setIosTempEditCheckout(checkoutDate);
                      setShowEditCheckoutPicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                    <Text style={styles.dateValueText} numberOfLines={1}>
                      {checkoutDate.toLocaleString()}
                    </Text>
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={saveRoomDetails}
                disabled={initializing}
                style={({ pressed }) => [
                  styles.saveBtn,
                  initializing && styles.saveBtnDisabled,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                {initializing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>Initialize Room</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>

            {/* iOS picker sheets */}
            {Platform.OS === "ios" && (
              <Modal visible={showEditCheckinPicker} transparent animationType="slide" onRequestClose={() => setShowEditCheckinPicker(false)}>
                <View style={styles.pickerOverlay}>
                  <Pressable style={styles.pickerBackdrop} onPress={() => setShowEditCheckinPicker(false)} />
                  <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                      <Pressable onPress={() => setShowEditCheckinPicker(false)}>
                        <Text style={styles.pickerAction}>Cancel</Text>
                      </Pressable>
                      <Text style={styles.pickerTitle}>Select Check-in</Text>
                      <Pressable
                        onPress={() => {
                          setShowEditCheckinPicker(false);
                          setEditCheckinDate(iosTempEditCheckin);
                          if (checkoutDate && iosTempEditCheckin >= checkoutDate) {
                            const next = new Date(iosTempEditCheckin);
                            next.setDate(next.getDate() + 1);
                            setCheckoutDate(next);
                          }
                        }}
                      >
                        <Text style={[styles.pickerAction, styles.pickerActionPrimary]}>Done</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={iosTempEditCheckin}
                      mode="datetime"
                      display="spinner"
                      minimumDate={new Date()}
                      onChange={(_, d) => d && setIosTempEditCheckin(d)}
                    />
                  </View>
                </View>
              </Modal>
            )}

            {Platform.OS === "ios" && (
              <Modal visible={showEditCheckoutPicker} transparent animationType="slide" onRequestClose={() => setShowEditCheckoutPicker(false)}>
                <View style={styles.pickerOverlay}>
                  <Pressable style={styles.pickerBackdrop} onPress={() => setShowEditCheckoutPicker(false)} />
                  <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                      <Pressable onPress={() => setShowEditCheckoutPicker(false)}>
                        <Text style={styles.pickerAction}>Cancel</Text>
                      </Pressable>
                      <Text style={styles.pickerTitle}>Select Check-out</Text>
                      <Pressable
                        onPress={() => {
                          setShowEditCheckoutPicker(false);
                          setCheckoutDate(iosTempEditCheckout);
                        }}
                      >
                        <Text style={[styles.pickerAction, styles.pickerActionPrimary]}>Done</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={iosTempEditCheckout}
                      mode="datetime"
                      display="spinner"
                      minimumDate={editCheckinDate}
                      onChange={(_, d) => d && setIosTempEditCheckout(d)}
                    />
                  </View>
                </View>
              </Modal>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Main */}
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.greeting}>Hotel Rooms</Text>
            <Text style={styles.title}>Floor-wise Distribution</Text>
          </View>
          <View style={styles.countBadges}>
            <View style={styles.badge}>
              <Text style={[styles.badgeLabel, { color: "#DC2626" }]}>OCCUPIED</Text>
              <Text style={[styles.badgeValue, { color: "#DC2626" }]}>{occupiedCount}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={[styles.badgeLabel, { color: "#16A34A" }]}>AVAILABLE</Text>
              <Text style={[styles.badgeValue, { color: "#16A34A" }]}>{availableCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            placeholder="Search room (e.g. 101 or 001)"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={(t) => setSearchQuery(t.replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </Pressable>
          ) : null}
        </View>

        {floors.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bed-outline" size={24} color="#9CA3AF" />
            <Text style={styles.emptyText}>No rooms found</Text>
          </View>
        ) : (
          floors.map(([floor, floorRooms]) => {
            const isOpen = openFloors[floor] ?? false;
            const occupied = floorRooms.filter((r) => r.status === "occupied");
            const available = floorRooms.filter((r) => r.status === "available");

            return (
              <View key={floor} style={styles.floorCard}>
                <Pressable
                  onPress={() => setOpenFloors((p) => ({ ...p, [floor]: !isOpen }))}
                  style={({ pressed }) => [
                    styles.floorHeader,
                    pressed && { opacity: 0.95 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.floorTitle}>{floorLabel(floor)}</Text>
                    <Text style={styles.floorSub}>
                      Total: {floorRooms.length} • Occupied: {occupied.length} • Available: {available.length}
                    </Text>
                  </View>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color="#6B7280" />
                </Pressable>

                {isOpen ? (
                  <View style={styles.floorBody}>
                    {/* Occupied */}
                    {occupied.length > 0 ? (
                      <>
                        <Text style={styles.sectionTitle}>Occupied</Text>
                        {occupied.map((r) => (
                          <View key={r.id} style={styles.occupiedCard}>
                            <View style={styles.roomTopRow}>
                              <Text style={styles.roomNumber}>Room {padRoom(r.roomNumber)}</Text>
                              <View style={styles.occupiedBadge}>
                                <Text style={styles.occupiedBadgeText}>OCCUPIED</Text>
                              </View>
                            </View>

                            <View style={styles.roomMeta}>
                              <Text style={styles.metaLine}>
                                Guest: <Text style={styles.metaStrong}>{r.guestName || "-"}</Text>
                              </Text>
                              <Text style={styles.metaLine}>
                                Mobile: <Text style={styles.metaStrong}>{r.guestMobile || "-"}</Text>
                              </Text>
                              <Text style={styles.metaLine}>
                                Check-in: <Text style={styles.metaStrong}>{formatDateTime(r.assignedAt)}</Text>
                              </Text>
                              <Text style={styles.metaLine}>
                                Checkout: <Text style={styles.metaStrong}>{remaining(r.checkoutAt) || "-"}</Text>
                              </Text>
                            </View>

                            <Pressable
                              onPress={() => checkoutRoom(r)}
                              style={({ pressed }) => [
                                styles.checkoutBtn,
                                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                              ]}
                            >
                              <Ionicons name="log-out-outline" size={16} color="#fff" />
                              <Text style={styles.checkoutText}>Checkout</Text>
                            </Pressable>
                          </View>
                        ))}
                      </>
                    ) : (
                      <View style={styles.miniEmpty}>
                        <Text style={styles.miniEmptyText}>No occupied rooms on this floor.</Text>
                      </View>
                    )}

                    {/* Available */}
                    {available.length > 0 ? (
                      <>
                        <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Available</Text>
                        <View style={styles.availableGrid}>
                          {available.map((r) => (
                            <Pressable
                              key={r.id}
                              onPress={() => openEditModal(r)}
                              style={({ pressed }) => [
                                styles.availableCard,
                                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                              ]}
                            >
                              <View style={styles.availableIcon}>
                                <Ionicons name="bed-outline" size={18} color="#16A34A" />
                              </View>
                              <Text style={styles.availableRoom}>Room {padRoom(r.roomNumber)}</Text>
                              <View style={styles.availableBadge}>
                                <Text style={styles.availableBadgeText}>AVAILABLE</Text>
                              </View>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : (
                      <View style={styles.miniEmpty}>
                        <Text style={styles.miniEmptyText}>No available rooms on this floor.</Text>
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 30 },

  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#6B7280", fontWeight: "800" },

  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  greeting: { color: "#6B7280", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#111827", fontSize: 20, fontWeight: "900", marginTop: 2 },
  countBadges: { flexDirection: "row", gap: 10 },
  badge: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  badgeLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  badgeValue: { fontSize: 16, fontWeight: "900", marginTop: 2 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#111827", padding: 0, fontWeight: "700" },

  emptyState: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyText: { color: "#9CA3AF", marginTop: 6, fontWeight: "700" },

  floorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
    overflow: "hidden",
  },
  floorHeader: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  floorTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  floorSub: { marginTop: 3, fontSize: 12, fontWeight: "700", color: "#6B7280" },
  floorBody: { padding: 14 },

  sectionTitle: { fontSize: 12, fontWeight: "900", color: "#6B7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },

  occupiedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 10,
  },
  roomTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roomNumber: { fontSize: 16, fontWeight: "900", color: "#111827" },
  occupiedBadge: { backgroundColor: "rgba(220, 38, 38, 0.10)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  occupiedBadgeText: { color: "#DC2626", fontWeight: "900", fontSize: 10, letterSpacing: 1 },

  roomMeta: { marginTop: 10, gap: 4 },
  metaLine: { color: "#6B7280", fontWeight: "700" },
  metaStrong: { color: "#111827", fontWeight: "900" },

  checkoutBtn: {
    marginTop: 12,
    backgroundColor: "#DC2626",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  checkoutText: { color: "#fff", fontWeight: "900" },

  miniEmpty: { paddingVertical: 8 },
  miniEmptyText: { color: "#9CA3AF", fontWeight: "700" },

  availableGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  availableCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  availableIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(22, 163, 74, 0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  availableRoom: { fontSize: 15, fontWeight: "900", color: "#111827", marginBottom: 6 },
  availableBadge: { backgroundColor: "rgba(22, 163, 74, 0.10)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  availableBadgeText: { color: "#16A34A", fontSize: 10, fontWeight: "900", letterSpacing: 1 },

  // Modal base
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    padding: 16,
    justifyContent: Platform.OS === "web" ? "center" : "flex-end",
    alignItems: Platform.OS === "web" ? "center" : "stretch",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    maxHeight: "90%",
    width: Platform.OS === "web" ? "100%" : undefined,
    maxWidth: Platform.OS === "web" ? 560 : undefined,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalHeader: {
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  modalSubtitle: { fontSize: 12, fontWeight: "700", color: "#6B7280", marginTop: 2 },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "900", color: "#374151", marginBottom: 8 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    height: 48,
  },
  input: { flex: 1, fontSize: 15, color: "#111827", paddingHorizontal: 12, height: "100%", fontWeight: "700" },
  dateValueText: { flex: 1, fontSize: 14, fontWeight: "800", color: "#111827", paddingHorizontal: 12 },

  saveBtn: {
    backgroundColor: "#16A34A",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  // iOS picker sheet
  pickerOverlay: { flex: 1, justifyContent: "flex-end" },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(17, 24, 39, 0.35)" },
  pickerSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 18, paddingTop: 10 },
  pickerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  pickerTitle: { fontSize: 14, fontWeight: "900", color: "#111827" },
  pickerAction: { fontSize: 14, fontWeight: "900", color: "#6B7280" },
  pickerActionPrimary: { color: "#2563EB" },

  // Confirm
  confirmOverlay: { flex: 1, backgroundColor: "rgba(17, 24, 39, 0.45)", padding: 16, justifyContent: "center", alignItems: "center" },
  confirmCard: { width: "100%", maxWidth: 520, backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: "#E5E7EB", padding: 16 },
  confirmTitle: { fontSize: 16, fontWeight: "900", color: "#111827", marginBottom: 8 },
  confirmMessage: { color: "#374151", fontSize: 13, fontWeight: "700", lineHeight: 18, marginBottom: 14 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  confirmBtnGhost: { height: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#E5E7EB" },
  confirmBtnGhostText: { fontWeight: "900", color: "#374151" },
  confirmBtnPrimary: { height: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#2563EB" },
  confirmBtnDanger: { backgroundColor: "#DC2626" },
  confirmBtnText: { color: "#FFFFFF", fontWeight: "900" },
});