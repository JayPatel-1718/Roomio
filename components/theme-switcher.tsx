import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { ThemedText } from './themed-text';

export function ThemeSwitcher() {
    const { mode, setMode } = useTheme();

    return (
        <View style={styles.container}>
            <Pressable
                style={[styles.option, mode === 'light' && styles.selected]}
                onPress={() => setMode('light')}
            >
                <Ionicons name="sunny" size={20} color={mode === 'light' ? '#2563EB' : '#6B7280'} />
            </Pressable>

            <Pressable
                style={[styles.option, mode === 'dark' && styles.selected]}
                onPress={() => setMode('dark')}
            >
                <Ionicons name="moon" size={20} color={mode === 'dark' ? '#2563EB' : '#6B7280'} />
            </Pressable>

            <Pressable
                style={[styles.option, mode === 'system' && styles.selected]}
                onPress={() => setMode('system')}
            >
                <Ionicons name="settings-outline" size={20} color={mode === 'system' ? '#2563EB' : '#6B7280'} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: 'rgba(107, 114, 128, 0.1)',
        borderRadius: 99,
        padding: 4,
        alignSelf: 'center',
    },
    option: {
        padding: 8,
        borderRadius: 99,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    selected: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
});
