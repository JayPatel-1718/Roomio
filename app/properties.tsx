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
import { getAuth } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

type VillaStatus = "AVAILABLE" | "BOOKED" | "MAINTENANCE";

type Villa = {
  id: string;
  name: string;
  location: string;
  status: VillaStatus;
  pricePerNight: number;
  beds: number;
  baths: number;
  imageUrl: string;
  isFavorite?: boolean;
};

const DEMO_VILLAS: Villa[] = [
  {
    id: "demo-1",
    name: "Villa Azure",
    location: "Mykonos, Greece",
    status: "AVAILABLE",
    pricePerNight: 2450,
    beds: 5,
    baths: 6,
    imageUrl:
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1400&q=80",
    isFavorite: false,
  },
  {
    id: "demo-2",
    name: "Sanctuary Palms",
    location: "Bali, Indonesia",
    status: "BOOKED",
    pricePerNight: 1800,
    beds: 3,
    baths: 4,
    imageUrl:
      "https://images.unsplash.com/photo-1505691723518-36a5ac3b2d91?auto=format&fit=crop&w=1400&q=80",
    isFavorite: true,
  },
  {
    id: "demo-3",
    name: "The Concrete Loft",
    location: "Palm Springs, USA",
    status: "MAINTENANCE",
    pricePerNight: 3200,
    beds: 4,
    baths: 4,
    imageUrl:
      "https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?auto=format&fit=crop&w=1400&q=80",
    isFavorite: false,
  },
  {
    id: "demo-4",
    name: "Olive Grove Estate",
    location: "Tuscany, Italy",
    status: "AVAILABLE",
    pricePerNight: 1550,
    beds: 6,
    baths: 5,
    imageUrl:
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=80",
    isFavorite: false,
  },
  {
    id: "demo-5",
    name: "Glass House North",
    location: "Aspen, USA",
    status: "AVAILABLE",
    pricePerNight: 4100,
    beds: 4,
    baths: 4,
    imageUrl:
      "https://images.unsplash.com/photo-1520608421741-68228b76b6df?auto=format&fit=crop&w=1400&q=80",
    isFavorite: false,
  },
];

function money(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}

function statusStyle(status: VillaStatus) {
  switch (status) {
    case "AVAILABLE":
      return { bg: "#22C55E", text: "#FFFFFF" };
    case "BOOKED":
      return { bg: "#2563EB", text: "#FFFFFF" };
    case "MAINTENANCE":
      return { bg: "#F59E0B", text: "#111827" };
    default:
      return { bg: "#6B7280", text: "#FFFFFF" };
  }
}

export default function Properties() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 980;
  const cols = width >= 1100 ? 3 : width >= 820 ? 2 : 1;

  const auth = getAuth();
  const user = auth.currentUser;

  const [search, setSearch] = useState("");
  const [villas, setVillas] = useState<Villa[]>([]);

  // Demo filter UI state (visual only for now)
  const [locationFilter, setLocationFilter] = useState("All");
  const [priceFilter, setPriceFilter] = useState("Price Range");
  const [statusFilter, setStatusFilter] = useState("Available");

  // Protect route
  useEffect(() => {
    if (!user) router.replace("/admin-login");
  }, [user, router]);

  // Load villas from Firestore, fallback to demo if empty
  useEffect(() => {
    if (!user) return;

    const uid = user.uid;
    const ref = collection(db, "users", uid, "villas");

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name ?? "Unnamed Villa",
            location: data.location ?? "-",
            status: (data.status ?? "AVAILABLE") as VillaStatus,
            pricePerNight: typeof data.pricePerNight === "number" ? data.pricePerNight : 0,
            beds: typeof data.beds === "number" ? data.beds : 0,
            baths: typeof data.baths === "number" ? data.baths : 0,
            imageUrl:
              data.imageUrl ??
              "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1400&q=80",
            isFavorite: !!data.isFavorite,
          } as Villa;
        });

        setVillas(list.length ? list : DEMO_VILLAS);
      },
      () => {
        // if permission denied or anything, still show demo to match UI
        setVillas(DEMO_VILLAS);
      }
    );

    return () => unsub();
  }, [user]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return villas;
    return villas.filter((v) => {
      const a = (v.name ?? "").toLowerCase();
      const b = (v.location ?? "").toLowerCase();
      const c = (v.status ?? "").toLowerCase();
      return a.includes(s) || b.includes(s) || c.includes(s);
    });
  }, [search, villas]);

  const gridRows = useMemo(() => {
    const rows: Villa[][] = [];
    for (let i = 0; i < filtered.length; i += cols) {
      rows.push(filtered.slice(i, i + cols));
    }
    return rows;
  }, [filtered, cols]);

  const ownerName = useMemo(() => {
    const email = user?.email ?? "Alex Morgan";
    const base = email.includes("@") ? email.split("@")[0] : email;
    const name = base
      .split(/[._-]/g)
      .filter(Boolean)
      .map((x) => x[0].toUpperCase() + x.slice(1))
      .join(" ");
    return name || "Alex Morgan";
  }, [user?.email]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        {/* Sidebar (Desktop) */}
        {isDesktop ? (
          <View style={styles.sidebar}>
            <View>
              {/* Brand */}
              <View style={styles.brandRow}>
                <View style={styles.brandIcon}>
                  <Ionicons name="business-outline" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.brandTitle}>Villa Group</Text>
                  <Text style={styles.brandSub}>Premium Portfolio</Text>
                </View>
              </View>

              {/* Nav */}
              <View style={styles.nav}>
                <SidebarItem label="Overview" icon="grid-outline" onPress={() => router.back()} />
                <SidebarItem label="Inventory" icon="home-outline" active onPress={() => {}} />
                <SidebarItem label="Bookings" icon="calendar-outline" onPress={() => {}} />
                <SidebarItem label="Maintenance" icon="construct-outline" onPress={() => {}} />
                <SidebarItem label="Financials" icon="card-outline" onPress={() => {}} />
              </View>
            </View>

            {/* Bottom user */}
            <View style={styles.sidebarBottom}>
              <View style={styles.userRow}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {(ownerName?.[0] ?? "A").toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{ownerName}</Text>
                  <Text style={styles.userSub}>Admin Account</Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* Main */}
        <View style={styles.main}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color="#6B7280" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by villa name, ID or location..."
                placeholderTextColor="#9CA3AF"
                style={styles.searchInput}
              />
            </View>

            <View style={styles.topRight}>
              <Pressable style={styles.topIconBtn}>
                <Ionicons name="notifications-outline" size={18} color="#111827" />
                <View style={styles.notifDot} />
              </Pressable>

              <Pressable style={styles.topIconBtn}>
                <Ionicons name="settings-outline" size={18} color="#111827" />
              </Pressable>
            </View>
          </View>

          {/* Body */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header row */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1, minWidth: 260 }}>
                <Text style={styles.pageTitle}>Property Inventory</Text>
                <Text style={styles.pageSub}>
                  Manage and monitor {filtered.length || 24} premium luxury properties in your portfolio.
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.addBtn,
                  pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
                ]}
                onPress={() => {}}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Add New Villa</Text>
              </Pressable>
            </View>

            {/* Filters row */}
            <View style={styles.filtersRow}>
              <FilterPill
                label={`Location: ${locationFilter}`}
                onPress={() => setLocationFilter((p) => (p === "All" ? "All" : "All"))}
              />
              <FilterPill
                label={priceFilter}
                onPress={() => setPriceFilter((p) => (p === "Price Range" ? "Price Range" : "Price Range"))}
              />
              <FilterPill
                label={`Status: ${statusFilter}`}
                onPress={() => setStatusFilter((p) => (p === "Available" ? "Available" : "Available"))}
              />
              <Pressable style={({ pressed }) => [styles.moreFilters, pressed && { opacity: 0.92 }]}>
                <Ionicons name="options-outline" size={16} color="#6B7280" />
                <Text style={styles.moreFiltersText}>More Filters</Text>
              </Pressable>
            </View>

            {/* Grid */}
            <View style={styles.gridWrap}>
              {gridRows.map((row, idx) => (
                <View key={`row-${idx}`} style={[styles.gridRow, { gap: 16 }]}>
                  {row.map((v) => (
                    <View key={v.id} style={[styles.card, { flex: 1 }]}>
                      {/* Image */}
                      <View style={styles.imageWrap}>
                        <Image source={{ uri: v.imageUrl }} style={styles.image} />
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: statusStyle(v.status).bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: statusStyle(v.status).text },
                            ]}
                          >
                            {v.status}
                          </Text>
                        </View>

                        <View style={styles.heartBtn}>
                          <Ionicons name={v.isFavorite ? "heart" : "heart-outline"} size={18} color="#FFFFFF" />
                        </View>
                      </View>

                      {/* Body */}
                      <View style={styles.cardBody}>
                        <View style={styles.titleRow}>
                          <Text style={styles.cardTitle} numberOfLines={1}>
                            {v.name}
                          </Text>
                          <Text style={styles.price}>
                            {money(v.pricePerNight)}
                            <Text style={styles.perNight}>/nt</Text>
                          </Text>
                        </View>

                        <View style={styles.locationRow}>
                          <Ionicons name="location" size={14} color="#64748B" />
                          <Text style={styles.locationText} numberOfLines={1}>
                            {v.location}
                          </Text>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.metaRow}>
                          <View style={styles.metaLeft}>
                            <View style={styles.metaItem}>
                              <Ionicons name="bed-outline" size={16} color="#64748B" />
                              <Text style={styles.metaText}>{v.beds}</Text>
                            </View>
                            <View style={styles.metaItem}>
                              <Ionicons name="water-outline" size={16} color="#64748B" />
                              <Text style={styles.metaText}>{v.baths}</Text>
                            </View>
                          </View>

                          <View style={styles.metaActions}>
                            <Pressable style={styles.iconMiniBtn}>
                              <Ionicons name="create-outline" size={16} color="#64748B" />
                            </Pressable>
                            <Pressable style={styles.iconMiniBtn}>
                              <Ionicons name="calendar-outline" size={16} color="#64748B" />
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}

                  {/* Fill empty columns with spacers so grid aligns */}
                  {row.length < cols
                    ? Array.from({ length: cols - row.length }).map((_, i) => (
                        <View key={`spacer-${idx}-${i}`} style={{ flex: 1 }} />
                      ))
                    : null}
                </View>
              ))}

              {/* Add another villa tile (like screenshot) */}
              <View style={[styles.gridRow, { gap: 16, marginTop: 16 }]}>
                {cols === 1 ? null : (
                  <>
                    {/* empty spacers so it appears on the right like screenshot */}
                    {cols === 3 ? <View style={{ flex: 2 }} /> : <View style={{ flex: 1 }} />}
                  </>
                )}

                <Pressable
                  onPress={() => {}}
                  style={({ pressed }) => [
                    styles.addTile,
                    pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
                    { flex: 1 },
                  ]}
                >
                  <View style={styles.addTileCircle}>
                    <Ionicons name="add" size={22} color="#64748B" />
                  </View>
                  <Text style={styles.addTileTitle}>Add another villa</Text>
                  <Text style={styles.addTileSub}>Click to start setup</Text>
                </Pressable>
              </View>

              <View style={{ height: 24 }} />
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

function SidebarItem({
  label,
  icon,
  onPress,
  active,
}: {
  label: string;
  icon: any;
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
      <Ionicons name={icon} size={18} color={active ? "#2563EB" : "#64748B"} />
      <Text style={[styles.navLabel, active && { color: "#2563EB" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.filterPill, pressed && { opacity: 0.92 }]}>
      <Text style={styles.filterText}>{label}</Text>
      <Ionicons name="chevron-down" size={16} color="#64748B" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  page: { flex: 1, flexDirection: "row", backgroundColor: "#F8FAFC" },

  // Sidebar
  sidebar: {
    width: 250,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
    padding: 16,
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 14,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  brandSub: { marginTop: 2, fontSize: 12, fontWeight: "700", color: "#64748B" },

  nav: { gap: 8, marginTop: 8 },
  navItem: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navItemActive: {
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
  },
  navLabel: { fontSize: 13, fontWeight: "800", color: "#64748B" },

  sidebarBottom: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: { fontWeight: "900", color: "#111827" },
  userName: { fontSize: 13, fontWeight: "900", color: "#111827" },
  userSub: { marginTop: 2, fontSize: 12, fontWeight: "700", color: "#64748B" },

  // Main
  main: { flex: 1 },
  topBar: {
    height: 64,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  searchWrap: {
    flex: 1,
    maxWidth: 520,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    paddingVertical: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifDot: {
    position: "absolute",
    top: 8,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 18 },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },
  pageTitle: { fontSize: 34, fontWeight: "900", color: "#111827" },
  pageSub: { marginTop: 6, fontSize: 14, fontWeight: "700", color: "#64748B", lineHeight: 20 },

  addBtn: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: "#2563EB", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 8 },
      web: { boxShadow: "0 10px 18px rgba(37, 99, 235, 0.25)" } as any,
    }),
  },
  addBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },

  filtersRow: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  filterPill: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterText: { fontSize: 12, fontWeight: "800", color: "#111827" },

  moreFilters: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 2,
  },
  moreFiltersText: { fontSize: 12, fontWeight: "800", color: "#64748B" },

  gridWrap: { marginTop: 16 },
  gridRow: { flexDirection: "row" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 4 },
      web: { boxShadow: "0 10px 22px rgba(17,24,39,0.08)" } as any,
    }),
  },
  imageWrap: { height: 185, backgroundColor: "#F1F5F9" },
  image: { width: "100%", height: "100%" },

  statusBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },

  heartBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },

  cardBody: { padding: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#111827", flex: 1, minWidth: 0 },
  price: { fontSize: 14, fontWeight: "900", color: "#2563EB" },
  perNight: { fontSize: 12, fontWeight: "800", color: "#94A3B8" },

  locationRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { fontSize: 12, fontWeight: "700", color: "#64748B", flex: 1, minWidth: 0 },

  divider: { height: 1, backgroundColor: "#E5E7EB", marginTop: 12, marginBottom: 12 },

  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metaLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, fontWeight: "900", color: "#111827" },

  metaActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconMiniBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },

  addTile: {
    height: 340,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    borderStyle: "dashed",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  addTileCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 4 },
    }),
  },
  addTileTitle: { fontSize: 14, fontWeight: "900", color: "#1F2937" },
  addTileSub: { marginTop: 4, fontSize: 12, fontWeight: "700", color: "#64748B" },
});