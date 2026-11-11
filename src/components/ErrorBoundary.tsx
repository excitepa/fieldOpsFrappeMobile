import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { debugError } from '../utils/logger';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A render-time error (a bad prop, a null a component didn't guard against)
 * is a different failure mode from an async/promise error — without a boundary,
 * React just unmounts the crashed tree, which on a release build (see
 * errorReporting.ts for the equivalent async-side gap) can leave the screen
 * blank or frozen with no indication anything went wrong. Deliberately built
 * with no dependency on ThemeProvider/theme tokens — if something upstream in
 * the app's own context/providers is what crashed, this fallback still has to
 * render on its own.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    debugError('[ErrorBoundary]', error?.message, error?.stack, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message || 'An unexpected error occurred.'}</Text>
          <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FFFFFF', gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#1B2559', textAlign: 'center' },
  message: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  button: { marginTop: 12, backgroundColor: '#1B2559', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
