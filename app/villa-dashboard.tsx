import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  TextInput,
  ScrollView,
  Image,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

type NavKey =
  | "dashboard"
  | "properties"
  | "bookings"
  | "maintenance"
  | "finance"
  | "staff";

type VillaDoc = {
  name?: string;
  location?: string;
  status?: "AVAILABLE" | "BOOKED";
  pricePerNight?: number;
  beds?: number;
  baths?: number;
  imageUrl?: string;
};

type BookingDoc = {
  guestName?: string;
  villaName?: string;
  checkInAt?: Timestamp;
};

type TaskDoc = {
  status?: "pending" | "in-progress" | "completed";
};

type PaymentDoc = {
  amount?: number;
};

export default function VillaDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 980;
  const isTwoCol = width >= 820;

  const auth = getAuth();

  // ✅ FIX: Make user reactive (prevents false redirect / stale currentUser)
  const [user, setUser] = useState<User | null>(auth.currentUser);

  const [activeNav, setActiveNav] = useState<NavKey>("dashboard");
  const [search, setSearch] = useState("");

  // ✅ Firestore-backed state
  const [villas, setVillas] = useState<Array<{ id: string } & VillaDoc>>([]);
  const [bookings, setBookings] = useState<Array<{ id: string } & BookingDoc>>(
    []
  );
  const [pendingTasksCount, setPendingTasksCount] = useState<number>(0);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);

  // ✅ Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [auth]);

  // ✅ Protect route: require login
  useEffect(() => {
    if (!user) {
      router.replace("/admin-login");
    }
  }, [user, router]);

  // ✅ Subscribe to Firestore collections
  useEffect(() => {
    if (!user) return;

    const uid = user.uid;

    // Villas
    const villasRef = collection(db, "users", uid, "villas");
    const unsubVillas = onSnapshot(villasRef, (snap) => {
      setVillas(snap.docs.map((d) => ({ id: d.id, ...(d.data() as VillaDoc) })));
    });

    // Upcoming check-ins (bookings)
    const bookingsRef = collection(db, "users", uid, "villaBookings");
    const bookingsQ = query(bookingsRef, orderBy("checkInAt", "asc"), limit(10));
    const unsubBookings = onSnapshot(bookingsQ, (snap) => {
      setBookings(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as BookingDoc) }))
      );
    });

    // Tasks (count pending + in-progress)
    const tasksRef = collection(db, "users", uid, "villaTasks");
    const unsubTasks = onSnapshot(tasksRef, (snap) => {
      const all = snap.docs.map((d) => d.data() as TaskDoc);
      const pending = all.filter(
        (t) => t.status === "pending" || t.status === "in-progress"
      ).length;
      setPendingTasksCount(pending);
    });

    // Revenue (sum of payments)
    const paymentsRef = collection(db, "users", uid, "villaPayments");
    const unsubPayments = onSnapshot(paymentsRef, (snap) => {
      const sum = snap.docs.reduce((acc, d) => {
        const data = d.data() as PaymentDoc;
        return acc + (typeof data.amount === "number" ? data.amount : 0);
      }, 0);
      setTotalRevenue(sum);
    });

    return () => {
      unsubVillas();
      unsubBookings();
      unsubTasks();
      unsubPayments();
    };
  }, [user]);

  const filteredVillas = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return villas;

    return villas.filter((v) => {
      const name = (v.name ?? "").toLowerCase();
      const loc = (v.location ?? "").toLowerCase();
      return name.includes(s) || loc.includes(s);
    });
  }, [villas, search]);

  const bookedCount = useMemo(
    () => villas.filter((v) => (v.status ?? "AVAILABLE") === "BOOKED").length,
    [villas]
  );

  const occupancyRate = useMemo(() => {
    if (villas.length === 0) return 0;
    return Math.round((bookedCount / villas.length) * 100);
  }, [bookedCount, villas.length]);

  const stats = useMemo(
    () => [
      {
        title: "Total Revenue",
        value: formatMoney(totalRevenue),
        delta: totalRevenue > 0 ? "+12.5%" : "—",
        icon: "cash-outline" as const,
        accent: "#16A34A",
        tint: "rgba(22, 163, 74, 0.10)",
      },
      {
        title: "Occupancy Rate",
        value: `${occupancyRate}%`,
        delta: villas.length > 0 ? "+4.2%" : "—",
        icon: "bed-outline" as const,
        accent: "#2563EB",
        tint: "rgba(37, 99, 235, 0.10)",
      },
      {
        title: "Pending Tasks",
        value: `${pendingTasksCount}`,
        delta: pendingTasksCount > 0 ? `${pendingTasksCount} New` : "—",
        icon: "alert-circle-outline" as const,
        accent: "#F97316",
        tint: "rgba(249, 115, 22, 0.10)",
      },
    ],
    [occupancyRate, pendingTasksCount, totalRevenue, villas.length]
  );

  const Sidebar = () => (
    <View style={styles.sidebar}>
      <View style={styles.sidebarTop}>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="home" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>VillaOS</Text>
            <Text style={styles.brandSub}>Luxury Estate Management</Text>
          </View>
        </View>

        <View style={styles.sidebarNav}>
          <SidebarItem
            active={activeNav === "dashboard"}
            icon="grid-outline"
            label="Dashboard"
            onPress={() => setActiveNav("dashboard")}
          />

          {/* ✅ Properties redirects to inventory screen */}
          <SidebarItem
            active={activeNav === "properties"}
            icon="home-outline"
            label="Properties"
            onPress={() => {
              setActiveNav("properties");

              // ✅ if your inventory file is app/villa-inventory.tsx
            //   router.push("/dashboard");

              // If your inventory file is app/properties.tsx instead, use:
              router.push("/properties");
            }}
          />

          <SidebarItem
            active={activeNav === "bookings"}
            icon="calendar-outline"
            label="Bookings"
            onPress={() => setActiveNav("bookings")}
          />
          <SidebarItem
            active={activeNav === "maintenance"}
            icon="construct-outline"
            label="Maintenance"
            onPress={() => setActiveNav("maintenance")}
          />
          <SidebarItem
            active={activeNav === "finance"}
            icon="card-outline"
            label="Finance"
            onPress={() => setActiveNav("finance")}
          />
          <SidebarItem
            active={activeNav === "staff"}
            icon="people-outline"
            label="Staff Management"
            onPress={() => setActiveNav("staff")}
          />
        </View>
      </View>

      <View style={styles.sidebarBottom}>
        <SidebarItem icon="settings-outline" label="Settings" onPress={() => {}} />
        <SidebarItem icon="help-circle-outline" label="Support" onPress={() => {}} />

        <Pressable
          onPress={() => router.replace("/ownership")}
          style={({ pressed }) => [
            styles.switchTypeBtn,
            pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
          ]}
        >
          <Ionicons name="swap-horizontal-outline" size={16} color="#2563EB" />
          <Text style={styles.switchTypeText}>Change Property Type</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        {isDesktop ? <Sidebar /> : null}

        <View style={styles.main}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            {!isDesktop ? (
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

            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color="#6B7280" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search for properties, bookings, tasks..."
                placeholderTextColor="#9CA3AF"
                style={styles.searchInput}
              />
            </View>

            <View style={styles.topRight}>
              <Pressable
                onPress={() => {}}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="notifications-outline" size={18} color="#111827" />
                <View style={styles.notifDot} />
              </Pressable>

              <View style={styles.profile}>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.profileName}>
                    {user?.email ? user.email.split("@")[0] : "Owner"}
                  </Text>
                  <Text style={styles.profileRole}>Property Owner</Text>
                </View>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(user?.email?.[0] ?? "A").toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Greeting row */}
            <View style={styles.greetingRow}>
              <View style={{ flex: 1, minWidth: 260 }}>
                <Text style={styles.greetingTitle}>Good Morning</Text>
                <Text style={styles.greetingSub}>
                  Your properties are looking good today. Here’s a quick overview.
                </Text>
              </View>

              <Pressable
                onPress={() => {}}
                style={({ pressed }) => [
                  styles.addVillaBtn,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
                ]}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addVillaText}>Add New Villa</Text>
              </Pressable>
            </View>

            {/* Stats row */}
            <View style={[styles.statsRow, !isTwoCol && { flexDirection: "column" }]}>
              {stats.map((s) => (
                <View key={s.title} style={styles.statCard}>
                  <View style={styles.statTop}>
                    <View style={[styles.statIcon, { backgroundColor: s.tint }]}>
                      <Ionicons name={s.icon} size={18} color={s.accent} />
                    </View>
                    <Text style={[styles.statDelta, { color: s.accent }]}>{s.delta}</Text>
                  </View>

                  <Text style={styles.statLabel}>{s.title}</Text>
                  <Text style={styles.statValue}>{s.value}</Text>
                </View>
              ))}
            </View>

            {/* Properties + Check-ins layout */}
            <View style={[styles.mainGrid, !isTwoCol && { flexDirection: "column" }]}>
              {/* Properties */}
              <View style={{ flex: 1 }}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Properties Overview</Text>

                  {/* optional: also route from here */}
                  <Pressable onPress={() => router.push("/dashboard")}>
                    <Text style={styles.viewAll}>View All</Text>
                  </Pressable>
                </View>

                <View
                  style={[
                    styles.propertiesRow,
                    { flexDirection: isTwoCol ? "row" : "column" },
                  ]}
                >
                  {filteredVillas.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Ionicons name="home-outline" size={26} color="#9CA3AF" />
                      <Text style={styles.emptyTitle}>No villas found</Text>
                      <Text style={styles.emptySub}>
                        Add villas in Firestore under users/{`{uid}`}/villas or build an “Add Villa” form.
                      </Text>
                    </View>
                  ) : (
                    filteredVillas.slice(0, 2).map((p) => {
                      const status = p.status ?? "AVAILABLE";
                      const statusColor = status === "BOOKED" ? "#F97316" : "#16A34A";
                      const statusBg =
                        status === "BOOKED"
                          ? "rgba(249, 115, 22, 0.12)"
                          : "rgba(22, 163, 74, 0.12)";

                      const imageUri =
                        p.imageUrl ??
                        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1400&q=80";

                      return (
                        <View key={p.id} style={styles.propertyCard}>
                          <View style={styles.propertyImageWrap}>
                            <Image source={{ uri: imageUri }} style={styles.propertyImage} />
                            <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
                              <Text style={[styles.statusText, { color: statusColor }]}>
                                {status}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.propertyBody}>
                            <Text style={styles.propertyTitle}>{p.name ?? "Unnamed Villa"}</Text>
                            <View style={styles.locationRow}>
                              <Ionicons name="location-outline" size={14} color="#6B7280" />
                              <Text style={styles.propertyLocation}>{p.location ?? "-"}</Text>
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.propertyMetaRow}>
                              <View style={styles.metaPill}>
                                <Ionicons name="bed-outline" size={14} color="#2563EB" />
                                <Text style={styles.metaText}>{p.beds ?? 0}</Text>
                              </View>
                              <View style={styles.metaPill}>
                                <Ionicons name="water-outline" size={14} color="#2563EB" />
                                <Text style={styles.metaText}>{p.baths ?? 0}</Text>
                              </View>

                              <View style={{ flex: 1 }} />

                              <Text style={styles.priceText}>
                                {typeof p.pricePerNight === "number"
                                  ? `${formatMoney(p.pricePerNight)}/night`
                                  : "-"}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>

                {/* Revenue Analysis placeholder */}
                <View style={styles.bigCard}>
                  <View style={styles.bigCardHeader}>
                    <View>
                      <Text style={styles.bigTitle}>Revenue Analysis</Text>
                      <Text style={styles.bigSub}>Monthly earnings comparison</Text>
                    </View>
                    <View style={styles.rangePill}>
                      <Text style={styles.rangeText}>Last 6 Months</Text>
                    </View>
                  </View>

                  <View style={styles.chartPlaceholder}>
                    <View style={styles.chartLine} />
                    <View style={styles.chartLine} />
                    <View style={styles.chartLine} />
                    <Text style={styles.chartHint}>
                      Chart placeholder (connect your real data later)
                    </Text>
                  </View>
                </View>
              </View>

              {/* Check-ins + Maintenance */}
              <View style={{ width: isTwoCol ? 330 : "100%" }}>
                <View style={styles.sideCard}>
                  <Text style={styles.sideTitle}>Upcoming Check-ins</Text>

                  {bookings.length === 0 ? (
                    <View style={styles.miniEmpty}>
                      <Ionicons name="calendar-outline" size={20} color="#9CA3AF" />
                      <Text style={styles.miniEmptyText}>No upcoming check-ins</Text>
                    </View>
                  ) : (
                    bookings.slice(0, 6).map((c) => {
                      const guestName = c.guestName ?? "Guest";
                      const villaName = c.villaName ?? "Villa";
                      const dt = c.checkInAt?.toDate?.();
                      const timeText =
                        dt instanceof Date
                          ? dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "--:--";
                      const dayText =
                        dt instanceof Date
                          ? dt.toLocaleDateString([], { month: "short", day: "2-digit" })
                          : "—";

                      return (
                        <View key={c.id} style={styles.checkinRow}>
                          <View style={styles.checkinAvatar}>
                            <Text style={styles.checkinAvatarText}>
                              {guestName.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.checkinName}>{guestName}</Text>
                            <Text style={styles.checkinSub}>
                              {villaName} • {dayText.toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.timePill}>
                            <Text style={styles.timeText}>{timeText}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}

                  <Pressable
                    onPress={() => {}}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
                    ]}
                  >
                    <Text style={styles.secondaryBtnText}>View Full Calendar</Text>
                  </Pressable>
                </View>

                <View style={styles.sideCard}>
                  <Text style={styles.sideTitle}>Maintenance Status</Text>

                  <View style={styles.maintGrid}>
                    <View style={styles.maintItem}>
                      <View style={[styles.maintIcon, { backgroundColor: "rgba(37,99,235,0.10)" }]}>
                        <Ionicons name="snow-outline" size={18} color="#2563EB" />
                      </View>
                      <Text style={styles.maintLabel}>HVAC SYSTEMS</Text>
                      <Text style={styles.maintValue}>Optimal</Text>
                    </View>

                    <View style={styles.maintItem}>
                      <View style={[styles.maintIcon, { backgroundColor: "rgba(59,130,246,0.10)" }]}>
                        <Ionicons name="water-outline" size={18} color="#3B82F6" />
                      </View>
                      <Text style={styles.maintLabel}>POOL SERVICE</Text>
                      <Text style={styles.maintValue}>
                        {pendingTasksCount > 0 ? `Pending (${pendingTasksCount})` : "No Pending"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ height: 18 }} />
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

function SidebarItem({
  icon,
  label,
  onPress,
  active,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  active?: boolean;
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
      <Text style={[styles.navText, active && { color: "#2563EB" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

// ✅ Styles: kept exactly from your original (no UI changes)
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  page: { flex: 1, flexDirection: "row", backgroundColor: "#F9FAFB" },

  sidebar: {
    width: 260,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
    padding: 16,
    justifyContent: "space-between",
  },
  sidebarTop: {},
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 12,
  },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  brandSub: { marginTop: 2, fontSize: 12, fontWeight: "700", color: "#6B7280" },

  sidebarNav: { marginTop: 10, gap: 6 },
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
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  switchTypeBtn: {
    marginTop: 10,
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
  switchTypeText: { color: "#2563EB", fontWeight: "900", fontSize: 12 },

  main: { flex: 1 },
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
  searchWrap: {
    flex: 1,
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
  topRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: {
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
  profileRole: { fontSize: 12, fontWeight: "700", color: "#2563EB", marginTop: 2 },
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

  greetingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },
  greetingTitle: { fontSize: 30, fontWeight: "900", color: "#111827" },
  greetingSub: { marginTop: 6, fontSize: 14, fontWeight: "700", color: "#6B7280", lineHeight: 20 },

  addVillaBtn: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  addVillaText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  statsRow: { marginTop: 16, flexDirection: "row", gap: 12 },
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
  statIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  statDelta: { fontWeight: "900", fontSize: 12 },
  statLabel: { marginTop: 12, fontSize: 13, fontWeight: "800", color: "#2563EB" },
  statValue: { marginTop: 6, fontSize: 24, fontWeight: "900", color: "#111827" },

  mainGrid: { marginTop: 18, flexDirection: "row", gap: 12 },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  viewAll: { color: "#2563EB", fontWeight: "900", fontSize: 13 },

  propertiesRow: { gap: 12 },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
  },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: "900", color: "#111827" },
  emptySub: { marginTop: 6, fontSize: 12, fontWeight: "700", color: "#6B7280", textAlign: "center", lineHeight: 18 },

  propertyCard: {
    flex: 1,
    minWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  propertyImageWrap: { height: 180, backgroundColor: "#F3F4F6" },
  propertyImage: { width: "100%", height: "100%" },
  statusPill: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: { fontWeight: "900", fontSize: 11, letterSpacing: 0.6 },

  propertyBody: { padding: 14 },
  propertyTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  locationRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  propertyLocation: { color: "#6B7280", fontWeight: "700", fontSize: 12 },
  divider: { height: 1, backgroundColor: "#E5E7EB", marginTop: 12, marginBottom: 12 },
  propertyMetaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  metaText: { fontWeight: "900", color: "#111827" },
  priceText: { fontWeight: "900", color: "#2563EB" },

  sideCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 12,
  },
  sideTitle: { fontSize: 16, fontWeight: "900", color: "#111827", marginBottom: 10 },

  miniEmpty: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  miniEmptyText: { marginTop: 6, color: "#9CA3AF", fontWeight: "800" },

  checkinRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  checkinAvatar: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkinAvatarText: { fontWeight: "900", color: "#2563EB" },
  checkinName: { fontWeight: "900", color: "#111827" },
  checkinSub: { marginTop: 2, fontWeight: "800", fontSize: 11, color: "#6B7280" },
  timePill: { backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  timeText: { fontWeight: "900", fontSize: 11, color: "#111827" },

  secondaryBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#2563EB", fontWeight: "900" },

  bigCard: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  bigCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  bigTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  bigSub: { marginTop: 4, fontSize: 12, fontWeight: "700", color: "#6B7280" },
  rangePill: { backgroundColor: "#F3F4F6", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  rangeText: { fontWeight: "900", fontSize: 11, color: "#111827" },

  chartPlaceholder: {
    marginTop: 12,
    height: 160,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    justifyContent: "center",
    gap: 10,
  },
  chartLine: { height: 10, borderRadius: 999, backgroundColor: "rgba(37, 99, 235, 0.10)" },
  chartHint: { marginTop: 8, textAlign: "center", color: "#9CA3AF", fontWeight: "800", fontSize: 12 },

  maintGrid: { flexDirection: "row", gap: 12 },
  maintItem: { flex: 1, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, padding: 12 },
  maintIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  maintLabel: { fontSize: 10, fontWeight: "900", color: "#2563EB", letterSpacing: 0.8 },
  maintValue: { marginTop: 6, fontSize: 14, fontWeight: "900", color: "#111827" },
});