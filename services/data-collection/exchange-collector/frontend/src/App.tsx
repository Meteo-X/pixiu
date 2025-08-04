/**
 * 主应用组件
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import AppLayout from '@/components/layout/AppLayout';

// 懒加载页面组件
const Dashboard = React.lazy(() => import('@/components/dashboard/Dashboard'));
const SubscriptionManager = React.lazy(() => import('@/components/subscriptions/SubscriptionManager'));
const StatisticsView = React.lazy(() => import('@/components/statistics/StatisticsView'));
const SystemControl = React.lazy(() => import('@/components/control/SystemControl'));
const LiveDataStream = React.lazy(() => import('@/components/stream/LiveDataStream'));
const DebugDashboard = React.lazy(() => import('@/components/debug/DebugDashboard'));

// 创建主题
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", "Noto Sans SC", sans-serif',
  },
});

// 创建 React Query 客户端
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    },
  },
});

// 加载中组件
function LoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '200px',
      fontSize: '16px',
      color: '#666',
    }}>
      加载中...
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <WebSocketProvider
          url={`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`}
          autoConnect={true}
          reconnectInterval={5000}
          maxReconnectAttempts={10}
        >
          <Router>
            <AppLayout>
              <React.Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/debug" element={<DebugDashboard />} />
                  <Route path="/subscriptions" element={<SubscriptionManager />} />
                  <Route path="/stream" element={<LiveDataStream />} />
                  <Route path="/statistics" element={<StatisticsView />} />
                  <Route path="/control" element={<SystemControl />} />
                </Routes>
              </React.Suspense>
            </AppLayout>
          </Router>
        </WebSocketProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;