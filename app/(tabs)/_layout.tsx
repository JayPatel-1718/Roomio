import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter, usePathname } from "expo-router";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { useTheme } from "../../context/ThemeContext";

export default function TabsLayout() {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();

  const isWide = width >= 900;
  const isDark = theme === "dark";

  const menuItems = [
    { icon: "grid", label: "Home", route: "/dashboard" },
    { icon: "bed", label: "Rooms", route: "/rooms" },
    { icon: "restaurant", label: "Menu", route: "/Menu" },
    { icon: "bar-chart", label: "Analytics", route: "/analytics" },
    { icon: "settings", label: "Settings", route: "/profile" },
  ];

  const Sidebar = () => (
    <View style={[styles.sidebar, {
      backgroundColor: colors.bgCard,
      borderRightColor: colors.glassBorder,
      width: isWide ? 280 : 80
    }]}>
      <View style={[styles.sidebarHeader, !isWide && { paddingHorizontal: 0, justifyContent: 'center' }]}>
        <View style={[styles.sidebarLogoIcon, { backgroundColor: colors.primary }]}>
          <Ionicons name="business" size={isWide ? 24 : 20} color="#fff" />
        </View>
        {isWide && (
          <View>
            <Text style={[styles.sidebarLogoText, { color: colors.textMain }]}>Roomio</Text>
            <Text style={[styles.sidebarLogoSub, { color: colors.textMuted }]}>ENTERPRISE</Text>
          </View>
        )}
      </View>

      <View style={[styles.sidebarMenu, !isWide && { paddingHorizontal: 8 }]}>
        {menuItems.map((item) => {
          const isActive = pathname === item.route;
          return (
            <Pressable
              key={item.label}
              onPress={() => router.push(item.route as any)}
              style={[
                styles.sidebarItem,
                isActive && { backgroundColor: `${colors.primary}12` },
                !isWide && { paddingHorizontal: 0, justifyContent: 'center' }
              ]}
            >
              <Ionicons
                name={`${item.icon}${isActive ? "" : "-outline"}` as any}
                size={22}
                color={isActive ? colors.primary : colors.textMuted}
              />
              {isWide && (
                <Text style={[
                  styles.sidebarItemText,
                  { color: isActive ? colors.primary : colors.textMuted }
                ]}>
                  {item.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {isWide && (
        <View style={[styles.sidebarFooter, { borderTopColor: colors.glassBorder }]}>
          <View style={[styles.userBadge, { backgroundColor: colors.primaryGlow }]}>
            <Text style={[styles.userBadgeText, { color: colors.primary }]}>AD</Text>
          </View>
          <View>
            <Text style={[styles.userName, { color: colors.textMain }]}>Admin Manager</Text>
            <Text style={[styles.userRole, { color: colors.textMuted }]}>General Operations</Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <Sidebar />
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarStyle: { display: 'none' }, // Remove bottom navigation
          }}
        >
          <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
          <Tabs.Screen name="rooms" options={{ title: "Rooms" }} />
          <Tabs.Screen name="Menu" options={{ title: "Menu" }} />
          <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
          <Tabs.Screen name="profile" options={{ title: "Settings" }} />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    paddingVertical: 32,
    borderRightWidth: 1,
    height: '100%',
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  sidebarLogoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarLogoText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sidebarLogoSub: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: -2,
  },
  sidebarMenu: {
    flex: 1,
    paddingHorizontal: 12,
    gap: 4,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  sidebarItemText: {
    fontSize: 15,
    fontWeight: '700',
  },
  sidebarFooter: {
    padding: 24,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userBadgeText: {
    fontWeight: '900',
    fontSize: 13,
  },
  userName: {
    fontWeight: '800',
    fontSize: 14,
  },
  userRole: {
    fontSize: 12,
    fontWeight: '600',
  },
});