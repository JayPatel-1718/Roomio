import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: 'light' | 'dark';
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'rooomio_theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const deviceColorScheme = useDeviceColorScheme();
    const [mode, setModeState] = useState<ThemeMode>('system');

    useEffect(() => {
        // Load persisted theme mode
        const loadTheme = async () => {
            try {
                const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (savedMode) {
                    setModeState(savedMode as ThemeMode);
                }
            } catch (e) {
                console.error('Failed to load theme mode', e);
            }
        };
        loadTheme();
    }, []);

    const setMode = async (newMode: ThemeMode) => {
        setModeState(newMode);
        try {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
        } catch (e) {
            console.error('Failed to save theme mode', e);
        }
    };

    const theme = mode === 'system' ? (deviceColorScheme ?? 'light') : mode;

    return (
        <ThemeContext.Provider value={{ theme: theme === 'dark' ? 'dark' : 'light', mode, setMode }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
