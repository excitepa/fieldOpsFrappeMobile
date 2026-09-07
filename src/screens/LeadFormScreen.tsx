import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { createLead, NetworkError } from '../services/api';
import { useFieldStore } from '../store/useFieldStore';
import { RouteName, Lead, LeadDraft } from '../types';

interface LeadFormScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  onAddLead: (lead: Lead) => void;
}

const PIPELINE_OPTIONS = ['Retail Sales', 'Loan Origination', 'Merchant Onboarding'];
const SOURCE_OPTIONS = ['Walk-In', 'Referral', 'Cold Call', 'Outlet Visit', 'Campaign', 'Social'];

export const LeadFormScreen: React.FC<LeadFormScreenProps> = ({ onNavigate, onAddLead }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const campaignId = state.activeCampaign?.id || '';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [parentCompany, setParentCompany] = useState('');
  const [outlet, setOutlet] = useState('');
  const [address, setAddress] = useState('');
  const [leadValue, setLeadValue] = useState('');
  const [source, setSource] = useState(SOURCE_OPTIONS[0]);
  const [pipeline, setPipeline] = useState(PIPELINE_OPTIONS[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name || !phone || !outlet) {
      Alert.alert('Required Information', 'Full name, phone, and outlet are required.');
      return;
    }
    setLoading(true);

    let newLead: Lead;
    try {
      const numericValue = parseFloat(leadValue) || 0;
      newLead = await createLead(campaignId, {
        name,
        company: outlet,
        phone,
        email: email || undefined,
        address: address || undefined,
        source,
        notes: notes || undefined,
        value: numericValue > 0 ? numericValue : undefined,
      });
      // Enrich with fields the API doesn't return yet
      newLead = {
        ...newLead,
        parentCompany: parentCompany || undefined,
        pipeline,
        next: 'Follow up within 48 hours',
        createdAt: new Date().toISOString().slice(0, 10),
      };
    } catch (e: any) {
      if (!(e instanceof NetworkError)) {
        // The request reached the server and was rejected (validation error, business
        // rule, etc.) — this will never succeed on retry, so don't disguise it as an
        // offline save. Surface the real reason and stop.
        Alert.alert('Could Not Add Lead', e?.message || 'The server rejected this lead. Please check the details and try again.');
        return;
      }

      // Genuine connectivity failure — build a local optimistic lead so the UI doesn't go blank
      const numericValue = parseFloat(leadValue) || 0;
      newLead = {
        id: `l_${Date.now()}`,
        name,
        phone,
        email: email || undefined,
        parentCompany: parentCompany || undefined,
        company: outlet,
        address: address || undefined,
        stage: 'New',
        score: 20,
        next: 'Follow up within 48 hours',
        value: numericValue > 0 ? `₦${numericValue.toLocaleString()}` : '',
        source,
        pipeline,
        notes,
        createdAt: new Date().toISOString().slice(0, 10),
        lastContactDate: new Date().toISOString().slice(0, 10),
      };

      // Persist to offline sync queue
      const leadDraft: LeadDraft = {
        id: `ld_${Date.now()}`,
        campaignId,
        name,
        company: outlet,
        phone,
        email: email || undefined,
        address: address || undefined,
        source,
        notes: notes || undefined,
        parentCompany: parentCompany || undefined,
        leadValue: leadValue || undefined,
        pipeline,
        createdAt: new Date().toISOString().slice(0, 10),
        pendingSync: true,
      };
      dispatch({ type: 'SAVE_LEAD_DRAFT', leadDraft });

      Alert.alert(
        'Saved Locally',
        `Lead saved on this device. It will appear in the Sync page for later upload.\n\n(${e?.message || 'Network error'})`,
      );
    } finally {
      setLoading(false);
    }

    onAddLead(newLead);
    onNavigate('leadSuccess');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Capture Lead" subtitle={`${pipeline} · starts at New`} onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>LEAD INFORMATION</Text>
          <Input label="Full Name" value={name} onChangeText={setName} placeholder="Ada Obi" required variant="field" />
          <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="+234 803 000 0000" keyboardType="phone-pad" required variant="field" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="ada@example.com" keyboardType="email-address" variant="field" />
          <Input label="Company" value={parentCompany} onChangeText={setParentCompany} placeholder="QuickShop Ltd." variant="field" />
          <Input label="Outlet" value={outlet} onChangeText={setOutlet} placeholder="QuickShop Express" required variant="field" />
          <Input label="Address" value={address} onChangeText={setAddress} placeholder="12 Marine Rd, Oniru" variant="field" />
          <Input label="Lead Value (₦)" value={leadValue} onChangeText={setLeadValue} placeholder="500000" keyboardType="numeric" variant="field" />
        </Card>

        <Text style={styles.fieldLabel}>Assigned Pipeline <Text style={styles.required}>*</Text></Text>
        <View style={styles.chipRow}>
          {PIPELINE_OPTIONS.map((opt) => {
            const active = pipeline === opt;
            return (
              <Pressable key={opt} onPress={() => setPipeline(opt)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: theme.spacing.sm }]}>Lead Source <Text style={styles.required}>*</Text></Text>
        <View style={styles.chipRow}>
          {SOURCE_OPTIONS.map((opt) => {
            const active = source === opt;
            return (
              <Pressable key={opt} onPress={() => setSource(opt)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Interested in the ₦250k tier..." multiline variant="field" />

        <Button title={loading ? 'Saving...' : 'Save Lead'} onPress={handleSubmit} loading={loading} variant="navy" size="large" style={styles.submitBtn} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.sm },
  formCard: { gap: 2, marginBottom: theme.spacing.sm },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  fieldLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  required: { color: theme.colors.red },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: theme.radius.full, backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder },
  chipActive: { backgroundColor: theme.colors.navy, borderColor: theme.colors.navy },
  chipText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textMuted },
  chipTextActive: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
  submitBtn: { marginTop: theme.spacing.lg },
});
