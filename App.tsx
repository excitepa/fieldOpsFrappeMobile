import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  SourceSans3_400Regular,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
} from '@expo-google-fonts/source-sans-3';

import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { RouteName, Lead, Campaign } from './src/types';
import { mockUser } from './src/services/mockService';
import { logout, getAttendanceStats, getCampaigns } from './src/services/api';
import { getAccessToken } from './src/services/apiConfig';
import { localDateStr } from './src/utils/timestamp';
import { isDayLocked } from './src/utils/dayLock';
import { FieldProvider, useFieldStore } from './src/store/useFieldStore';
import { BottomTabs } from './src/components/BottomTabs';

// Screens
import { SplashScreen } from './src/screens/SplashScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { CampaignSelectScreen } from './src/screens/CampaignSelectScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { AgentDashboardScreen } from './src/screens/AgentDashboardScreen';
import { CampaignsScreen } from './src/screens/CampaignsScreen';
import { CampaignDetailScreen } from './src/screens/CampaignDetailScreen';
import { AttendanceScreen } from './src/screens/AttendanceScreen';
import { AttendanceSuccessScreen } from './src/screens/AttendanceSuccessScreen';
import { LeadsScreen } from './src/screens/LeadsScreen';
import { LeadFormScreen } from './src/screens/LeadFormScreen';
import { LeadDetailScreen } from './src/screens/LeadDetailScreen';
import { LeadUpdateScreen } from './src/screens/LeadUpdateScreen';
import { EditLeadScreen } from './src/screens/EditLeadScreen';
import { LeadSurveysScreen } from './src/screens/LeadSurveysScreen';
import { LeadSurveyDetailScreen } from './src/screens/LeadSurveyDetailScreen';
import { LeadSurveyFormScreen } from './src/screens/LeadSurveyFormScreen';
import { LeadSurveyReviewScreen } from './src/screens/LeadSurveyReviewScreen';
import { PipelineOverviewScreen } from './src/screens/PipelineOverviewScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { ReconcileScreen } from './src/screens/ReconcileScreen';
import { ProductCatalogScreen } from './src/screens/ProductCatalogScreen';
import { ProductDetailScreen } from './src/screens/ProductDetailScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ProfileDetailScreen } from './src/screens/ProfileDetailScreen';
import { DraftsListScreen } from './src/screens/DraftsListScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { SuccessScreen } from './src/screens/SuccessScreen';
import { EODSummaryScreen } from './src/screens/EODSummaryScreen';

// Outlet Workspace Screens
import { OutletsScreen } from './src/screens/OutletsScreen';
import { AddOutletScreen } from './src/screens/AddOutletScreen';
import { OutletDetailScreen } from './src/screens/OutletDetailScreen';
import { EditOutletScreen } from './src/screens/EditOutletScreen';
import { OutletActivityScreen } from './src/screens/outletActivity/OutletActivityScreen';
import { SaleReceiptScreen } from './src/screens/SaleReceiptScreen';
import { OrderSuccessScreen } from './src/screens/OrderSuccessScreen';
import { SurveySuccessScreen } from './src/screens/SurveySuccessScreen';
import { OrdersListScreen } from './src/screens/OrdersListScreen';
import { TransactionDetailScreen } from './src/screens/TransactionDetailScreen';
import { OutletTransactionsScreen } from './src/screens/OutletTransactionsScreen';
import { OutletSurveysScreen } from './src/screens/OutletSurveysScreen';
import { OutletSurveyFormScreen } from './src/screens/OutletSurveyFormScreen';
import { OutletSurveyReviewScreen } from './src/screens/OutletSurveyReviewScreen';

type TodayAttendanceDecision = 'home' | 'home-locked' | 'attendance-needed';

/**
 * Works out what a device should do about today's attendance/EOD state — used
 * both on app resume and right after login. Two fast local-only paths handle
 * the device that already personally knows the answer (it clocked in today,
 * or it submitted EOD today); everything else asks the backend directly via
 * get_my_attendance_stats's `today` block, which needs no photo/GPS.
 *
 * This is what makes a second device (agent's phone died mid-shift, they pick
 * up another one) behave correctly: log in, and if the backend confirms
 * they're already clocked in today, skip straight to Home in normal (not
 * locked) mode — no repeat campaign-select/attendance. If EOD was submitted
 * from ANY device, the backend says checked-out too, and this device locks
 * into safe mode immediately on login rather than only discovering that after
 * a wasted attendance attempt.
 */
async function resolveTodayAttendance(
  state: { attendanceStatus: { clockedIn: boolean; clockInDate?: string }; dayLockedUntil: string | null; user: { email: string } },
  dispatch: React.Dispatch<any>
): Promise<TodayAttendanceDecision> {
  const todayIso = localDateStr();
  const clockedInToday = state.attendanceStatus.clockedIn && state.attendanceStatus.clockInDate === todayIso;
  if (state.attendanceStatus.clockedIn && !clockedInToday) {
    dispatch({ type: 'SET_ATTENDANCE_STATUS', clockedIn: false });
  }

  if (isDayLocked(state.dayLockedUntil)) return 'home-locked';
  if (clockedInToday) return 'home';

  // No reliable local memory on this device — ask the backend what's real for
  // this agent today rather than assuming "never attended" and making them
  // repeat campaign-select/attendance on every device they pick up.
  try {
    const stats = await getAttendanceStats();
    if (!stats) return 'attendance-needed';

    if (stats.isCheckedOutToday) {
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 0);
      dispatch({ type: 'SET_DAY_LOCK', until: nextMidnight.toISOString() });
      return 'home-locked';
    }

    if (stats.isCheckedInToday) {
      // Claim a real campaign so Home has something to render — this is a
      // recovery path (their other device died, or this is a brand new one),
      // so pick the agent's real campaign rather than asking them to pick
      // again; there's normally exactly one active campaign per agent.
      try {
        const campaigns = await getCampaigns();
        if (campaigns[0]) dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaign: campaigns[0] });
      } catch {
        // Non-fatal — Home still renders with whatever campaign is already set.
      }
      dispatch({ type: 'SET_ATTENDANCE_STATUS', clockedIn: true, clockInDate: todayIso });
      dispatch({ type: 'SET_CAMPAIGN_SELECTED', value: true });
      dispatch({ type: 'SET_SESSION_AGENT_EMAIL', email: state.user.email || null });
      return 'home';
    }
  } catch {
    // Network/auth failure asking the backend — fail open to the normal flow
    // rather than blocking the agent from using the app entirely.
  }
  return 'attendance-needed';
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FieldProvider>
          <AppInner />
        </FieldProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppInner() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const statusBarStyle = theme.mode === 'dark' ? 'light' : 'dark';

  // Active campaign lives in the shared store so every screen (Dashboard,
  // Attendance, Outlet Activity's module gating) reads the same value instead
  // of silently diverging.
  const { state, dispatch } = useFieldStore();
  const activeCampaign = state.activeCampaign;
  const setActiveCampaign = (campaign: Campaign) => dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaign });

  const [fontsLoaded] = useFonts({
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
  });

  const [appStage, setAppStage] = useState<'splash' | 'login' | 'campaignSelect' | 'app'>('splash');
  const [route, setRoute] = useState<RouteName>('home');

  const [routeData, setRouteData] = useState<any>(null);
  const [leadsList, setLeadsList] = useState<Lead[]>([]);
  const [splashDone, setSplashDone] = useState(false);

  // Screen-history stack so the device's hardware/gesture back button steps
  // back through the app's own navigation instead of falling through to the
  // OS default (which closes the app). A plain ref is enough here — it only
  // needs to be read/written from goBack/navigate, never rendered directly.
  const historyRef = useRef<{ route: RouteName; data: any }[]>([]);

  const navigate = (nextRoute: RouteName, data?: any) => {
    historyRef.current.push({ route, data: routeData });
    if (data !== undefined) setRouteData(data);
    setRoute(nextRoute);
  };

  const goBack = (): boolean => {
    const prev = historyRef.current.pop();
    if (!prev) return false;
    setRoute(prev.route);
    setRouteData(prev.data);
    return true;
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, []);

  // Resume a still-valid session on launch instead of forcing the user back
  // through login + campaign select + clock-in every time the app restarts —
  // the token and attendance status are already persisted, this just reads
  // them once the splash animation and store hydration are both done.
  useEffect(() => {
    if (!splashDone || !state.hydrated || appStage !== 'splash') return;
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        setAppStage('login');
        return;
      }

      const decision = await resolveTodayAttendance(state, dispatch);
      if (decision === 'home' || decision === 'home-locked') {
        historyRef.current = [];
        setRoute('home');
        setAppStage('app');
      } else if (state.campaignSelected) {
        // A real campaign was already picked on a previous clock-in — no
        // need to make the agent choose it again just to clock in for today.
        historyRef.current = [];
        setRoute('attendance');
        setAppStage('campaignSelect');
      } else {
        setAppStage('campaignSelect');
      }
    })();
  }, [splashDone, state.hydrated]);

  const handleAddLead = (newLead: Lead) => {
    setLeadsList((prev) => [newLead, ...prev]);
  };

  const handleUpdateLead = (updated: Lead) => {
    setLeadsList((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleClockInComplete = (selectedCampaign: Campaign) => {
    setActiveCampaign(selectedCampaign);
    // A fresh clock-in means a new work day — start every outlet back at
    // "pending" rather than carrying over whatever was visited/skipped
    // last time this agent worked (SET_OUTLETS otherwise preserves that
    // across refetches so it survives normal in-day navigation).
    dispatch({ type: 'RESET_OUTLET_VISIT_STATUS' });
    // Claims this device's clocked-in session for whoever is actually logged
    // in right now — checked against on the next login so a different agent
    // never silently resumes into this agent's still-clocked-in state.
    dispatch({ type: 'SET_SESSION_AGENT_EMAIL', email: state.user.email || null });
    historyRef.current = [];
    setAppStage('app');
    setRoute('home');
  };

  const handleDayComplete = () => {
    // Not a logout — the agent stays signed in and can keep browsing the app
    // (like a phone's safe mode); blockIfDayLocked() is what actually stops
    // new activity (add outlet/lead, stock requests, sales, etc.) until this
    // lock lifts at midnight or the agent explicitly logs out below.
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    dispatch({ type: 'SET_DAY_LOCK', until: nextMidnight.toISOString() });
    historyRef.current = [];
    setRoute('home');
  };

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primaryLight} />
      </View>
    );
  }

  // 1. Animated Splash Stage
  if (appStage === 'splash') {
    return (
      <>
        <SplashScreen onComplete={() => setSplashDone(true)} />
        <StatusBar style={statusBarStyle} />
      </>
    );
  }

  // 2. Auth Stage (Login & Forgot Password)
  if (appStage === 'login') {
    if (route === 'forgot') {
      return (
        <>
          <ForgotPasswordScreen onNavigate={navigate} />
          <StatusBar style={statusBarStyle} />
        </>
      );
    }

    return (
      <>
        <LoginScreen
          onSuccess={async (user) => {
            if (user) dispatch({ type: 'SET_USER', user });
            historyRef.current = [];
            // Resuming into a clocked-in session must be the SAME agent who
            // clocked in — this is a shared/testing device, and without this
            // check a fresh login would silently inherit whichever agent last
            // clocked in here, letting a brand-new agent skip straight past
            // campaign-select and attendance into someone else's session.
            const sameAgent = !!user?.email && !!state.sessionAgentEmail && user.email === state.sessionAgentEmail;
            if (!sameAgent) dispatch({ type: 'RESET_AGENT_SESSION' });

            // A different agent's local state no longer applies (just reset above,
            // but that won't be reflected in `state` until next render) — pass an
            // equivalent fresh view in so resolveTodayAttendance correctly falls
            // through to asking the backend for THIS agent, instead of reading the
            // stale pre-reset closure value.
            const effectiveState = sameAgent
              ? state
              : { attendanceStatus: { clockedIn: false }, dayLockedUntil: null, user: { email: user?.email || '' } };

            const decision = await resolveTodayAttendance(effectiveState, dispatch);
            if (decision === 'home' || decision === 'home-locked') {
              setRoute('home');
              setAppStage('app');
            } else {
              setAppStage('campaignSelect');
            }
          }}
          onNavigate={navigate}
        />
        <StatusBar style={statusBarStyle} />
      </>
    );
  }

  // 3. Post-Login Campaign Selection & Clock-in Stage
  if (appStage === 'campaignSelect') {
    if (route === 'attendance') {
      return (
        <>
          <AttendanceScreen
            campaignData={routeData?.campaign || activeCampaign}
            onNavigate={navigate}
          />
          <StatusBar style={statusBarStyle} />
        </>
      );
    }

    if (route === 'attendanceSuccess') {
      return (
        <>
          <AttendanceSuccessScreen
            onNavigate={navigate}
            onClockInSuccess={handleClockInComplete}
            routeData={routeData}
          />
          <StatusBar style={statusBarStyle} />
        </>
      );
    }

    return (
      <>
        <CampaignSelectScreen
          onClockInSuccess={handleClockInComplete}
          onNavigate={navigate}
          onBackToLogin={() => setAppStage('login')}
        />
        <StatusBar style={statusBarStyle} />
      </>
    );
  }

  // 4. Main App Screens — the bottom tab bar stays fixed on every screen in
  // this stage (a deliberate departure from the original UI spec, per request).
  const renderCurrentScreen = () => {
    switch (route) {
      case 'home':
        return <DashboardScreen onNavigate={navigate} leadsList={leadsList} />;
      case 'dashboard':
        return <AgentDashboardScreen onNavigate={navigate} leadsList={leadsList} />;
      case 'outlets':
        return <OutletsScreen onNavigate={navigate} />;
      case 'addOutlet':
        return <AddOutletScreen onNavigate={navigate} />;
      case 'outletDetail':
        return <OutletDetailScreen onNavigate={navigate} outletData={routeData} />;
      case 'editOutlet':
        return <EditOutletScreen onNavigate={navigate} routeData={routeData} />;
      case 'outletActivity':
        return <OutletActivityScreen onNavigate={navigate} routeData={routeData} />;
      case 'saleReceipt':
        return <SaleReceiptScreen onNavigate={navigate} routeData={routeData} />;
      case 'orderSuccess':
        return <OrderSuccessScreen onNavigate={navigate} routeData={routeData} />;
      case 'surveySuccess':
        return <SurveySuccessScreen onNavigate={navigate} routeData={routeData} />;
      case 'campaigns':
        return <CampaignsScreen onNavigate={navigate} />;
      case 'campaignDetail':
        return <CampaignDetailScreen onNavigate={navigate} campaignData={routeData} />;
      case 'attendance':
        return (
          <AttendanceScreen
            campaignData={routeData?.campaign || activeCampaign}
            onNavigate={navigate}
          />
        );
      case 'attendanceSuccess':
        return (
          <AttendanceSuccessScreen
            onNavigate={navigate}
            onClockInSuccess={handleClockInComplete}
            routeData={routeData}
          />
        );
      case 'leads':
        return <LeadsScreen onNavigate={navigate} leadsList={leadsList} />;
      case 'leadForm':
        return <LeadFormScreen onNavigate={navigate} onAddLead={handleAddLead} />;
      case 'leadDetail':
        return <LeadDetailScreen onNavigate={navigate} leadData={routeData} />;
      case 'leadUpdate':
        return <LeadUpdateScreen onNavigate={navigate} leadData={routeData} onUpdateLead={handleUpdateLead} />;
      case 'editLead':
        return <EditLeadScreen onNavigate={navigate} leadData={routeData} onUpdateLead={handleUpdateLead} />;
      case 'leadSurveys':
        return <LeadSurveysScreen onNavigate={navigate} leadData={routeData} />;
      case 'leadSurveyDetail':
        return <LeadSurveyDetailScreen onNavigate={navigate} routeData={routeData} />;
      case 'leadSurveyForm':
        return <LeadSurveyFormScreen onNavigate={navigate} routeData={routeData} />;
      case 'leadSurveyReview':
        return <LeadSurveyReviewScreen onNavigate={navigate} routeData={routeData} />;
      case 'pipelineOverview':
        return <PipelineOverviewScreen onNavigate={navigate} leadsList={leadsList} />;
      case 'ordersList':
        return <OrdersListScreen onNavigate={navigate} />;
      case 'transactionDetail':
        return <TransactionDetailScreen onNavigate={navigate} routeData={routeData} />;
      case 'outletTransactions':
        return <OutletTransactionsScreen onNavigate={navigate} outletData={routeData} />;
      case 'outletSurveys':
        return <OutletSurveysScreen onNavigate={navigate} routeData={routeData} />;
      case 'outletSurveyForm':
        return <OutletSurveyFormScreen onNavigate={navigate} routeData={routeData} />;
      case 'outletSurveyReview':
        return <OutletSurveyReviewScreen onNavigate={navigate} routeData={routeData} />;
      case 'inventory':
        return <InventoryScreen onNavigate={navigate} />;
      case 'reconcile':
        return <ReconcileScreen onNavigate={navigate} />;
      case 'productCatalog':
        return <ProductCatalogScreen onNavigate={navigate} />;
      case 'productDetail':
        return <ProductDetailScreen onNavigate={navigate} routeData={routeData} />;
      case 'draftsList':
        return <DraftsListScreen onNavigate={navigate} />;
      case 'sync':
        return <SyncScreen onNavigate={navigate} />;
      case 'notifications':
        return <NotificationsScreen onNavigate={navigate} />;
      case 'profile':
        return (
          <ProfileScreen
            onNavigate={navigate}
            onLogout={() => {
              logout();
              dispatch({ type: 'SET_USER', user: mockUser });
              // Logging out is not clocking out — attendance/campaign state AND the
              // day lock reflect the agent's real-world work day and must survive a
              // plain logout, or logging back in the same day would wrongly force
              // them through attendance again (see LoginScreen onSuccess above, which
              // checks these same flags to skip straight back into the app/safe mode).
              // A different agent logging in next on this shared device is protected
              // separately — RESET_AGENT_SESSION (fired there, not here) clears the
              // day lock along with everything else, so they never inherit someone
              // else's "done for today" state.
              historyRef.current = [];
              setAppStage('login');
              setRoute('home');
            }}
          />
        );
      case 'profileDetail':
        return <ProfileDetailScreen onNavigate={navigate} />;
      case 'eodSummary':
        return <EODSummaryScreen onNavigate={navigate} leadsList={leadsList} onDayComplete={handleDayComplete} />;
      default:
        return <DashboardScreen onNavigate={navigate} />;
    }
  };

  return (
    <View style={styles.appContainer}>
      <View style={styles.screenArea}>{renderCurrentScreen()}</View>
      <BottomTabs activeRoute={route} onNavigate={navigate} />
      <StatusBar style={statusBarStyle} />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.darkBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appContainer: {
    flex: 1,
    backgroundColor: theme.colors.darkBg,
  },
  screenArea: {
    flex: 1,
  },
});
