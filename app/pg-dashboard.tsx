import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  TextInput,
  ScrollView,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

type NavKey =
  | "dashboard"
  | "rooms"
  | "residents"
  | "payments"
  | "tickets"
  | "settings";

type RoomStatus = "occupied" | "partial" | "vacant";
type PaymentStatus = "paid" | "processing" | "pending" | "overdue";
type TicketStatus = "open" | "in-progress" | "closed";
type TicketPriority = "low" | "medium" | "high";

type PgRoomDoc = {
  roomNumber: number;
  status?: RoomStatus;
  capacity?: number; // optional, used if status not present
};

type PgResidentDoc = {
  name?: string;
  roomNumber?: number;
};

type PgPaymentDoc = {
  residentName?: string;
  roomNumber?: number;
  amount?: number;
  status?: PaymentStatus;
  createdAt?: any; // Firestore timestamp
};

type PgTicketDoc = {
  status?: TicketStatus;
  priority?: TicketPriority;
};

type PgRoomComputed = {
  roomNumber: number;
  status: RoomStatus;
};

type FloorGroup = {
  label: string;
  rooms: PgRoomComputed[];
};

export default function PgDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const showSidebar = width >= 980;
  const showRightPanel = width >= 1120;
  const isTablet = width >= 860;

  const auth = getAuth();
  const user = auth.currentUser;

  const [activeNav, setActiveNav] = useState<NavKey>("dashboard");
  const [search, setSearch] = useState("");

  // ✅ Firestore state
  const [roomsRaw, setRoomsRaw] = useState<Array<{ id: string } & PgRoomDoc>>(
    []
  );
  const [residentsRaw, setResidentsRaw] = useState<
    Array<{ id: string } & PgResidentDoc>
  >([]);
  const [paymentsRaw, setPaymentsRaw] = useState<
    Array<{ id: string } & PgPaymentDoc>
  >([]);
  const [ticketsRaw, setTicketsRaw] = useState<
    Array<{ id: string } & PgTicketDoc>
  >([]);

  // ✅ Protect route
  useEffect(() => {
    if (!user) router.replace("/admin-login");
  }, [user, router]);

  // ✅ Live subscriptions
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    const roomsRef = collection(db, "users", uid, "pgRooms");
    const residentsRef = collection(db, "users", uid, "pgResidents");
    const paymentsRef = collection(db, "users", uid, "pgPayments");
    const ticketsRef = collection(db, "users", uid, "pgTickets");

    const unsubRooms = onSnapshot(roomsRef, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRoomsRaw(list);
    });

    const unsubResidents = onSnapshot(residentsRef, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setResidentsRaw(list);
    });

    const unsubPayments = onSnapshot(paymentsRef, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setPaymentsRaw(list);
    });

    const unsubTickets = onSnapshot(ticketsRef, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setTicketsRaw(list);
    });

    return () => {
      unsubRooms();
      unsubResidents();
      unsubPayments();
      unsubTickets();
    };
  }, [user]);

  // ✅ Helpers: residents count per room
  const residentsByRoom = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of residentsRaw) {
      const rn = typeof r.roomNumber === "number" ? r.roomNumber : null;
      if (rn == null) continue;
      map.set(rn, (map.get(rn) ?? 0) + 1);
    }
    return map;
  }, [residentsRaw]);

  // ✅ Compute room status (use stored status if available; otherwise derive from residents + capacity)
  const computedRooms: PgRoomComputed[] = useMemo(() => {
    const result: PgRoomComputed[] = [];

    for (const r of roomsRaw) {
      const roomNumber = Number(r.roomNumber);
      if (!Number.isFinite(roomNumber)) continue;

      const stored = r.status;
      if (stored === "occupied" || stored === "partial" || stored === "vacant") {
        result.push({ roomNumber, status: stored });
        continue;
      }

      const capacity = typeof r.capacity === "number" && r.capacity > 0 ? r.capacity : 1;
      const count = residentsByRoom.get(roomNumber) ?? 0;

      const derived: RoomStatus =
        count <= 0 ? "vacant" : count < capacity ? "partial" : "occupied";

      result.push({ roomNumber, status: derived });
    }

    // If pgRooms is empty but residents exist, still show rooms from residents
    if (result.length === 0 && residentsByRoom.size > 0) {
      for (const roomNumber of Array.from(residentsByRoom.keys())) {
        const count = residentsByRoom.get(roomNumber) ?? 0;
        result.push({ roomNumber, status: count > 0 ? "occupied" : "vacant" });
      }
    }

    result.sort((a, b) => a.roomNumber - b.roomNumber);
    return result;
  }, [roomsRaw, residentsByRoom]);

  // ✅ Group rooms by floor like screenshot (101.. => FLOOR 01)
  const groupedFloors: FloorGroup[] = useMemo(() => {
    const map = new Map<number, PgRoomComputed[]>();

    for (const r of computedRooms) {
      const floor = Math.floor(r.roomNumber / 100); // 101 -> 1, 204 -> 2
      map.set(floor, [...(map.get(floor) ?? []), r]);
    }

    const floors = Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([floorNum, rooms]) => ({
        label: `FLOOR ${String(floorNum).padStart(2, "0")}`,
        rooms: rooms.sort((a, b) => a.roomNumber - b.roomNumber),
      }));

    return floors;
  }, [computedRooms]);

  // ✅ Search filter (by room number or resident name)
  const filteredFloors: FloorGroup[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groupedFloors;

    const matchedRoomNumbers = new Set<number>();

    // room number match
    for (const r of computedRooms) {
      if (String(r.roomNumber).includes(q)) matchedRoomNumbers.add(r.roomNumber);
    }

    // resident name match -> include their room
    for (const res of residentsRaw) {
      const name = (res.name ?? "").toLowerCase();
      const rn = typeof res.roomNumber === "number" ? res.roomNumber : null;
      if (rn != null && name.includes(q)) matchedRoomNumbers.add(rn);
    }

    const next = groupedFloors
      .map((f) => ({
        ...f,
        rooms: f.rooms.filter((r) => matchedRoomNumbers.has(r.roomNumber)),
      }))
      .filter((f) => f.rooms.length > 0);

    return next;
  }, [search, groupedFloors, computedRooms, residentsRaw]);

  // ✅ Stats
  const occupancyRate = useMemo(() => {
    if (!computedRooms.length) return 0;
    const occupiedOrPartial = computedRooms.filter((r) => r.status !== "vacant").length;
    return Math.round((occupiedOrPartial / computedRooms.length) * 100);
  }, [computedRooms]);

  const pendingRent = useMemo(() => {
    return paymentsRaw.reduce((sum, p) => {
      const status = p.status ?? "pending";
      const amount = typeof p.amount === "number" ? p.amount : 0;
      if (status === "paid") return sum;
      return sum + amount;
    }, 0);
  }, [paymentsRaw]);

  const overdueCount = useMemo(() => {
    // count unique rooms that have unpaid payments
    const set = new Set<number>();
    for (const p of paymentsRaw) {
      const status = p.status ?? "pending";
      const rn = typeof p.roomNumber === "number" ? p.roomNumber : null;
      if (status !== "paid" && rn != null) set.add(rn);
    }
    return set.size;
  }, [paymentsRaw]);

  const activeComplaints = useMemo(() => {
    return ticketsRaw.filter((t) => (t.status ?? "open") !== "closed").length;
  }, [ticketsRaw]);

  const highPriority = useMemo(() => {
    return ticketsRaw.filter(
      (t) => (t.status ?? "open") !== "closed" && (t.priority ?? "low") === "high"
    ).length;
  }, [ticketsRaw]);

  // ✅ Recent transactions (right panel)
  const recentTransactions = useMemo(() => {
    const sorted = [...paymentsRaw].sort((a, b) => {
      const at = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const bt = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return bt - at;
    });

    return sorted.slice(0, 10).map((p, idx) => {
      const name = p.residentName ?? "Resident";
      const room = typeof p.roomNumber === "number" ? `Room ${p.roomNumber}` : "Room -";
      const dt = p.createdAt?.toDate?.();
      const dateText =
        dt instanceof Date
          ? dt.toLocaleDateString([], { month: "short", day: "2-digit" })
          : "-";
      const amount = typeof p.amount === "number" ? p.amount : 0;
      const status: PaymentStatus = (p.status ?? "pending") as PaymentStatus;

      return {
        id: (p as any).id ?? String(idx),
        name,
        room,
        date: dateText,
        amount,
        status,
      };
    });
  }, [paymentsRaw]);

  const Sidebar = () => (
    <View style={styles.sidebar}>
      <View>
        <View style={styles.sidebarBrand}>
          <View style={styles.brandIcon}>
            <Ionicons name="business" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>PG Manager</Text>
            <Text style={styles.brandSub}>Premium Living</Text>
          </View>
        </View>

        <View style={styles.navList}>
          <NavItem active={activeNav === "dashboard"} icon="grid-outline" label="Dashboard" onPress={() => setActiveNav("dashboard")} />
          <NavItem active={activeNav === "rooms"} icon="bed-outline" label="Rooms" onPress={() => setActiveNav("rooms")} />
          <NavItem active={activeNav === "residents"} icon="people-outline" label="Residents" onPress={() => setActiveNav("residents")} />
          <NavItem active={activeNav === "payments"} icon="card-outline" label="Payments" onPress={() => setActiveNav("payments")} />
          <NavItem active={activeNav === "tickets"} icon="chatbox-ellipses-outline" label="Tickets" onPress={() => setActiveNav("tickets")} />
          <NavItem active={activeNav === "settings"} icon="settings-outline" label="Settings" onPress={() => setActiveNav("settings")} />
        </View>
      </View>

      <View style={styles.sidebarBottom}>
        <Pressable
          onPress={() => {}}
          style={({ pressed }) => [
            styles.addResidentBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
          ]}
        >
          <Ionicons name="person-add-outline" size={16} color="#fff" />
          <Text style={styles.addResidentText}>Add Resident</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/ownership")}
          style={({ pressed }) => [
            styles.changeTypeBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
          ]}
        >
          <Ionicons name="swap-horizontal-outline" size={16} color="#2563EB" />
          <Text style={styles.changeTypeText}>Change Property Type</Text>
        </Pressable>
      </View>
    </View>
  );

  const RightPanel = () => (
    <View style={styles.rightPanel}>
      <Text style={styles.rightTitle}>Recent Transactions</Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {recentTransactions.length === 0 ? (
          <View style={styles.rightEmpty}>
            <Ionicons name="receipt-outline" size={22} color="#9CA3AF" />
            <Text style={styles.rightEmptyText}>No transactions yet</Text>
          </View>
        ) : (
          recentTransactions.map((tx) => (
            <View key={tx.id} style={styles.txCard}>
              <View style={styles.txRow}>
                <View style={styles.txAvatar}>
                  <Text style={styles.txAvatarText}>
                    {tx.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.txName}>{tx.name}</Text>
                  <Text style={styles.txSub}>
                    {tx.room} • {tx.date}
                  </Text>

                  <View
                    style={[
                      styles.txStatusPill,
                      tx.status === "paid" ? styles.txPaid : styles.txProcessing,
                    ]}
                  >
                    <Text
                      style={[
                        styles.txStatusText,
                        tx.status === "paid"
                          ? styles.txPaidText
                          : styles.txProcessingText,
                      ]}
                    >
                      {tx.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Text style={styles.txAmount}>
                    ₹{tx.amount.toLocaleString("en-IN")}
                  </Text>
                  <Pressable style={styles.txMiniIcon}>
                    <Ionicons name="receipt-outline" size={16} color="#6B7280" />
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}

        <Pressable
          onPress={() => {}}
          style={({ pressed }) => [
            styles.viewAllTxBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
          ]}
        >
          <Text style={styles.viewAllTxText}>View All Transactions</Text>
        </Pressable>
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        {showSidebar ? <Sidebar /> : null}

        <View style={styles.center}>
          {/* Top bar */}
          <View style={styles.topBar}>
            {!showSidebar ? (
              <Pressable
                onPress={() => router.replace("/ownership")}
                style={({ pressed }) => [
                  styles.mobileBack,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="arrow-back" size={18} color="#2563EB" />
              </Pressable>
            ) : null}

            <View>
              <Text style={styles.topTitle}>Dashboard</Text>
              <Text style={styles.topSubtitle}>Overview</Text>
            </View>

            <View style={{ flex: 1 }} />

            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color="#6B7280" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search residents or rooms"
                placeholderTextColor="#9CA3AF"
                style={styles.searchInput}
              />
            </View>

            <View style={styles.topIcons}>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="notifications-outline" size={18} color="#111827" />
                <View style={styles.notifDot} />
              </Pressable>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="mail-outline" size={18} color="#111827" />
              </Pressable>
            </View>

            <View style={styles.profile}>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.profileName}>
                  {user?.email ? user.email.split("@")[0] : "Manager"}
                </Text>
                <Text style={styles.profileRole}>Super Admin</Text>
              </View>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(user?.email?.[0] ?? "M").toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {/* Main scroll */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.greeting}>
              <Text style={styles.greetingTitle}>Good Morning, Manager</Text>
              <Text style={styles.greetingSub}>
                Here is what is happening at your property today.
              </Text>
            </View>

            {/* Stat cards */}
            <View style={[styles.statsRow, !isTablet && { flexDirection: "column" }]}>
              <StatCard
                title="Total Occupancy"
                value={`${occupancyRate}%`}
                note="↑ Live from rooms"
                icon="trending-up-outline"
                accent="#16A34A"
                tint="rgba(22,163,74,0.10)"
              />
              <StatCard
                title="Pending Rent"
                value={`₹${pendingRent.toLocaleString("en-IN")}`}
                note={`⚠ ${overdueCount} rooms unpaid`}
                icon="wallet-outline"
                accent="#F97316"
                tint="rgba(249,115,22,0.10)"
              />
              <StatCard
                title="Active Complaints"
                value={String(activeComplaints).padStart(2, "0")}
                note={`⚡ ${highPriority} high priority tickets`}
                icon="alert-circle-outline"
                accent="#2563EB"
                tint="rgba(37,99,235,0.10)"
              />
            </View>

            {/* Room Availability Grid */}
            <View style={styles.gridCard}>
              <View style={styles.gridHeader}>
                <Text style={styles.gridTitle}>Room Availability Grid</Text>

                <View style={styles.legend}>
                  <LegendDot color="#2563EB" label="Occupied" />
                  <LegendDot color="#FB923C" label="Partial" />
                  <LegendDot color="#CBD5E1" label="Vacant" />
                </View>
              </View>

              <View style={styles.gridDivider} />

              {filteredFloors.map((floor) => (
                <View key={floor.label} style={styles.floorBlock}>
                  <Text style={styles.floorLabel}>{floor.label}</Text>

                  <View style={styles.roomRow}>
                    {floor.rooms.map((r) => (
                      <RoomBubble key={r.roomNumber} room={r} />
                    ))}
                  </View>
                </View>
              ))}

              {filteredFloors.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={22} color="#9CA3AF" />
                  <Text style={styles.emptyText}>No rooms match your search</Text>
                </View>
              ) : null}
            </View>

            <View style={{ height: 16 }} />
          </ScrollView>
        </View>

        {showRightPanel ? <RightPanel /> : null}
      </View>
    </SafeAreaView>
  );
}

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: any;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navItem,
        active && styles.navItemActive,
        pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
      ]}
    >
      <Ionicons name={icon} size={18} color={active ? "#2563EB" : "#6B7280"} />
      <Text style={[styles.navText, active && { color: "#2563EB" }]}>{label}</Text>
    </Pressable>
  );
}

function StatCard({
  title,
  value,
  note,
  icon,
  accent,
  tint,
}: {
  title: string;
  value: string;
  note: string;
  icon: any;
  accent: string;
  tint: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <Text style={styles.statTitle}>{title}</Text>
        <View style={[styles.statIcon, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
      </View>

      <Text style={styles.statValue}>{value}</Text>
      <Text style={[styles.statNote, { color: accent }]}>{note}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function RoomBubble({ room }: { room: PgRoomComputed }) {
  const bg =
    room.status === "occupied"
      ? "#2563EB"
      : room.status === "partial"
      ? "#FB923C"
      : "#E2E8F0";

  const textColor = room.status === "vacant" ? "#64748B" : "#FFFFFF";

  const iconName =
    room.status === "vacant"
      ? "add-outline"
      : room.status === "partial"
      ? "people-outline"
      : "person-outline";

  return (
    <Pressable
      onPress={() => {}}
      style={({ pressed }) => [
        styles.roomBubble,
        { backgroundColor: bg },
        pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
      ]}
    >
      <Text style={[styles.roomNumber, { color: textColor }]}>{room.roomNumber}</Text>
      <View style={styles.roomIconPill}>
        <Ionicons name={iconName} size={14} color={textColor} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  page: { flex: 1, flexDirection: "row", backgroundColor: "#F9FAFB" },

  // Sidebar
  sidebar: {
    width: 260,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
    padding: 16,
    justifyContent: "space-between",
  },
  sidebarBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  brandSub: { marginTop: 2, fontSize: 12, fontWeight: "700", color: "#6B7280" },

  navList: { marginTop: 12, gap: 6 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "transparent",
  },
  navItemActive: {
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
  },
  navText: { fontSize: 13, fontWeight: "800", color: "#374151" },

  sidebarBottom: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  addResidentBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  addResidentText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  changeTypeBtn: {
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  changeTypeText: { color: "#2563EB", fontWeight: "900", fontSize: 12 },

  // Center
  center: { flex: 1 },

  topBar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mobileBack: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  topSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "700", color: "#6B7280" },

  searchWrap: {
    width: 320,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },

  topIcons: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifDot: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#F3F4F6",
  },

  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#E5E7EB",
  },
  profileName: { fontSize: 13, fontWeight: "900", color: "#111827" },
  profileRole: { marginTop: 2, fontSize: 12, fontWeight: "700", color: "#2563EB" },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "900", color: "#2563EB" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  greeting: { marginBottom: 10 },
  greetingTitle: { fontSize: 30, fontWeight: "900", color: "#111827" },
  greetingSub: { marginTop: 6, fontSize: 14, fontWeight: "700", color: "#6B7280" },

  statsRow: { marginTop: 14, flexDirection: "row", gap: 12 },

  statCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statTitle: { fontSize: 13, fontWeight: "800", color: "#6B7280" },
  statIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  statValue: { marginTop: 10, fontSize: 26, fontWeight: "900", color: "#111827" },
  statNote: { marginTop: 8, fontSize: 12, fontWeight: "800" },

  gridCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
    padding: 16,
  },
  gridHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  gridTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },

  legend: { flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: "800", color: "#6B7280" },

  gridDivider: { height: 1, backgroundColor: "#E5E7EB", marginTop: 12, marginBottom: 12 },

  floorBlock: { marginBottom: 16 },
  floorLabel: { fontSize: 12, fontWeight: "900", color: "#94A3B8", letterSpacing: 1.4, marginBottom: 10 },
  roomRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  roomBubble: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center" },
  roomNumber: { fontSize: 12, fontWeight: "900" },
  roomIconPill: { marginTop: 6 },

  emptyState: { alignItems: "center", paddingVertical: 16 },
  emptyText: { marginTop: 6, color: "#9CA3AF", fontWeight: "800" },

  // Right panel
  rightPanel: {
    width: 360,
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 1,
    borderLeftColor: "#E5E7EB",
    padding: 16,
  },
  rightTitle: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 12 },

  rightEmpty: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  rightEmptyText: { marginTop: 6, color: "#9CA3AF", fontWeight: "800" },

  txCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  txAvatar: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  txAvatarText: { color: "#2563EB", fontWeight: "900" },
  txName: { fontSize: 14, fontWeight: "900", color: "#111827" },
  txSub: { marginTop: 3, fontSize: 11, fontWeight: "800", color: "#6B7280" },
  txAmount: { fontSize: 14, fontWeight: "900", color: "#16A34A" },

  txStatusPill: { marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  txStatusText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },

  txPaid: { backgroundColor: "rgba(22,163,74,0.12)" },
  txPaidText: { color: "#16A34A" },

  txProcessing: { backgroundColor: "rgba(37,99,235,0.12)" },
  txProcessingText: { color: "#2563EB" },

  txMiniIcon: { width: 34, height: 34, borderRadius: 14, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },

  viewAllTxBtn: {
    marginTop: 10,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  viewAllTxText: { color: "#2563EB", fontWeight: "900" },
});