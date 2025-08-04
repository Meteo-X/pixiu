/**
 * 仪表板主页面
 */

import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { useStats, useAdapters } from '@/hooks/useApi';
import { formatNumber, formatBytes, formatDuration } from '@/utils/format';

// 统计卡片组件
function StatCard({
  title,
  value,
  unit,
  icon,
  color = 'primary',
}: {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ReactElement;
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
}) {
  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h4" component="div" color={`${color}.main`}>
              {value}
              {unit && (
                <Typography component="span" variant="h6" color="text.secondary" sx={{ ml: 1 }}>
                  {unit}
                </Typography>
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
          </Box>
          <Box sx={{ color: `${color}.main` }}>
            {React.cloneElement(icon, { fontSize: 'large' })}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: statsData, loading: statsLoading, error: statsError } = useStats();
  const { data: adaptersData, loading: adaptersLoading } = useAdapters();

  if (statsLoading || adaptersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography variant="h6" color="text.secondary" sx={{ ml: 2 }}>
          加载中...
        </Typography>
      </Box>
    );
  }

  if (statsError) {
    return (
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          系统仪表板
        </Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          加载失败：{statsError}
        </Alert>
      </Box>
    );
  }

  const stats = statsData;
  const adapters = adaptersData;

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        系统仪表板
      </Typography>
      
      <Grid container spacing={3}>
        {/* 系统概览统计 */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="活跃适配器"
            value={stats?.system.activeAdapters || 0}
            unit={`/ ${stats?.system.totalAdapters || 0}`}
            icon={<DashboardIcon />}
            color="primary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="总订阅数"
            value={stats?.system.totalSubscriptions || 0}
            icon={<TrendingUpIcon />}
            color="success"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="消息总数"
            value={formatNumber(stats?.system.totalMessagesReceived || 0, 0)}
            icon={<SpeedIcon />}
            color="warning"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="内存使用"
            value={formatBytes(stats?.system.memoryUsage.used || 0)}
            unit={`/ ${formatBytes(stats?.system.memoryUsage.total || 0)}`}
            icon={<StorageIcon />}
            color="error"
          />
        </Grid>

        {/* 适配器状态 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                适配器状态
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {adapters?.adapters?.map((adapter) => (
                  <Chip
                    key={adapter.name}
                    label={`${adapter.name} (${adapter.status})`}
                    color={
                      adapter.status === 'active'
                        ? 'success'
                        : adapter.status === 'error'
                        ? 'error'
                        : 'default'
                    }
                    variant={adapter.status === 'active' ? 'filled' : 'outlined'}
                  />
                )) || (
                  <Typography variant="body2" color="text.secondary">
                    暂无适配器数据
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 系统运行时间 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                系统信息
              </Typography>
              <Typography variant="body1" paragraph>
                系统运行时间：{formatDuration(stats?.system.systemUptime || 0)}
              </Typography>
              <Typography variant="body1" paragraph>
                缓存条目数：{formatNumber(stats?.cache.totalEntries || 0, 0)}
              </Typography>
              <Typography variant="body1">
                缓存命中率：{((stats?.cache.hitRate || 0) * 100).toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* 实时性能 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                实时性能
              </Typography>
              {stats?.adapters && Object.entries(stats.adapters).map(([exchange, data]) => (
                <Typography key={exchange} variant="body2" paragraph>
                  {exchange}: {formatNumber(data.messagesPerSecond, 1)} msg/s, {formatBytes(data.bytesPerSecond)}/s
                </Typography>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}