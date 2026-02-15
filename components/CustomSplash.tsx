import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function CustomSplash({
  onFinish,
}: {
  onFinish: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onFinish, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Roomio</Text>
      <Text style={styles.tagline}>Service Management</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },

  logo: {
    fontSize: 36,
    fontWeight: "700",
    color: "#1F2937",
  },

  tagline: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 6,
  },
});