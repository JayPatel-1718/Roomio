import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark' | 'system';

export type AppTheme = {
    bgMain: string;
    bgCard: string;
    bgNav: string;
    textMain: string;
    textMuted: string;
    glass: string;
    glassBorder: string;
    shadow: string;
    primary: string;
    primaryGlow: string;
    secondary: string;
    success: string;
    warning: string;
    danger: string;
    accent: string;
};

export const darkTheme: AppTheme = {
    bgMain: "#0d1117",
    bgCard: "#161b22",
    bgNav: "rgba(13, 17, 23, 0.8)",
    textMain: "#f0f6fc",
    textMuted: "#8b949e",
    glass: "rgba(255, 255, 255, 0.05)",
    glassBorder: "rgba(255, 255, 255, 0.1)",
    shadow: "rgba(0, 0, 0, 0.6)",
    primary: "#2f81f7",
    primaryGlow: "rgba(47, 129, 247, 0.2)",
    secondary: "#79c0ff",
    success: "#3fb950",
    warning: "#d29922",
    danger: "#f85149",
    accent: "#bc8cff",
};

export const lightTheme: AppTheme = {
    bgMain: "#f6f8fa",
    bgCard: "#ffffff",
    bgNav: "rgba(255, 255, 255, 0.9)",
    textMain: "#1f2328",
    textMuted: "#656d76",
    glass: "rgba(37, 99, 235, 0.05)",
    glassBorder: "rgba(31, 35, 40, 0.12)",
    shadow: "rgba(31, 35, 40, 0.08)",
    primary: "#2463eb",
    primaryGlow: "rgba(36, 99, 235, 0.1)",
    secondary: "#54aeff",
    success: "#1a7f37",
    warning: "#9a6700",
    danger: "#cf222e",
    accent: "#8250df",
};

interface ThemeContextType {
    theme: 'light' | 'dark';
    colors: AppTheme;
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

    const isSystemDark = deviceColorScheme === 'dark';
    const activeTheme = mode === 'system' ? (isSystemDark ? 'dark' : 'light') : mode;
    const colors = activeTheme === 'dark' ? darkTheme : lightTheme;

    return (
        <ThemeContext.Provider value={{
            theme: activeTheme as 'light' | 'dark',
            colors,
            mode,
            setMode
        }}>
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

