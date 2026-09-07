import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { ProductCatalogList } from '../components/ProductCatalogList';
import { useFieldStore } from '../store/useFieldStore';
import { RouteName } from '../types';

interface ProductCatalogScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

export const ProductCatalogScreen: React.FC<ProductCatalogScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Product Catalog" subtitle={`${state.products.length} products`} onNavigate={onNavigate} onBackPress={() => onNavigate('inventory')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ProductCatalogList
          products={state.products}
          onSelectProduct={(p) => onNavigate('productDetail', { productId: p.id })}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 60 },
});
