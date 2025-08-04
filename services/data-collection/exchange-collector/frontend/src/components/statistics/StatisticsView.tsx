/**
 * 统计分析页面
 */

import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useStats } from '@/hooks/useApi';

export default function StatisticsView() {
  const { data: statsData, loading, error } = useStats();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography variant="h6" color="text.secondary" sx={{ ml: 2 }}>
          加载统计数据...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          统计分析
        </Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          加载失败：{error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        统计分析
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                统计分析功能
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                此页面将包含：
              </Typography>
              <ul>
                <li>实时性能图表</li>
                <li>历史数据分析</li>
                <li>交易所对比</li>
                <li>错误率统计</li>
              </ul>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                开发中... 当前统计数据：
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                活跃适配器：{statsData?.system.activeAdapters || 0}
              </Typography>
              <Typography variant="body2">
                总消息数：{statsData?.system.totalMessagesReceived || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}