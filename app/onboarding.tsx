import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
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
import logoImage from "../assets/images/logo.png";
import { setupRooms } from "../utils/setupRooms";

const { width, height } = Dimensions.get("window");

export default function Onboarding() {
    const router = useRouter();
    const auth = getAuth();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [roomCount, setRoomCount] = useState("20");
    const [propertyType, setPropertyType] = useState("Hotel");

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const progressAnim = useRef(new Animated.Value(0.25)).current;

    const user = auth.currentUser;

    useEffect(() => {
        if (!user) {
            router.replace("/admin-login");
            return;
        }
        animateStep();
    }, [step]);

    const animateStep = () => {
        fadeAnim.setValue(0);
        slideAnim.setValue(20);
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.timing(progressAnim, {
                toValue: step / 3,
                duration: 400,
                useNativeDriver: false,
            }),
        ]).start();
    };

    const nextStep = () => {
        if (step < 3) {
            setStep(step + 1);
        } else {
            finishOnboarding();
        }
    };

    const finishOnboarding = async () => {
        setLoading(true);
        try {
            const success = await setupRooms(101, parseInt(roomCount) || 10);
            if (success) {
                router.replace("/ownership");
            }
        } catch (e) {
            Alert.alert("Error", "Failed to initialize your account. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${user?.uid || "roomio"}`;

    const downloadQR = async () => {
        if (Platform.OS === 'web') {
            try {
                const response = await fetch(qrUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
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

                            <Pressable
                                style={[styles.typeCard, styles.typeCardDisabled]}
                            >
                                <View style={[styles.typeIcon, { backgroundColor: "rgba(107, 114, 128, 0.1)" }]}>
                                    <Ionicons name="home" size={32} color="#6B7280" />
                                </View>
                                <Text style={[styles.typeLabel, { color: "#6B7280" }]}>Villa (Soon)</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.typeCard, styles.typeCardDisabled]}
                            >
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
                        <Text style={styles.stepTitle}>Setup your Capacity</Text>
                        <Text style={styles.stepDesc}>How many rooms does your hotel have in total?</Text>

                        <View style={styles.inputSection}>
                            <View style={styles.inputWrapper}>
                                <Ionicons name="bed-outline" size={24} color="#2563EB" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    value={roomCount}
                                    onChangeText={setRoomCount}
                                    keyboardType="numeric"
                                    placeholder="e.g. 50"
                                    maxLength={3}
                                />
                            </View>
                            <Text style={styles.inputHint}>We will initialize these rooms as 'available' for you.</Text>
                        </View>
                    </View>
                );

            case 3:
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
                    </View>
                );

            default:
                return null;
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Background Decor */}
            <View style={styles.bgDecor} pointerEvents="none">
                <View style={styles.circle1} />
                <View style={styles.circle2} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Image source={logoImage} style={styles.logo} resizeMode="contain" />
                    <View style={styles.progressTrack}>
                        <Animated.View
                            style={[
                                styles.progressFill,
                                {
                                    width: progressAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['0%', '100%']
                                    })
                                }
                            ]}
                        />
                    </View>
                    <Text style={styles.stepIndicator}>Step {step} of 3</Text>
                </View>

                <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    {renderStep()}
                </Animated.View>

                <View style={styles.footer}>
                    {step > 1 && (
                        <Pressable style={styles.backBtn} onPress={() => setStep(step - 1)}>
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
                                <Text style={styles.nextBtnText}>{step === 3 ? "Start Your Journey" : "Continue"}</Text>
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
    container: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    scrollContent: {
        padding: 24,
        minHeight: height,
    },
    bgDecor: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: -1,
    },
    circle1: {
        position: "absolute",
        top: -100,
        right: -100,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: "rgba(37, 99, 235, 0.05)",
    },
    circle2: {
        position: "absolute",
        bottom: -50,
        left: -50,
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: "rgba(37, 99, 235, 0.03)",
    },
    header: {
        alignItems: "center",
        marginBottom: 40,
        marginTop: 20,
    },
    logo: {
        width: 80,
        height: 80,
        marginBottom: 24,
    },
    progressTrack: {
        width: "100%",
        height: 6,
        backgroundColor: "#E5E7EB",
        borderRadius: 3,
        overflow: "hidden",
        marginBottom: 12,
    },
    progressFill: {
        height: "100%",
        backgroundColor: "#2563EB",
        borderRadius: 3,
    },
    stepIndicator: {
        fontSize: 12,
        fontWeight: "700",
        color: "#6B7280",
        letterSpacing: 1,
        textTransform: "uppercase",
    },
    stepContainer: {
        flex: 1,
    },
    content: {
        flex: 1,
    },
    stepTitle: {
        fontSize: 28,
        fontWeight: "800",
        color: "#111827",
        marginBottom: 12,
    },
    stepDesc: {
        fontSize: 16,
        color: "#6B7280",
        lineHeight: 24,
        marginBottom: 32,
    },
    typeGrid: {
        gap: 16,
    },
    typeCard: {
        backgroundColor: "#FFF",
        borderRadius: 20,
        padding: 20,
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 2,
        borderColor: "#E5E7EB",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    typeCardSelected: {
        borderColor: "#2563EB",
        backgroundColor: "rgba(37, 99, 235, 0.02)",
    },
    typeCardDisabled: {
        opacity: 0.6,
        backgroundColor: "#F3F4F6",
    },
    typeIcon: {
        width: 56,
        height: 56,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
    },
    typeLabel: {
        fontSize: 18,
        fontWeight: "700",
        color: "#111827",
        flex: 1,
    },
    checkIcon: {
        marginLeft: 8,
    },
    inputSection: {
        marginTop: 20,
    },
    inputWrapper: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFF",
        borderRadius: 16,
        borderWidth: 2,
        borderColor: "#E5E7EB",
        paddingHorizontal: 16,
        height: 64,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 24,
        fontWeight: "700",
        color: "#111827",
    },
    inputHint: {
        fontSize: 14,
        color: "#9CA3AF",
        marginTop: 12,
        textAlign: "center",
    },
    qrSection: {
        alignItems: "center",
        marginTop: 20,
    },
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
    qrImage: {
        width: 220,
        height: 220,
    },
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
    qrLogo: {
        width: 30,
        height: 30,
    },
    downloadBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(37, 99, 235, 0.1)",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 24,
        gap: 8,
    },
    downloadText: {
        fontSize: 14,
        fontWeight: "700",
        color: "#2563EB",
    },
    footer: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: "auto",
        paddingTop: 40,
        paddingBottom: 20,
        gap: 12,
    },
    backBtn: {
        paddingHorizontal: 24,
        height: 56,
        justifyContent: "center",
        alignItems: "center",
    },
    backBtnText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#6B7280",
    },
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
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    nextBtnDisabled: {
        opacity: 0.7,
    },
    nextBtnText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#FFF",
    },
});
