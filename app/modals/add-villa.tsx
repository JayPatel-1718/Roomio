import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Switch,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";

export default function AddVilla() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 980;

  const user = getAuth().currentUser;

  // --------------------
  // Form State
  // --------------------
  const [villaName, setVillaName] = useState("");
  const [propertyType, setPropertyType] = useState("Luxury Villa");
  const [description, setDescription] = useState("");

  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [pincode, setPincode] = useState("");

  const [activeListing, setActiveListing] = useState(true);
  const [featured, setFeatured] = useState(false);

  const [nightlyRate, setNightlyRate] = useState("");
  const [weekendRate, setWeekendRate] = useState("");
  const [deposit, setDeposit] = useState("");
  const [cleaning, setCleaning] = useState("");

  const [coverPhotoUrl, setCoverPhotoUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const [saving, setSaving] = useState(false);

  const computedLocation = useMemo(() => {
    const parts = [city?.trim(), stateProv?.trim()].filter(Boolean);
    return parts.length ? parts.join(", ") : "-";
  }, [city, stateProv]);

  const toNumberOrNull = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const handleSave = async (mode: "draft" | "publish") => {
    if (!user) {
      Alert.alert("Not Logged In", "Please login again.");
      router.replace("/admin-login");
      return;
    }

    if (!villaName.trim()) {
      Alert.alert("Missing Villa Name", "Please enter the villa name.");
      return;
    }

    setSaving(true);

    try {
      const uid = user.uid;

      const payload = {
        // Basic
        name: villaName.trim(),
        propertyType: propertyType.trim() || "Luxury Villa",
        description: description.trim() || "",

        // Location
        street: street.trim() || "",
        city: city.trim() || "",
        state: stateProv.trim() || "",
        pincode: pincode.trim() || "",
        location: computedLocation, // ✅ used by dashboard cards

        // Visibility
        activeListing: !!activeListing,
        featured: !!featured,

        // Pricing
        pricePerNight: toNumberOrNull(nightlyRate),
        weekendRate: toNumberOrNull(weekendRate),
        deposit: toNumberOrNull(deposit),
        cleaningFee: toNumberOrNull(cleaning),

        // Media
        imageUrl: coverPhotoUrl.trim() || "", // ✅ used by dashboard cards
        videoUrl: videoUrl.trim() || "",

        // Status (dashboard uses AVAILABLE/BOOKED; here we set AVAILABLE by default)
        status: activeListing ? "AVAILABLE" : "AVAILABLE",

        // Publish/Draft
        isDraft: mode === "draft",
        publishedAt: mode === "publish" ? serverTimestamp() : null,

        // Meta
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ownerUid: uid,
        ownerEmail: user.email || "",
      };

      await addDoc(collection(db, "users", uid, "villas"), payload);

      Alert.alert(
        mode === "draft" ? "Saved as Draft" : "Published",
        mode === "draft"
          ? "Villa draft saved successfully."
          : "Villa published successfully.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      console.log("ADD VILLA ERROR:", e);
      Alert.alert("Error", e?.message || "Failed to save villa");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.page}>
          {/* Background decor */}
          <View style={styles.backgroundDecor} pointerEvents="none">
            <View style={styles.bgCircle1} />
            <View style={styles.bgCircle2} />
            <View style={styles.bgCircle3} />
          </View>

          {/* Top Bar */}
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons name="arrow-back" size={18} color="#2563EB" />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={styles.topTitle}>Add New Villa</Text>
              <Text style={styles.topSub}>
                Create a new listing for your property portfolio
              </Text>
            </View>

            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.cancelBtn,
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              disabled={saving}
              onPress={() => handleSave("draft")}
              style={({ pressed }) => [
                styles.draftBtn,
                saving && { opacity: 0.7 },
                pressed && !saving && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text style={styles.draftText}>
                {saving ? "Saving..." : "Save as Draft"}
              </Text>
            </Pressable>

            <Pressable
              disabled={saving}
              onPress={() => handleSave("publish")}
              style={({ pressed }) => [
                styles.publishBtn,
                saving && { opacity: 0.7 },
                pressed && !saving && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Text style={styles.publishText}>
                {saving ? "Publishing..." : "Publish Villa"}
              </Text>
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.grid, !isWide && { flexDirection: "column" }]}>
              {/* LEFT COLUMN */}
              <View style={{ flex: 1, minWidth: 320 }}>
                {/* Basic Details */}
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIcon}>
                      <Ionicons name="information-circle-outline" size={18} color="#2563EB" />
                    </View>
                    <Text style={styles.cardTitle}>Basic Details</Text>
                  </View>

                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>VILLA NAME</Text>
                      <View style={styles.inputWrap}>
                        <TextInput
                          value={villaName}
                          onChangeText={setVillaName}
                          placeholder="e.g. Villa Azure Mykonos"
                          placeholderTextColor="#9CA3AF"
                          style={styles.input}
                        />
                      </View>
                    </View>

                    <View style={{ width: isWide ? 260 : "100%" }}>
                      <Text style={styles.label}>PROPERTY TYPE</Text>
                      <View style={styles.inputWrap}>
                        <TextInput
                          value={propertyType}
                          onChangeText={setPropertyType}
                          placeholder="Luxury Villa"
                          placeholderTextColor="#9CA3AF"
                          style={styles.input}
                        />
                        <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
                      </View>
                    </View>
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>DESCRIPTION</Text>
                  <View style={[styles.inputWrap, { height: 120, alignItems: "flex-start" }]}>
                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Describe the property's unique features, surroundings, and experience..."
                      placeholderTextColor="#9CA3AF"
                      style={[styles.input, { height: 120, textAlignVertical: "top" }]}
                      multiline
                    />
                  </View>
                </View>

                {/* Location */}
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIcon}>
                      <Ionicons name="location-outline" size={18} color="#2563EB" />
                    </View>
                    <Text style={styles.cardTitle}>Location</Text>
                  </View>

                  <Text style={styles.label}>STREET ADDRESS</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      value={street}
                      onChangeText={setStreet}
                      placeholder="Enter street address"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                    />
                  </View>

                  <View style={[styles.row, { marginTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>CITY</Text>
                      <View style={styles.inputWrap}>
                        <TextInput
                          value={city}
                          onChangeText={setCity}
                          placeholder="City"
                          placeholderTextColor="#9CA3AF"
                          style={styles.input}
                        />
                      </View>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>STATE / PROVINCE</Text>
                      <View style={styles.inputWrap}>
                        <TextInput
                          value={stateProv}
                          onChangeText={setStateProv}
                          placeholder="State"
                          placeholderTextColor="#9CA3AF"
                          style={styles.input}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={{ marginTop: 12, maxWidth: 260 }}>
                    <Text style={styles.label}>PINCODE / ZIP</Text>
                    <View style={styles.inputWrap}>
                      <TextInput
                        value={pincode}
                        onChangeText={setPincode}
                        placeholder="Pincode"
                        placeholderTextColor="#9CA3AF"
                        style={styles.input}
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>

                  <View style={styles.mapPlaceholder}>
                    <Ionicons name="map-outline" size={22} color="#2563EB" />
                    <Text style={styles.mapText}>Map preview placeholder</Text>
                    <Text style={styles.mapHint}>Location: {computedLocation}</Text>
                  </View>
                </View>
              </View>

              {/* RIGHT COLUMN */}
              <View style={{ width: isWide ? 360 : "100%" }}>
                {/* Visibility */}
                <View style={styles.card}>
                  <Text style={styles.sideTitle}>Villa Visibility</Text>

                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchTitle}>Active Listing</Text>
                      <Text style={styles.switchSub}>Show villa on the marketplace</Text>
                    </View>
                    <Switch
                      value={activeListing}
                      onValueChange={setActiveListing}
                      trackColor={{ false: "#E5E7EB", true: "rgba(37,99,235,0.35)" }}
                      thumbColor={activeListing ? "#2563EB" : "#9CA3AF"}
                    />
                  </View>

                  <View style={[styles.switchRow, { marginTop: 10 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchTitle}>Featured Property</Text>
                      <Text style={styles.switchSub}>Display in homepage slider</Text>
                    </View>
                    <Switch
                      value={featured}
                      onValueChange={setFeatured}
                      trackColor={{ false: "#E5E7EB", true: "rgba(37,99,235,0.35)" }}
                      thumbColor={featured ? "#2563EB" : "#9CA3AF"}
                    />
                  </View>
                </View>

                {/* Pricing */}
                <View style={styles.card}>
                  <Text style={styles.sideTitle}>Pricing & Fees</Text>

                  <Text style={styles.label}>NIGHTLY RATE ($)</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      value={nightlyRate}
                      onChangeText={setNightlyRate}
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>WEEKEND RATE ($)</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      value={weekendRate}
                      onChangeText={setWeekendRate}
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <View style={[styles.row, { marginTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>DEPOSIT</Text>
                      <View style={styles.inputWrap}>
                        <TextInput
                          value={deposit}
                          onChangeText={setDeposit}
                          placeholder="0"
                          placeholderTextColor="#9CA3AF"
                          style={styles.input}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>CLEANING</Text>
                      <View style={styles.inputWrap}>
                        <TextInput
                          value={cleaning}
                          onChangeText={setCleaning}
                          placeholder="0"
                          placeholderTextColor="#9CA3AF"
                          style={styles.input}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Media */}
                <View style={styles.card}>
                  <Text style={styles.sideTitle}>Media Assets</Text>

                  <Text style={styles.label}>COVER PHOTO (URL)</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      value={coverPhotoUrl}
                      onChangeText={setCoverPhotoUrl}
                      placeholder="https://..."
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={styles.uploadBox}>
                    <Ionicons name="image-outline" size={20} color="#2563EB" />
                    <Text style={styles.uploadText}>Upload main image (URL for now)</Text>
                    <Text style={styles.uploadHint}>
                      (Later you can connect Firebase Storage)
                    </Text>
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>VIDEO WALKTHROUGH (URL)</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      value={videoUrl}
                      onChangeText={setVideoUrl}
                      placeholder="YouTube or Vimeo link"
                      placeholderTextColor="#9CA3AF"
                      style={styles.input}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>
            </View>

            <View style={{ height: 18 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  page: { flex: 1, backgroundColor: "#F9FAFB" },

  backgroundDecor: { position: "absolute", inset: 0 },
  bgCircle1: {
    position: "absolute",
    top: -100,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(37,99,235,0.08)",
  },
  bgCircle2: {
    position: "absolute",
    top: 140,
    left: -120,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(37,99,235,0.05)",
  },
  bgCircle3: {
    position: "absolute",
    bottom: 40,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(37,99,235,0.06)",
  },

  topBar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  topSub: { marginTop: 4, fontSize: 12, fontWeight: "700", color: "#6B7280" },

  cancelBtn: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#2563EB", fontWeight: "900" },

  draftBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  draftText: { color: "#111827", fontWeight: "900" },

  publishBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  publishText: { color: "#fff", fontWeight: "900" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  grid: { flexDirection: "row", gap: 12 },

  card: {
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

  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "900", color: "#111827" },

  label: { fontSize: 11, fontWeight: "900", color: "#2563EB", letterSpacing: 1.0 },
  inputWrap: {
    marginTop: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },

  row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },

  sideTitle: { fontSize: 15, fontWeight: "900", color: "#111827", marginBottom: 10 },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  switchTitle: { fontSize: 13, fontWeight: "900", color: "#111827" },
  switchSub: { marginTop: 3, fontSize: 12, fontWeight: "700", color: "#6B7280" },

  uploadBox: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderStyle: "dashed",
    backgroundColor: "#F9FAFB",
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  uploadText: { color: "#111827", fontWeight: "900" },
  uploadHint: { color: "#6B7280", fontWeight: "700", fontSize: 12 },

  mapPlaceholder: {
    marginTop: 14,
    height: 140,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mapText: { fontWeight: "900", color: "#111827" },
  mapHint: { fontWeight: "700", color: "#6B7280", fontSize: 12 },
});