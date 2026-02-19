// ==================== ONBOARDING SCREEN ====================
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
    collection,
    doc,
    setDoc,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Image,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { db } from "../firebase/firebaseConfig";
import logoImage from "../assets/images/logo.png";

const { width, height } = Dimensions.get("window");

type FloorConfig = {
    floorName: string;
    roomsPerFloor: number;
    startingRoomNumber: string;
};

export default function Onboarding() {
    const router = useRouter();
    const auth = getAuth();
    const user = auth.currentUser;

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [propertyType, setPropertyType] = useState("Hotel");

    // Floor-based setup state
    const [totalFloors, setTotalFloors] = useState("4");
    const [roomsPerFloor, setRoomsPerFloor] = useState("10");
    const [floorConfigs, setFloorConfigs] = useState<FloorConfig[]>([]);
    const [previewRooms, setPreviewRooms] = useState<number[]>([]);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const progressAnim = useRef(new Animated.Value(0.2)).current;

    useEffect(() => {
        if (!user) {
            router.replace("/admin-login");
            return;
        }
        animateStep();
    }, [step]);

    useEffect(() => {
        // Generate floor configs when floors/rooms change
        if (totalFloors && roomsPerFloor) {
            const floors = parseInt(totalFloors) || 4;
            const rooms = parseInt(roomsPerFloor) || 10;
            const configs: FloorConfig[] = [];

            // Default floor names and starting numbers
            const floorNames = ["Ground", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];

            for (let i = 0; i < Math.min(floors, 11); i++) {
                const floorNum = i === 0 ? 0 : i;
                const startNum = i === 0 ? "001" : `${i}01`;
                configs.push({
                    floorName: floorNames[i] || `Floor ${i + 1}`,
                    roomsPerFloor: rooms,
                    startingRoomNumber: startNum,
                });
            }
            setFloorConfigs(configs);
            generatePreviewRooms(configs);
        }
    }, [totalFloors, roomsPerFloor]);

    const animateStep = () => {
        fadeAnim.setValue(0);
        slideAnim.setValue(20);
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
            Animated.timing(progressAnim, {
                toValue: step / 5,
                duration: 400,
                useNativeDriver: false,
            }),
        ]).start();
    };

    const nextStep = () => {
        if (step < 5) {
            setStep(step + 1);
        } else {
            finishOnboarding();
        }
    };

    const prevStep = () => {
        if (step > 1) setStep(step - 1);
    };

    const generatePreviewRooms = (configs: FloorConfig[]) => {
        const rooms: number[] = [];
        configs.forEach((floor) => {
            const start = parseInt(floor.startingRoomNumber) || 101;
            for (let i = 0; i < floor.roomsPerFloor; i++) {
                rooms.push(start + i);
            }
        });
        setPreviewRooms(rooms);
    };

    const updateFloorConfig = (index: number, field: keyof FloorConfig, value: string) => {
        const updated = [...floorConfigs];
        updated[index] = { ...updated[index], [field]: value };
        setFloorConfigs(updated);
        generatePreviewRooms(updated);
    };

    const finishOnboarding = async () => {
        setLoading(true);
        try {
            if (!user) throw new Error("User not authenticated");
            const uid = user.uid;
            const batch = writeBatch(db);

            // Create rooms with floor-wise distribution
            floorConfigs.forEach((floor) => {
                const startNum = parseInt(floor.startingRoomNumber) || 101;
                const roomsCount = parseInt(floor.roomsPerFloor) || 10;

                for (let i = 0; i < roomsCount; i++) {
                    const roomNumber = startNum + i;
                    const roomRef = doc(collection(db, "users", uid, "rooms"));
                    batch.set(roomRef, {
                        roomNumber: roomNumber,
                        status: "available",
                        floor: floor.floorName,
                        floorIndex: floorConfigs.indexOf(floor),
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    });
                }
            });

            // Save property config
            await batch.commit();
            await setDoc(doc(db, "users", uid, "config"), {
                propertyType,
                totalFloors: parseInt(totalFloors),
                roomsPerFloor: parseInt(roomsPerFloor),
                floorConfigs,
                totalRooms: previewRooms.length,
                setupCompleted: true,
                createdAt: serverTimestamp(),
            });

            router.replace("/ownership");
        } catch (e: any) {
            console.error("Onboarding error:", e);
            Alert.alert("Error", "Failed to initialize your account. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const guestAppUrl = `https://roomio-guest.vercel.app/?admin=${user?.email || user?.uid || "roomio"}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(guestAppUrl)}`;

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
            } catch {
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
                        <Text style={styles.stepDesc}>Select your property type to customize your dashboard experience.</Text>
                        <View style={styles.typeGrid}>
                            <Pressable
                                style={[styles.typeCard, propertyType === "Hotel" && styles.typeCardSelected]}
                                onPress={() => setPropertyType("Hotel")}
                            >
                                <View style={[styles.typeIcon, { backgroundColor: "rgba(37, 99, 235, 0.1)" }]}>
                                    <Ionicons name="business" size={32} color="#2563EB" />
                                </View>
                                <Text style={styles.typeLabel}>Hotel</Text>
                                {propertyType === "Hotel" && <Ionicons name="checkmark-circle" size={24} color="#2563EB" style={styles.checkIcon} />}
                            </Pressable>
                            <Pressable style={[styles.typeCard, styles.typeCardDisabled]}>
                                <View style={[styles.typeIcon, { backgroundColor: "rgba(107, 114, 128, 0.1)" }]}>
                                    <Ionicons name="home" size={32} color="#6B7280" />
                                </View>
                                <Text style={[styles.typeLabel, { color: "#6B7280" }]}>Villa (Soon)</Text>
                            </Pressable>
                            <Pressable style={[styles.typeCard, styles.typeCardDisabled]}>
                                <View style={[styles.typeIcon, { backgroundColor: "rgba(107, 114, 128, 0.1)" }]}>
                                    <Ionicons name="people" size={32} color="#6B7280" />
                                </View>
                                <Text style={[styles.typeLabel, { color: "#6B7280" }]}>PG (Soon)</Text>
                            </Pressable>
                        </View>
                    </View>
                );
            case 2:
                return (
                    <View style={styles.content}>
                        <Text style={styles.stepTitle}>Setup Floor Configuration</Text>
                        <Text style={styles.stepDesc}>Tell us about your hotel structure to auto-generate room distribution.</Text>

                        <View style={styles.inputSection}>
                            <Text style={styles.label}>Total Floors</Text>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="layers-outline" size={20} color="#2563EB" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    value={totalFloors}
                                    onChangeText={setTotalFloors}
                                    keyboardType="numeric"
                                    placeholder="e.g. 4"
                                    maxLength={2}
                                />
                            </View>
                        </View>

                        <View style={styles.inputSection}>
                            <Text style={styles.label}>Rooms Per Floor</Text>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="bed-outline" size={20} color="#2563EB" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    value={roomsPerFloor}
                                    onChangeText={setRoomsPerFloor}
                                    keyboardType="numeric"
                                    placeholder="e.g. 10"
                                    maxLength={2}
                                />
                            </View>
                            <Text style={styles.inputHint}>
                                Total rooms will be: {parseInt(totalFloors) || 0} × {parseInt(roomsPerFloor) || 0} = {(parseInt(totalFloors) || 0) * (parseInt(roomsPerFloor) || 0)} rooms
                            </Text>
                        </View>
                    </View>
                );
            case 3:
                return (
                    <View style={styles.content}>
                        <Text style={styles.stepTitle}>Configure Floor Numbers</Text>
                        <Text style={styles.stepDesc}>Set the starting room number for each floor.</Text>

                        <ScrollView style={styles.floorList} showsVerticalScrollIndicator={false}>
                            {floorConfigs.map((floor, index) => (
                                <View key={index} style={styles.floorCard}>
                                    <View style={styles.floorHeader}>
                                        <View style={styles.floorBadge}>
                                            <Text style={styles.floorBadgeText}>{index + 1}</Text>
                                        </View>
                                        <Text style={styles.floorName}>{floor.floorName} Floor</Text>
                                    </View>

                                    <View style={styles.floorInputs}>
                                        <View style={styles.floorInputRow}>
                                            <Text style={styles.floorInputLabel}>Starting Room #</Text>
                                            <View style={styles.floorInputWrapper}>
                                                <TextInput
                                                    style={styles.floorInput}
                                                    value={floor.startingRoomNumber}
                                                    onChangeText={(val) => updateFloorConfig(index, "startingRoomNumber", val.replace(/[^0-9]/g, ""))}
                                                    keyboardType="number-pad"
                                                    maxLength={4}
                                                    placeholder="101"
                                                />
                                            </View>
                                        </View>

                                        <View style={styles.floorPreview}>
                                            <Text style={styles.floorPreviewLabel}>Preview:</Text>
                                            <Text style={styles.floorPreviewValue}>
                                                {floor.startingRoomNumber} → {parseInt(floor.startingRoomNumber) + (parseInt(roomsPerFloor) || 10) - 1}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                );
            case 4:
                return (
                    <View style={styles.content}>
                        <Text style={styles.stepTitle}>Review Room Distribution</Text>
                        <Text style={styles.stepDesc}>Confirm your floor-wise room setup before proceeding.</Text>

                        <View style={styles.previewCard}>
                            <View style={styles.previewSummary}>
                                <View style={styles.previewItem}>
                                    <Text style={styles.previewLabel}>Property Type</Text>
                                    <Text style={styles.previewValue}>{propertyType}</Text>
                                </View>
                                <View style={styles.previewItem}>
                                    <Text style={styles.previewLabel}>Total Floors</Text>
                                    <Text style={styles.previewValue}>{totalFloors}</Text>
                                </View>
                                <View style={styles.previewItem}>
                                    <Text style={styles.previewLabel}>Rooms/Floor</Text>
                                    <Text style={styles.previewValue}>{roomsPerFloor}</Text>
                                </View>
                                <View style={styles.previewItem}>
                                    <Text style={styles.previewLabel}>Total Rooms</Text>
                                    <Text style={[styles.previewValue, styles.previewTotal]}>{previewRooms.length}</Text>
                                </View>
                            </View>

                            <View style={styles.previewFloors}>
                                {floorConfigs.map((floor, index) => (
                                    <View key={index} style={styles.previewFloorRow}>
                                        <Text style={styles.previewFloorName}>{floor.floorName}</Text>
                                        <Text style={styles.previewFloorRange}>
                                            #{floor.startingRoomNumber} - #{parseInt(floor.startingRoomNumber) + (parseInt(roomsPerFloor) || 10) - 1}
                                        </Text>
                                        <Text style={styles.previewFloorCount}>{roomsPerFloor} rooms</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>
                );
            case 5:
                return (
                    <View style={styles.content}>
                        <Text style={styles.stepTitle}>Your Guest QR Code</Text>
                        <Text style={styles.stepDesc}>Guests scan this to access their room services and food menu.</Text>

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
                        </View>

                        <View style={styles.setupSummary}>
                            <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                            <Text style={styles.setupSummaryText}>
                                {previewRooms.length} rooms configured across {totalFloors} floors
                            </Text>
                        </View>
                    </View>
                );
            default:
                return null;
        }
    };

    const totalSteps = 5;
    const progressPercent = (step / totalSteps) * 100;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.bgDecor} pointerEvents="none">
                <View style={styles.circle1} />
                <View style={styles.circle2} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header */}
                <View style={styles.header}>
                    <Image source={logoImage} style={styles.logo} resizeMode="contain" />
                    <View style={styles.progressTrack}>
                        <Animated.View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                    </View>
                    <Text style={styles.stepIndicator}>Step {step} of {totalSteps}</Text>
                </View>

                {/* Animated Step Content */}
                <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    {renderStep()}
                </Animated.View>

                {/* Footer Navigation */}
                <View style={styles.footer}>
                    {step > 1 && (
                        <Pressable style={styles.backBtn} onPress={prevStep}>
                            <Ionicons name="arrow-back" size={18} color="#6B7280" />
                            <Text style={styles.backBtnText}>Back</Text>
                        </Pressable>
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
                                <Text style={styles.nextBtnText}>{step === totalSteps ? "Start Your Journey" : "Continue"}</Text>
                                <Ionicons name="arrow-forward" size={20} color="#fff" />
                            </>
                        )}
                    </Pressable>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F9FAFB" },
    scrollContent: { padding: 24, minHeight: height },
    bgDecor: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 },
    circle1: { position: "absolute", top: -100, right: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(37, 99, 235, 0.05)" },
    circle2: { position: "absolute", bottom: -50, left: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(37, 99, 235, 0.03)" },

    header: { alignItems: "center", marginBottom: 32, marginTop: 16 },
    logo: { width: 72, height: 72, marginBottom: 20 },
    progressTrack: { width: "100%", height: 6, backgroundColor: "#E5E7EB", borderRadius: 3, overflow: "hidden", marginBottom: 10 },
    progressFill: { height: "100%", backgroundColor: "#2563EB", borderRadius: 3 },
    stepIndicator: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 1, textTransform: "uppercase" },

    stepContainer: { flex: 1 },
    content: { flex: 1 },
    stepTitle: { fontSize: 26, fontWeight: "800", color: "#111827", marginBottom: 10 },
    stepDesc: { fontSize: 15, color: "#6B7280", lineHeight: 22, marginBottom: 28 },

    typeGrid: { gap: 14 },
    typeCard: { backgroundColor: "#FFF", borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    typeCardSelected: { borderColor: "#2563EB", backgroundColor: "rgba(37, 99, 235, 0.02)" },
    typeCardDisabled: { opacity: 0.55, backgroundColor: "#F9FAFB" },
    typeIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center", marginRight: 14 },
    typeLabel: { fontSize: 17, fontWeight: "700", color: "#111827", flex: 1 },
    checkIcon: { marginLeft: 6 },

    inputSection: { marginTop: 16, marginBottom: 8 },
    label: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 8, marginLeft: 2 },
    inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, borderWidth: 2, borderColor: "#E5E7EB", paddingHorizontal: 14, height: 56 },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" },
    inputHint: { fontSize: 13, color: "#9CA3AF", marginTop: 10, textAlign: "center", paddingHorizontal: 8 },

    floorList: { maxHeight: 320 },
    floorCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E5E7EB" },
    floorHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    floorBadge: { width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(37, 99, 235, 0.12)", justifyContent: "center", alignItems: "center", marginRight: 10 },
    floorBadgeText: { color: "#2563EB", fontWeight: "800", fontSize: 13 },
    floorName: { fontSize: 15, fontWeight: "700", color: "#111827" },

    floorInputs: { gap: 10 },
    floorInputRow: { gap: 8 },
    floorInputLabel: { fontSize: 12, fontWeight: "700", color: "#6B7280" },
    floorInputWrapper: { backgroundColor: "#F9FAFB", borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", paddingHorizontal: 12, height: 44 },
    floorInput: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" },

    floorPreview: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    floorPreviewLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF" },
    floorPreviewValue: { fontSize: 12, fontWeight: "800", color: "#2563EB" },

    previewCard: { backgroundColor: "#FFF", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4 },
    previewSummary: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
    previewItem: { minWidth: 100 },
    previewLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", marginBottom: 4 },
    previewValue: { fontSize: 18, fontWeight: "800", color: "#111827" },
    previewTotal: { color: "#2563EB", fontSize: 22 },

    previewFloors: { gap: 10 },
    previewFloorRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#F9FAFB", borderRadius: 10 },
    previewFloorName: { fontSize: 14, fontWeight: "700", color: "#111827" },
    previewFloorRange: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
    previewFloorCount: { fontSize: 12, fontWeight: "600", color: "#6B7280", backgroundColor: "#E5E7EB", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },

    qrSection: { alignItems: "center", marginTop: 16 },
    qrBorder: { padding: 14, backgroundColor: "#FFF", borderRadius: 22, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 8, position: "relative" },
    qrImage: { width: 200, height: 200 },
    qrOverlay: { position: "absolute", top: "50%", left: "50%", width: 38, height: 38, marginTop: -19, marginLeft: -19, backgroundColor: "#FFF", borderRadius: 7, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3 },
    qrLogo: { width: 28, height: 28 },
    downloadBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(37, 99, 235, 0.1)", paddingHorizontal: 18, paddingVertical: 11, borderRadius: 11, marginTop: 20, gap: 7 },
    downloadText: { fontSize: 13, fontWeight: "700", color: "#2563EB" },

    setupSummary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: "rgba(22, 163, 74, 0.1)", borderRadius: 12 },
    setupSummaryText: { fontSize: 13, fontWeight: "700", color: "#16A34A" },

    footer: { flexDirection: "row", alignItems: "center", marginTop: "auto", paddingTop: 32, paddingBottom: 16, gap: 10 },
    backBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, height: 52, justifyContent: "center", gap: 6 },
    backBtnText: { fontSize: 15, fontWeight: "600", color: "#6B7280" },
    nextBtn: { flex: 1, backgroundColor: "#2563EB", height: 52, borderRadius: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, shadowColor: "#2563EB", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 9, elevation: 5 },
    nextBtnDisabled: { opacity: 0.65 },
    nextBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
});