/**
 * 系统控制页面
 */

import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Switch,
  FormControlLabel,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PowerSettingsNew as PowerIcon,
} from '@mui/icons-material';
import { usePubSubStatus } from '@/hooks/useApi';
import { apiService } from '@/services/api';
import { formatNumber, formatDateTime } from '@/utils/format';

export default function SystemControl() {
  const { data: pubsubData, loading, error, refresh } = usePubSubStatus();
  const [isToggling, setIsToggling] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const handlePubSubToggle = async () => {
    if (!pubsubData?.status) return;

    setIsToggling(true);
    try {
      const newState = !pubsubData.status.enabled;
      await apiService.togglePubSub({
        enabled: newState,
        reason: `用户通过Web界面${newState ? '启用' : '禁用'}PubSub`
      });
      
      setSnackbar({
        open: true,
        message: `PubSub已${newState ? '启用' : '禁用'}`,
        severity: 'success'
      });
      
      // 刷新数据
      setTimeout(() => {
        refresh();
      }, 1000);
      
    } catch (err) {
      setSnackbar({
        open: true,
        message: `操作失败: ${err instanceof Error ? err.message : '未知错误'}`,
        severity: 'error'
      });
    } finally {
      setIsToggling(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography variant="h6" color="text.secondary" sx={{ ml: 2 }}>
          加载系统控制数据...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          系统控制
        </Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          加载失败：{error}
        </Alert>
      </Box>
    );
  }

  const pubsubStatus = pubsubData?.status;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          系统控制
        </Typography>
        <Button
          startIcon={<RefreshIcon />}
          onClick={refresh}
          variant="outlined"
        >
          刷新
        </Button>
      </Box>
      
      <Grid container spacing={3}>
        {/* PubSub 控制 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                PubSub 控制
              </Typography>
              
              <Box mb={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={pubsubStatus?.enabled || false}
                      onChange={handlePubSubToggle}
                      disabled={isToggling}
                    />
                  }
                  label={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography>PubSub 数据发布</Typography>
                      {isToggling && <CircularProgress size={16} />}
                    </Box>
                  }
                />
              </Box>

              <Box display="flex" gap={1} mb={2}>
                <Chip
                  icon={<PowerIcon />}
                  label={pubsubStatus?.connectionStatus || 'unknown'}
                  color={
                    pubsubStatus?.connectionStatus === 'connected' ? 'success' :
                    pubsubStatus?.connectionStatus === 'error' ? 'error' : 'default'
                  }
                  size="small"
                />
                {pubsubStatus?.emulatorMode && (
                  <Chip
                    label="模拟器模式"
                    color="warning"
                    size="small"
                    variant="outlined"
                  />
                )}
              </Box>

              <Typography variant="body2" color="text.secondary" paragraph>
                已发布消息：{formatNumber(pubsubStatus?.publishedMessages || 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                发布错误：{formatNumber(pubsubStatus?.publishErrors || 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                发布速率：{(pubsubStatus?.publishRate || 0).toFixed(2)} msg/s
              </Typography>
              <Typography variant="body2" color="text.secondary">
                最后发布：{pubsubStatus?.lastPublishTime ? 
                  formatDateTime(pubsubStatus.lastPublishTime) : '从未'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* PubSub 主题信息 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                PubSub 主题
              </Typography>
              
              <Typography variant="body2" color="text.secondary" paragraph>
                总主题数：{pubsubStatus?.totalTopics || 0}
              </Typography>

              {pubsubStatus?.topics && pubsubStatus.topics.length > 0 ? (
                <Box>
                  {pubsubStatus.topics.slice(0, 5).map((topic, index) => (
                    <Box key={index} mb={1}>
                      <Typography variant="body2" fontWeight="medium">
                        {topic.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        消息数：{formatNumber(topic.messageCount)} | 订阅数：{topic.subscriptions}
                      </Typography>
                    </Box>
                  ))}
                  {pubsubStatus.topics.length > 5 && (
                    <Typography variant="caption" color="text.secondary">
                      还有 {pubsubStatus.topics.length - 5} 个主题...
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  暂无主题数据
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 更多控制功能 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                其他系统控制
              </Typography>
              <Typography variant="body1" color="text.secondary">
                此区域将包含：
              </Typography>
              <ul>
                <li>适配器启停控制</li>
                <li>系统配置调整</li>
                <li>缓存清理操作</li>
                <li>日志级别调整</li>
              </ul>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                开发中...
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 消息提示 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}