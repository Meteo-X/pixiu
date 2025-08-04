/**
 * 连接状态指示器组件
 */

import {
  Box,
  Chip,
  Tooltip,
  IconButton,
  Typography,
} from '@mui/material';
import {
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon,
  Sync as SyncIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { formatDateTime } from '@/utils/format';

export default function ConnectionStatusIndicator() {
  const { state, connect, disconnect, isConnected } = useWebSocket();

  const getStatusInfo = () => {
    switch (state.status) {
      case 'connected':
        return {
          color: 'success' as const,
          icon: <WifiIcon fontSize="small" />,
          label: '已连接',
          description: state.lastConnected ? `连接时间：${formatDateTime(state.lastConnected)}` : '已连接',
        };
      case 'connecting':
        return {
          color: 'warning' as const,
          icon: <SyncIcon fontSize="small" sx={{ animation: 'spin 1s linear infinite' }} />,
          label: '连接中',
          description: state.isReconnecting ? `重连尝试：${state.reconnectAttempts}` : '正在连接...',
        };
      case 'disconnected':
        return {
          color: 'default' as const,
          icon: <WifiOffIcon fontSize="small" />,
          label: '未连接',
          description: state.lastConnected ? `上次连接：${formatDateTime(state.lastConnected)}` : '未连接',
        };
      case 'error':
        return {
          color: 'error' as const,
          icon: <ErrorIcon fontSize="small" />,
          label: '连接错误',
          description: state.error || '连接出现错误',
        };
      default:
        return {
          color: 'default' as const,
          icon: <WifiOffIcon fontSize="small" />,
          label: '未知状态',
          description: '未知连接状态',
        };
    }
  };

  const statusInfo = getStatusInfo();

  const handleClick = () => {
    if (isConnected) {
      disconnect();
    } else if (state.status === 'disconnected' || state.status === 'error') {
      connect();
    }
  };

  const tooltipContent = (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
        WebSocket 连接状态
      </Typography>
      <Typography variant="caption" display="block">
        {statusInfo.description}
      </Typography>
      {state.error && (
        <Typography variant="caption" display="block" color="error.main">
          错误：{state.error}
        </Typography>
      )}
      <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.7 }}>
        点击切换连接状态
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow>
      <span>
        <IconButton
          onClick={handleClick}
          disabled={state.status === 'connecting'}
          sx={{ p: 0.5 }}
        >
          <Chip
            icon={statusInfo.icon}
            label={statusInfo.label}
            color={statusInfo.color}
            size="small"
            variant={isConnected ? 'filled' : 'outlined'}
            sx={{
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: statusInfo.color !== 'default' 
                  ? `${statusInfo.color}.light` 
                  : 'action.hover',
              },
            }}
          />
        </IconButton>
      </span>
    </Tooltip>
  );
}