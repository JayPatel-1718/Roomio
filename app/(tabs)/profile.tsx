import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    SafeAreaView,
    Alert,
    Switch,
    Animated,
    useWindowDimensions,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import { useTheme } from '../../context/ThemeContext';

export default function ProfileScreen() {
    const router = useRouter();
    const auth = getAuth();
    const user = auth.currentUser;
    const { theme, mode, setMode } = useTheme();
    const { width } = useWindowDimensions();
    const isWide = width >= 900;

    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [userData, setUserData] = useState<any>(null);

    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();

        const fetchUserData = async () => {
            if (user) {
                try {
                    const snap = await getDoc(doc(db, 'users', user.uid));
                    if (snap.exists()) {
                        setUserData(snap.data());
                    }
                } catch (error) {
                    console.error('Error fetching user data:', error);
                }
            }
        };

        fetchUserData();
    }, [user]);

    const handleLogout = async () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to logout?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await signOut(auth);
                            router.replace('/admin-login');
                        } catch (error) {
                            Alert.alert('Error', 'Failed to logout');
                        }
                    },
                },
            ]
        );
    };

    const handleChangePassword = async () => {
        if (!newPassword || !confirmPassword || !currentPassword) {
            Alert.alert('Error', 'Please fill all fields');
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert('Error', 'New passwords do not match');
            return;
        }

        setLoading(true);
        try {
            if (user && user.email) {
                const credential = EmailAuthProvider.credential(user.email, currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPassword);
                Alert.alert('Success', 'Password updated successfully');
                setIsChangingPassword(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to update password');
        } finally {
            setLoading(false);
        }
    };

    const colors = theme === 'dark'
        ? {
            bgMain: "#010409",
            bgCard: "rgba(13, 17, 23, 0.6)",
            textMain: "#f0f6fc",
            textMuted: "#8b949e",
            glass: "rgba(255, 255, 255, 0.03)",
            glassBorder: "rgba(255, 255, 255, 0.1)",
            primary: "#2563eb",
            danger: "#ef4444",
            success: "#22c55e",
        }
        : {
            bgMain: "#f8fafc",
            bgCard: "#ffffff",
            textMain: "#0f172a",
            textMuted: "#64748b",
            glass: "rgba(37, 99, 235, 0.04)",
            glassBorder: "rgba(37, 99, 235, 0.12)",
            primary: "#2563eb",
            danger: "#dc2626",
            success: "#16a34a",
        };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.bgMain }]}>
            <Animated.ScrollView
                style={[styles.container, { opacity: fadeAnim }]}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={[styles.title, { color: colors.textMain }]}>Profile</Text>
                    <Text style={[styles.subtitle, { color: colors.textMuted }]}>Manage your account and preferences</Text>
                </View>

                {/* Account Details */}
                <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.glassBorder }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
                        <Text style={[styles.sectionTitle, { color: colors.textMain }]}>Account Details</Text>
                    </View>
                    <View style={styles.detailItem}>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Email Address</Text>
                        <Text style={[styles.detailValue, { color: colors.textMain }]}>{user?.email || 'N/A'}</Text>
                    </View>

                    {!isChangingPassword ? (
                        <Pressable
                            onPress={() => setIsChangingPassword(true)}
                            style={({ pressed }) => [
                                styles.actionBtn,
                                { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                                pressed && { opacity: 0.7 }
                            ]}
                        >
                            <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
                            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Change Password</Text>
                        </Pressable>
                    ) : (
                        <View style={styles.passwordForm}>
                            <Text style={[styles.formLabel, { color: colors.textMuted, marginTop: 12 }]}>Current Password</Text>
                            <TextInput
                                style={[styles.input, { color: colors.textMain, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                                secureTextEntry
                                value={currentPassword}
                                onChangeText={setCurrentPassword}
                                placeholder="Enter current password"
                                placeholderTextColor={colors.textMuted}
                            />
                            <Text style={[styles.formLabel, { color: colors.textMuted }]}>New Password</Text>
                            <TextInput
                                style={[styles.input, { color: colors.textMain, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                                secureTextEntry
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder="Enter new password"
                                placeholderTextColor={colors.textMuted}
                            />
                            <Text style={[styles.formLabel, { color: colors.textMuted }]}>Confirm New Password</Text>
                            <TextInput
                                style={[styles.input, { color: colors.textMain, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                                secureTextEntry
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="Confirm new password"
                                placeholderTextColor={colors.textMuted}
                            />
                            <View style={styles.formActions}>
                                <Pressable
                                    onPress={() => setIsChangingPassword(false)}
                                    style={[styles.formBtn, { backgroundColor: colors.glass }]}
                                >
                                    <Text style={[styles.formBtnText, { color: colors.textMuted }]}>Cancel</Text>
                                </Pressable>
                                <Pressable
                                    onPress={handleChangePassword}
                                    style={[styles.formBtn, { backgroundColor: colors.primary }]}
                                    disabled={loading}
                                >
                                    <Text style={[styles.formBtnText, { color: '#fff' }]}>
                                        {loading ? 'Updating...' : 'Update'}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    )}
                </View>

                {/* Theme Preferences */}
                <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.glassBorder }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="color-palette-outline" size={24} color={colors.primary} />
                        <Text style={[styles.sectionTitle, { color: colors.textMain }]}>Theme Preference</Text>
                    </View>

                    <View style={styles.themeOptions}>
                        <Pressable
                            onPress={() => setMode('light')}
                            style={[
                                styles.themeOption,
                                mode === 'light' && { borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
                                { borderColor: colors.glassBorder, backgroundColor: colors.glass }
                            ]}
                        >
                            <Ionicons name="sunny-outline" size={20} color={mode === 'light' ? colors.primary : colors.textMuted} />
                            <Text style={[styles.themeOptionText, { color: mode === 'light' ? colors.primary : colors.textMain }]}>Light</Text>
                        </Pressable>

                        <Pressable
                            onPress={() => setMode('dark')}
                            style={[
                                styles.themeOption,
                                mode === 'dark' && { borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
                                { borderColor: colors.glassBorder, backgroundColor: colors.glass }
                            ]}
                        >
                            <Ionicons name="moon-outline" size={20} color={mode === 'dark' ? colors.primary : colors.textMuted} />
                            <Text style={[styles.themeOptionText, { color: mode === 'dark' ? colors.primary : colors.textMain }]}>Dark</Text>
                        </Pressable>

                        <Pressable
                            onPress={() => setMode('system')}
                            style={[
                                styles.themeOption,
                                mode === 'system' && { borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
                                { borderColor: colors.glassBorder, backgroundColor: colors.glass }
                            ]}
                        >
                            <Ionicons name="settings-outline" size={20} color={mode === 'system' ? colors.primary : colors.textMuted} />
                            <Text style={[styles.themeOptionText, { color: mode === 'system' ? colors.primary : colors.textMain }]}>System</Text>
                        </Pressable>
                    </View>
                </View>

                {/* Properties Section */}
                <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.glassBorder }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="business-outline" size={24} color={colors.primary} />
                        <Text style={[styles.sectionTitle, { color: colors.textMain }]}>Owned Properties</Text>
                    </View>

                    {/* Hotels */}
                    <View style={styles.propertyItem}>
                        <View style={styles.propertyIcon}>
                            <Ionicons name="bed-outline" size={20} color={colors.success} />
                        </View>
                        <View style={styles.propertyDetails}>
                            <Text style={[styles.propertyType, { color: colors.textMain }]}>Hotels</Text>
                            <Text style={[styles.propertyCount, { color: colors.textMuted }]}>
                                {userData?.propertyType === 'Hotel' ? `1 Active Property (${userData?.buildingConfig?.totalFloors * userData?.buildingConfig?.roomsPerFloor || 0} Rooms)` : 'No Property registered'}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </View>

                    {/* PGs (Placeholder) */}
                    <View style={[styles.propertyItem, { opacity: 0.6 }]}>
                        <View style={styles.propertyIcon}>
                            <Ionicons name="home-outline" size={20} color={colors.primary} />
                        </View>
                        <View style={styles.propertyDetails}>
                            <Text style={[styles.propertyType, { color: colors.textMain }]}>PGs</Text>
                            <Text style={[styles.propertyCount, { color: colors.textMuted }]}>Coming Soon</Text>
                        </View>
                    </View>

                    {/* Villas (Placeholder) */}
                    <View style={[styles.propertyItem, { opacity: 0.6 }]}>
                        <View style={styles.propertyIcon}>
                            <Ionicons name="leaf-outline" size={20} color="#8b5cf6" />
                        </View>
                        <View style={styles.propertyDetails}>
                            <Text style={[styles.propertyType, { color: colors.textMain }]}>Villas</Text>
                            <Text style={[styles.propertyCount, { color: colors.textMuted }]}>Coming Soon</Text>
                        </View>
                    </View>
                </View>

                {/* Logout Button */}
                <Pressable
                    onPress={handleLogout}
                    style={({ pressed }) => [
                        styles.logoutBtn,
                        { borderColor: colors.danger },
                        pressed && { backgroundColor: `${colors.danger}15` }
                    ]}
                >
                    <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                    <Text style={[styles.logoutText, { color: colors.danger }]}>Logout</Text>
                </Pressable>

                <Text style={[styles.versionText, { color: colors.textMuted }]}>VERSION 2.4.0 • BUILD 902</Text>
            </Animated.ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    content: {
        padding: 24,
        paddingBottom: 40,
    },
    header: {
        marginBottom: 32,
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '600',
        marginTop: 4,
    },
    card: {
        borderRadius: 24,
        borderWidth: 1,
        padding: 20,
        marginBottom: 20,
        overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
    },
    detailItem: {
        marginBottom: 16,
    },
    detailLabel: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    detailValue: {
        fontSize: 16,
        fontWeight: '700',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        marginTop: 8,
    },
    actionBtnText: {
        fontSize: 14,
        fontWeight: '800',
    },
    themeOptions: {
        flexDirection: 'row',
        gap: 10,
    },
    themeOption: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 2,
        gap: 8,
    },
    themeOptionText: {
        fontSize: 13,
        fontWeight: '800',
    },
    propertyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    propertyIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    propertyDetails: {
        flex: 1,
    },
    propertyType: {
        fontSize: 15,
        fontWeight: '800',
    },
    propertyCount: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    },
    passwordForm: {
        marginTop: 8,
    },
    formLabel: {
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 6,
    },
    input: {
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 16,
    },
    formActions: {
        flexDirection: 'row',
        gap: 12,
    },
    formBtn: {
        flex: 1,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    formBtnText: {
        fontSize: 14,
        fontWeight: '800',
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: 56,
        borderRadius: 20,
        borderWidth: 2,
        marginTop: 12,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '900',
    },
    versionText: {
        textAlign: 'center',
        marginTop: 32,
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 2,
    },
});
