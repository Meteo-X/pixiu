/**
 * 调试版仪表板
 */

import { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Button, Alert } from '@mui/material';

export default function DebugDashboard() {
  const [statsData, setStatsData] = useState<any>(null);
  const [adaptersData, setAdaptersData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching stats...');
      
      const response = await fetch('/api/stats');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Stats data:', data);
      setStatsData(data);
      
    } catch (err) {
      console.error('Stats fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdapters = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching adapters...');
      
      const response = await fetch('/api/adapters');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Adapters data:', data);
      setAdaptersData(data);
      
    } catch (err) {
      console.error('Adapters fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchAdapters();
  }, []);

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        调试仪表板
      </Typography>
      
      <Box sx={{ mb: 2 }}>
        <Button onClick={fetchStats} disabled={loading} sx={{ mr: 1 }}>
          重新加载统计
        </Button>
        <Button onClick={fetchAdapters} disabled={loading}>
          重新加载适配器
        </Button>
      </Box>

      {loading && (
        <Alert severity="info">加载中...</Alert>
      )}
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          错误: {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Card sx={{ minWidth: 300 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              统计数据
            </Typography>
            {statsData ? (
              <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                {JSON.stringify(statsData, null, 2)}
              </pre>
            ) : (
              <Typography color="text.secondary">未加载</Typography>
            )}
          </CardContent>
        </Card>

        <Card sx={{ minWidth: 300 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              适配器数据
            </Typography>
            {adaptersData ? (
              <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                {JSON.stringify(adaptersData, null, 2)}
              </pre>
            ) : (
              <Typography color="text.secondary">未加载</Typography>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}