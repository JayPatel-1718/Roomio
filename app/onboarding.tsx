import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from "react-native";
import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    setDoc,
    writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import logoImage from "../assets/images/logo.png";

const TOTAL_STEPS = 4;

type PropertyType = "Hotel";

function padRoom(roomNumber: number) {
    // For Ground floor numbers like 1 -> 001 (display only)
    if (roomNumber < 100) return String(roomNumber).padStart(3, "0");
    return String(roomNumber);
}

export default function Onboarding() {
    const router = useRouter();
    const auth = getAuth();
    const user = auth.currentUser;

    const { height, width } = useWindowDimensions();
    const isWide = width >= 900;

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Step 1
    const [propertyType, setPropertyType] = useState<PropertyType>("Hotel");

    // Step 2 (building)
    const [totalFloorsText, setTotalFloorsText] = useState("4");
    const [roomsPerFloorText, setRoomsPerFloorText] = useState("10");
    const [includeGroundFloor, setIncludeGroundFloor] = useState(true);

    // Step 3 (numbering)
    // suffixStart: 0 => 100,101.. and ground 000,001..
    // suffixStart: 1 => 101.. and ground 001..
    const [suffixStartText, setSuffixStartText] = useState("1");

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(14)).current;
    const progressAnim = useRef(new Animated.Value(step / TOTAL_STEPS)).current;

    useEffect(() => {
        if (!user) {
            router.replace("/admin-login");
            return;
        }
        animateStep();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    const animateStep = () => {
        fadeAnim.setValue(0);
        slideAnim.setValue(14);

        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 360,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 360,
                useNativeDriver: true,
            }),
            Animated.timing(progressAnim, {
                toValue: step / TOTAL_STEPS,
                duration: 360,
                useNativeDriver: false,
            }),
        ]).start();
    };

    const floorsCount = useMemo(() => {
        const n = parseInt(totalFloorsText || "0", 10);
        return Number.isFinite(n) ? n : 0;
    }, [totalFloorsText]);

    const roomsPerFloor = useMemo(() => {
        const n = parseInt(roomsPerFloorText || "0", 10);
        return Number.isFinite(n) ? n : 0;
    }, [roomsPerFloorText]);

    const suffixStart = useMemo(() => {
        const n = parseInt(suffixStartText || "0", 10);
        return Number.isFinite(n) ? n : 0;
    }, [suffixStartText]);

    const floorCodes = useMemo(() => {
        // If include ground: 0..(floorsCount-1)
        // Else: 1..floorsCount
        if (floorsCount <= 0) return [];
        if (includeGroundFloor) return Array.from({ length: floorsCount }, (_, i) => i);
        return Array.from({ length: floorsCount }, (_, i) => i + 1);
    }, [floorsCount, includeGroundFloor]);

    const totalRooms = useMemo(() => {
        if (floorsCount <= 0 || roomsPerFloor <= 0) return 0;
        return floorsCount * roomsPerFloor;
    }, [floorsCount, roomsPerFloor]);

    const preview = useMemo(() => {
        if (!floorCodes.length || roomsPerFloor <= 0) return [];
        return floorCodes.map((fc) => {
            const start = fc * 100 + suffixStart;
            const end = start + roomsPerFloor - 1;
            return {
                floorCode: fc,
                label: fc === 0 ? "Ground Floor" : `Floor ${fc}`,
                start,
                end,
            };
        });
    }, [floorCodes, roomsPerFloor, suffixStart]);

    const validateStep2 = () => {
        if (propertyType !== "Hotel") {
            Alert.alert("Not Supported", "Only Hotel is supported right now.");
            return false;
        }
        if (!Number.isFinite(floorsCount) || floorsCount <= 0 || floorsCount > 99) {
            Alert.alert("Invalid Floors", "Enter a valid number of floors (1–99).");
            return false;
        }
        if (!Number.isFinite(roomsPerFloor) || roomsPerFloor <= 0 || roomsPerFloor > 99) {
            Alert.alert("Invalid Rooms", "Rooms per floor must be 1–99.");
            return false;
        }
        return true;
    };

    const validateStep3 = () => {
        if (!Number.isFinite(suffixStart) || suffixStart < 0 || suffixStart > 99) {
            Alert.alert("Invalid Start", "Room suffix start must be between 0 and 99.");
            return false;
        }

        // Prevent crossing to next hundred (prevents gaps like 150/160 when roomsPerFloor=10)
        const maxSuffix = suffixStart + roomsPerFloor - 1;
        if (maxSuffix > 99) {
            Alert.alert(
                "Invalid Distribution",
                `Rooms per floor (${roomsPerFloor}) with start (${suffixStart}) would cross into next floor.\n\nRule: start + roomsPerFloor - 1 must be <= 99`
            );
            return false;
        }

        return true;
    };

    const nextStep = () => {
        if (step === 2 && !validateStep2()) return;
        if (step === 3 && !validateStep3()) return;

        if (step < TOTAL_STEPS) setStep((s) => s + 1);
        else finishOnboarding();
    };

    const prevStep = () => setStep((s) => Math.max(1, s - 1));

    const buildRoomNumbers = () => {
        const nums: Array<{ roomNumber: number; floorNumber: number }> = [];
        for (const fc of floorCodes) {
            const start = fc * 100 + suffixStart;
            for (let i = 0; i < roomsPerFloor; i++) {
                nums.push({
                    roomNumber: start + i,
                    floorNumber: fc,
                });
            }
        }
        return nums;
    };

    const initializeRoomsFloorWise = async () => {
        if (!user) throw new Error("No user");
        const uid = user.uid;

        const roomsCol = collection(db, "users", uid, "rooms");

        // 1) Delete existing rooms (safe re-run)
        const existing = await getDocs(roomsCol);
        if (!existing.empty) {
            let batch = writeBatch(db);
            let ops = 0;
            for (const d of existing.docs) {
                batch.delete(d.ref);
                ops++;
                if (ops >= 450) {
                    await batch.commit();
                    batch = writeBatch(db);
                    ops = 0;
                }
            }
            if (ops > 0) await batch.commit();
        }

        // 2) Create new rooms (only floor-wise distribution)
        const roomsToCreate = buildRoomNumbers();
        let batch = writeBatch(db);
        let ops = 0;

        for (const r of roomsToCreate) {
            const newDoc = doc(roomsCol); // auto id
            batch.set(newDoc, {
                roomNumber: r.roomNumber,
                floorNumber: r.floorNumber,
                status: "available",
                guestName: null,
                guestMobile: null,
                guestId: null,
                assignedAt: null,
                checkoutAt: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            ops++;
            if (ops >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                ops = 0;
            }
        }
        if (ops > 0) await batch.commit();

        // 3) Save building config for future use
        await setDoc(
            doc(db, "users", uid),
            {
                propertyType: "Hotel",
                buildingConfig: {
                    includeGroundFloor,
                    totalFloors: floorsCount,
                    roomsPerFloor,
                    suffixStart,
                    numberingRule: "floor*100 + suffixStart + index",
                },
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
    };

    // ✅ UPDATED: now redirects to Dashboard after QR step is done
    const finishOnboarding = async () => {
        if (!validateStep2()) return;
        if (!validateStep3()) return;

        setLoading(true);
        try {
            await initializeRoomsFloorWise();

            // ✅ Go to Dashboard after onboarding
            // If your dashboard file is app/(tabs)/dashboard.tsx, this is correct:
            router.replace("/(tabs)/dashboard");

            // If your dashboard is app/(tabs)/index.tsx instead, use:
            // router.replace("/(tabs)");
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to initialize rooms. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const guestAppUrl = `https://roomio-guest.vercel.app/?admin=${encodeURIComponent(
        user?.email || user?.uid || "roomio"
    )}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        guestAppUrl
    )}`;

    const downloadQR = async () => {
        if (Platform.OS === "web") {
            try {
                const response = await fetch(qrUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `Roomio_Guest_QR_${user?.uid?.slice(0, 5)}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                Alert.alert("Download Failed", "Could not download the QR code image.");
            }
        } else {
            Alert.alert("Download", "Long press the image to save it on your device.");
        }
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <View style={styles.content}>
                        <Text style={styles.stepTitle}>What do you own?</Text>
                        <Text style={styles.stepDesc}>
                            Select your property type to customize your room setup.
                        </Text>

                        <View style={styles.typeGrid}>
                            <Pressable
                                style={[
                                    styles.typeCard,
                                    propertyType === "Hotel" && styles.typeCardSelected,
                                ]}
                                onPress={() => setPropertyType("Hotel")}
                            >
                                <View
                                    style={[
                                        styles.typeIcon,
                                        { backgroundColor: "rgba(37, 99, 235, 0.1)" },
                                    ]}
                                >
                                    <Ionicons name="business" size={32} color="#2563EB" />
                                </View>
                                <Text style={styles.typeLabel}>Hotel</Text>
                                {propertyType === "Hotel" && (
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={24}
                                        color="#2563EB"
                                        style={styles.checkIcon}
                                    />
                                )}
                            </Pressable>

                            <Pressable style={[styles.typeCard, styles.typeCardDisabled]}>
                                <View
                                    style={[
                                        styles.typeIcon,
                                        { backgroundColor: "rgba(107, 114, 128, 0.1)" },
                                    ]}
                                >
                                    <Ionicons name="home" size={32} color="#6B7280" />
                                </View>
                                <Text style={[styles.typeLabel, { color: "#6B7280" }]}>
                                    Villa (Soon)
                                </Text>
                            </Pressable>

                            <Pressable style={[styles.typeCard, styles.typeCardDisabled]}>
                                <View
                                    style={[
                                        styles.typeIcon,
                                        { backgroundColor: "rgba(107, 114, 128, 0.1)" },
                                    ]}
                                >
                                    <Ionicons name="people" size={32} color="#6B7280" />
                                </View>
                                <Text style={[styles.typeLabel, { color: "#6B7280" }]}>
                                    PG (Soon)
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                );

            case 2:
                return (
                    <View style={styles.content}>
                        <Text style={styles.stepTitle}>Hotel structure</Text>
                        <Text style={styles.stepDesc}>
                            Tell Roomio how your building is structured.
                        </Text>

                        <View style={[styles.infoCard, isWide && { maxWidth: 720 }]}>
                            <View style={styles.inputRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Total Floors</Text>
                                    <Text style={styles.labelHint}>Total levels in the building</Text>
                                </View>
                                <View style={styles.compactInputWrap}>
                                    <TextInput
                                        value={totalFloorsText}
                                        onChangeText={(t) => setTotalFloorsText(t.replace(/[^\d]/g, ""))}
                                        keyboardType="numeric"
                                        placeholder="4"
                                        placeholderTextColor="#9CA3AF"
                                        style={styles.compactInput}
                                        maxLength={2}
                                    />
                                </View>
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.inputRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Rooms per Floor</Text>
                                    <Text style={styles.labelHint}>Same count on each floor</Text>
                                </View>
                                <View style={styles.compactInputWrap}>
                                    <TextInput
                                        value={roomsPerFloorText}
                                        onChangeText={(t) => setRoomsPerFloorText(t.replace(/[^\d]/g, ""))}
                                        keyboardType="numeric"
                                        placeholder="10"
                                        placeholderTextColor="#9CA3AF"
                                        style={styles.compactInput}
                                        maxLength={2}
                                    />
                                </View>
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.inputRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Include Ground Floor</Text>
                                    <Text style={styles.labelHint}>If enabled, floor 0 = Ground</Text>
                                </View>
                                <Pressable
                                    onPress={() => setIncludeGroundFloor((v) => !v)}
                                    style={[
                                        styles.togglePill,
                                        includeGroundFloor && styles.togglePillOn,
                                    ]}
                                >
                                    <View
                                        style={[
                                            styles.toggleDot,
                                            includeGroundFloor && styles.toggleDotOn,
                                        ]}
                                    />
                                    <Text
                                        style={[
                                            styles.toggleText,
                                            includeGroundFloor && styles.toggleTextOn,
                                        ]}
                                    >
                                        {includeGroundFloor ? "ON" : "OFF"}
                                    </Text>
                                </Pressable>
                            </View>

                            <View style={styles.summaryRow}>
                                <Ionicons name="calculator-outline" size={16} color="#2563EB" />
                                <Text style={styles.summaryText}>
                                    Total rooms:{" "}
                                    <Text style={{ fontWeight: "900", color: "#2563EB" }}>
                                        {totalRooms || 0}
                                    </Text>
                                </Text>
                            </View>
                        </View>
                    </View>
                );

            case 3:
                return (
                    <View style={styles.content}>
                        <Text style={styles.stepTitle}>Room numbering</Text>
                        <Text style={styles.stepDesc}>
                            Decide where each floor’s room numbers start (00 / 01 etc.).
                        </Text>

                        <View style={[styles.infoCard, isWide && { maxWidth: 720 }]}>
                            <Text style={styles.label}>Room suffix starts at</Text>
                            <Text style={styles.labelHint}>
                                Example: 1 → 101,102… and Ground → 001,002… (display)
                            </Text>

                            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                                <Pressable
                                    onPress={() => setSuffixStartText("0")}
                                    style={[
                                        styles.quickChip,
                                        suffixStartText === "0" && styles.quickChipActive,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.quickChipText,
                                            suffixStartText === "0" && styles.quickChipTextActive,
                                        ]}
                                    >
                                        Start 00
                                    </Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => setSuffixStartText("1")}
                                    style={[
                                        styles.quickChip,
                                        suffixStartText === "1" && styles.quickChipActive,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.quickChipText,
                                            suffixStartText === "1" && styles.quickChipTextActive,
                                        ]}
                                    >
                                        Start 01
                                    </Text>
                                </Pressable>

                                <View style={{ flex: 1 }} />

                                <View style={[styles.compactInputWrap, { minWidth: 90 }]}>
                                    <TextInput
                                        value={suffixStartText}
                                        onChangeText={(t) => setSuffixStartText(t.replace(/[^\d]/g, ""))}
                                        keyboardType="numeric"
                                        placeholder="1"
                                        placeholderTextColor="#9CA3AF"
                                        style={styles.compactInput}
                                        maxLength={2}
                                    />
                                </View>
                            </View>

                            <View style={[styles.previewBox, { marginTop: 16 }]}>
                                <View style={styles.previewHeader}>
                                    <Ionicons name="eye-outline" size={16} color="#2563EB" />
                                    <Text style={styles.previewTitle}>Preview</Text>
                                </View>

                                {preview.map((p) => (
                                    <View key={p.floorCode} style={styles.previewRow}>
                                        <Text style={styles.previewFloor}>{p.label}</Text>
                                        <Text style={styles.previewRooms}>
                                            {padRoom(p.start)} – {padRoom(p.end)}
                                        </Text>
                                    </View>
                                ))}

                                <Text style={styles.previewHint}>
                                    This prevents unwanted room numbers like 150/160 when you only have 10 rooms per floor.
                                </Text>
                            </View>
                        </View>
                    </View>
                );

            case 4:
                return (
                    <View style={styles.content}>
                        <Text style={styles.stepTitle}>Your Guest QR Code</Text>
                        <Text style={styles.stepDesc}>
                            Guests scan this to access room services and food menu.
                        </Text>

                        <View style={styles.qrSection}>
                            <View style={styles.qrBorder}>
                                <Image source={{ uri: qrUrl }} style={styles.qrImage} />
                                <View style={styles.qrOverlay}>
                                    <Image source={logoImage} style={styles.qrLogo} />
                                </View>
                            </View>

                            <Pressable style={styles.downloadBtn} onPress={downloadQR}>
                                <Ionicons name="download-outline" size={20} color="#2563EB" />
                                <Text style={styles.downloadText}>Download QR Code</Text>
                            </Pressable>

                            <View style={styles.finalHintBox}>
                                <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" />
                                <Text style={styles.finalHintText}>
                                    Next: We’ll take you to the Dashboard.
                                </Text>
                            </View>
                        </View>
                    </View>
                );

            default:
                return null;
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.bgDecor} pointerEvents="none">
                <View style={styles.circle1} />
                <View style={styles.circle2} />
            </View>

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { minHeight: height }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.shell, isWide && { maxWidth: 980, alignSelf: "center", width: "100%" }]}>
                    <View style={styles.header}>
                        <Image source={logoImage} style={styles.logo} resizeMode="contain" />
                        <View style={styles.progressTrack}>
                            <Animated.View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: progressAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ["0%", "100%"],
                                        }),
                                    },
                                ]}
                            />
                        </View>
                        <Text style={styles.stepIndicator}>
                            Step {step} of {TOTAL_STEPS}
                        </Text>
                    </View>

                    <Animated.View
                        style={[
                            styles.stepContainer,
                            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                        ]}
                    >
                        {renderStep()}
                    </Animated.View>

                    <View style={styles.footer}>
                        {step > 1 ? (
                            <Pressable style={styles.backBtn} onPress={prevStep} disabled={loading}>
                                <Text style={styles.backBtnText}>Back</Text>
                            </Pressable>
                        ) : (
                            <View style={{ width: 80 }} />
                        )}

                        <Pressable
                            style={[styles.nextBtn, loading && styles.nextBtnDisabled]}
                            onPress={nextStep}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Text style={styles.nextBtnText}>
                                        {step === TOTAL_STEPS ? "Go to Dashboard" : "Continue"}
                                    </Text>
                                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                                </>
                            )}
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F9FAFB" },
    scrollContent: { padding: 24 },
    shell: { flex: 1 },

    bgDecor: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 },
    circle1: {
        position: "absolute",
        top: -120,
        right: -120,
        width: 320,
        height: 320,
        borderRadius: 160,
        backgroundColor: "rgba(37, 99, 235, 0.05)",
    },
    circle2: {
        position: "absolute",
        bottom: -60,
        left: -60,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: "rgba(37, 99, 235, 0.03)",
    },

    header: { alignItems: "center", marginBottom: 28, marginTop: 10 },
    logo: { width: 80, height: 80, marginBottom: 18 },
    progressTrack: {
        width: "100%",
        height: 6,
        backgroundColor: "#E5E7EB",
        borderRadius: 999,
        overflow: "hidden",
        marginBottom: 12,
    },
    progressFill: { height: "100%", backgroundColor: "#2563EB" },
    stepIndicator: {
        fontSize: 12,
        fontWeight: "800",
        color: "#6B7280",
        letterSpacing: 1,
        textTransform: "uppercase",
    },

    stepContainer: { flex: 1 },
    content: { flex: 1 },

    stepTitle: {
        fontSize: 28,
        fontWeight: "900",
        color: "#111827",
        marginBottom: 10,
        letterSpacing: -0.4,
    },
    stepDesc: {
        fontSize: 16,
        color: "#6B7280",
        lineHeight: 24,
        marginBottom: 22,
        fontWeight: "600",
    },

    typeGrid: { gap: 14 },
    typeCard: {
        backgroundColor: "#FFF",
        borderRadius: 20,
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 2,
        borderColor: "#E5E7EB",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 2,
    },
    typeCardSelected: { borderColor: "#2563EB", backgroundColor: "rgba(37, 99, 235, 0.02)" },
    typeCardDisabled: { opacity: 0.55, backgroundColor: "#F3F4F6" },
    typeIcon: { width: 56, height: 56, borderRadius: 16, justifyContent: "center", alignItems: "center", marginRight: 16 },
    typeLabel: { fontSize: 18, fontWeight: "800", color: "#111827", flex: 1 },
    checkIcon: { marginLeft: 8 },

    infoCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        padding: 16,
    },

    inputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    label: { fontSize: 13, fontWeight: "900", color: "#111827" },
    labelHint: { marginTop: 3, fontSize: 12, fontWeight: "700", color: "#6B7280" },

    compactInputWrap: {
        backgroundColor: "#F9FAFB",
        borderWidth: 1.5,
        borderColor: "#E5E7EB",
        borderRadius: 14,
        paddingHorizontal: 12,
        height: 46,
        justifyContent: "center",
        minWidth: 80,
    },
    compactInput: {
        fontSize: 16,
        fontWeight: "900",
        color: "#111827",
        padding: 0,
        textAlign: "center",
    },

    divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 14 },

    togglePill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        height: 40,
        borderRadius: 999,
        backgroundColor: "#F3F4F6",
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    togglePillOn: { backgroundColor: "rgba(37, 99, 235, 0.10)", borderColor: "rgba(37, 99, 235, 0.25)" },
    toggleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#9CA3AF" },
    toggleDotOn: { backgroundColor: "#2563EB" },
    toggleText: { fontWeight: "900", fontSize: 12, color: "#6B7280" },
    toggleTextOn: { color: "#2563EB" },

    summaryRow: {
        marginTop: 14,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        backgroundColor: "rgba(37, 99, 235, 0.08)",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(37, 99, 235, 0.18)",
    },
    summaryText: { fontWeight: "800", color: "#374151" },

    quickChip: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: "#E5E7EB",
        backgroundColor: "#F9FAFB",
    },
    quickChipActive: {
        borderColor: "rgba(37, 99, 235, 0.35)",
        backgroundColor: "rgba(37, 99, 235, 0.10)",
    },
    quickChipText: { fontWeight: "900", color: "#6B7280" },
    quickChipTextActive: { color: "#2563EB" },

    previewBox: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(37, 99, 235, 0.18)",
        backgroundColor: "rgba(37, 99, 235, 0.06)",
        padding: 12,
    },
    previewHeader: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 10 },
    previewTitle: { fontWeight: "900", color: "#2563EB" },
    previewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
    previewFloor: { fontWeight: "900", color: "#111827" },
    previewRooms: { fontWeight: "900", color: "#2563EB" },
    previewHint: { marginTop: 10, fontSize: 12, fontWeight: "700", color: "#6B7280", lineHeight: 16 },

    qrSection: { alignItems: "center", marginTop: 14 },
    qrBorder: {
        padding: 16,
        backgroundColor: "#FFF",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
        position: "relative",
    },
    qrImage: { width: 220, height: 220 },
    qrOverlay: {
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 40,
        height: 40,
        marginTop: -20,
        marginLeft: -20,
        backgroundColor: "#FFF",
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    qrLogo: { width: 30, height: 30 },
    downloadBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(37, 99, 235, 0.1)",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 20,
        gap: 8,
    },
    downloadText: { fontSize: 14, fontWeight: "900", color: "#2563EB" },

    finalHintBox: {
        marginTop: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: "rgba(22, 163, 74, 0.08)",
        borderWidth: 1,
        borderColor: "rgba(22, 163, 74, 0.15)",
    },
    finalHintText: { fontWeight: "800", color: "#16A34A" },

    footer: { flexDirection: "row", alignItems: "center", marginTop: 24, gap: 12 },
    backBtn: { paddingHorizontal: 8, height: 56, justifyContent: "center", alignItems: "center", minWidth: 80 },
    backBtnText: { fontSize: 16, fontWeight: "800", color: "#6B7280" },
    nextBtn: {
        flex: 1,
        backgroundColor: "#2563EB",
        height: 56,
        borderRadius: 16,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
        shadowColor: "#2563EB",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 6,
    },
    nextBtnDisabled: { opacity: 0.7 },
    nextBtnText: { fontSize: 16, fontWeight: "900", color: "#FFF" },
});