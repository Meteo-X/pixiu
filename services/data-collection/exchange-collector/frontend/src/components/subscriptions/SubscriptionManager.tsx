/**
 * 订阅管理页面
 */

import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useSubscriptions } from '@/hooks/useApi';
import { formatNumber, formatDateTime } from '@/utils/format';

export default function SubscriptionManager() {
  const { data: subscriptionsData, loading, error, refresh } = useSubscriptions();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography variant="h6" color="text.secondary" sx={{ ml: 2 }}>
          加载订阅数据...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          订阅管理
        </Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          加载失败：{error}
        </Alert>
      </Box>
    );
  }

  const subscriptions = subscriptionsData?.subscriptions || [];
  const summary = subscriptionsData?.summary;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          订阅管理
        </Typography>
        <IconButton onClick={refresh} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* 订阅统计 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            订阅统计
          </Typography>
          <Box display="flex" gap={2} flexWrap="wrap">
            <Chip 
              label={`总计: ${summary?.total || 0}`} 
              color="primary" 
              variant="outlined" 
            />
            <Chip 
              label={`活跃: ${summary?.active || 0}`} 
              color="success" 
            />
            <Chip 
              label={`暂停: ${summary?.paused || 0}`} 
              color="warning" 
            />
            <Chip 
              label={`错误: ${summary?.error || 0}`} 
              color="error" 
            />
          </Box>
        </CardContent>
      </Card>

      {/* 订阅列表 */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            订阅列表
          </Typography>
          
          {subscriptions.length > 0 ? (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>交易所</TableCell>
                    <TableCell>交易对</TableCell>
                    <TableCell>数据类型</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>消息数</TableCell>
                    <TableCell>最后更新</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {subscriptions.map((subscription, index) => (
                    <TableRow key={`${subscription.exchange}-${subscription.symbol}-${index}`}>
                      <TableCell>{subscription.exchange}</TableCell>
                      <TableCell>{subscription.symbol}</TableCell>
                      <TableCell>
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          {subscription.dataTypes.map(type => (
                            <Chip 
                              key={type} 
                              label={type} 
                              size="small" 
                              variant="outlined" 
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={subscription.status === 'active' ? '活跃' : 
                                subscription.status === 'paused' ? '暂停' : '错误'}
                          color={subscription.status === 'active' ? 'success' : 
                                subscription.status === 'paused' ? 'warning' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {formatNumber(subscription.metrics.messagesReceived)}
                      </TableCell>
                      <TableCell>
                        {subscription.metrics.lastUpdate 
                          ? formatDateTime(subscription.metrics.lastUpdate) 
                          : '从未'}
                      </TableCell>
                      <TableCell>
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => {
                            // TODO: 实现删除订阅功能
                            console.log('删除订阅:', subscription);
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body1" color="text.secondary" textAlign="center" py={4}>
              暂无订阅数据
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}