import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { RouteName } from '../types';
import { getStockStatus, formatCaseUnits } from '../utils/stock';

interface ProductDetailScreenProps {
  routeData?: { productId?: string };
  onNavigate: (route: RouteName, data?: any) => void;
}

export const ProductDetailScreen: React.FC<ProductDetailScreenProps> = ({ routeData, onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const product = state.products.find((p) => p.id === routeData?.productId);

  const statusMeta = {
    in: { label: 'In Stock', color: theme.colors.emerald, bg: theme.colors.emeraldLight },
    low: { label: 'Low Stock', color: theme.colors.amber, bg: theme.colors.amberLight },
    out: { label: 'Out of Stock', color: theme.colors.red, bg: theme.colors.redLight },
  } as const;

  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Product" subtitle="Not found" onNavigate={onNavigate} onBackPress={() => onNavigate('productCatalog')} />
        <View style={styles.missingContainer}>
          <Icon name="alert-circle" size={44} color={theme.colors.amber} />
          <Text style={styles.missingTitle}>This product could not be found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const status = getStockStatus(product.stock);
  const meta = statusMeta[status];

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Product Detail" subtitle={product.sku} onNavigate={onNavigate} onBackPress={() => onNavigate('productCatalog')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Icon name="package" size={40} color={theme.colors.primary} />
          </View>
        )}

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{product.name}</Text>
            <Text style={styles.sku}>{product.sku} · {product.category}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {product.description && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>DESCRIPTION</Text>
            <Text style={styles.bodyText}>{product.description}</Text>
          </Card>
        )}

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>PRICING & CASE SIZE</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Unit Price</Text>
            <Text style={styles.detailVal}>₦{product.price.toLocaleString()}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Case Size</Text>
            <Text style={styles.detailVal}>{product.unitsPerCase} units / case</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Current Stock</Text>
            <Text style={styles.detailVal}>{formatCaseUnits(product.stock, product.unitsPerCase)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Warehouse</Text>
            <Text style={styles.detailVal}>{product.warehouse}</Text>
          </View>
        </Card>

        {product.description && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>MARKET NOTES</Text>
            <Text style={styles.bodyText}>{product.description}</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.md },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  missingTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark, textAlign: 'center' },
  heroImage: { width: '100%', height: 200, borderRadius: theme.radius.xl },
  heroPlaceholder: { width: '100%', height: 200, borderRadius: theme.radius.xl, backgroundColor: theme.colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  name: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.textDark },
  sku: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.full },
  statusBadgeText: { fontFamily: theme.fonts.bold, fontSize: 11 },
  sectionCard: { backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder, gap: theme.spacing.xs },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  bodyText: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textDark, lineHeight: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted },
  detailVal: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
});
