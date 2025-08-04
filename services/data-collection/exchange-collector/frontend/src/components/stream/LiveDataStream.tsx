/**
 * 实时数据流展示页面
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  FormControlLabel,
  Alert,
  Tooltip,
  Button,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Clear as ClearIcon,
  GetApp as DownloadIcon,
  Speed as SpeedIcon,
  BugReport as DebugIcon,
} from '@mui/icons-material';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useSubscriptions } from '@/hooks/useApi';
import { formatDateTime, formatNumber } from '@/utils/format';
import { MockDataGenerator } from '@/utils/mockDataGenerator';

// 数据流消息类型
interface StreamMessage {
  id: string;
  timestamp: string;
  exchange: string;
  symbol: string;
  type: 'trade' | 'ticker' | 'kline' | 'depth';
  data: any;
  size?: number;
}

// 过滤选项
interface FilterOptions {
  exchange: string;
  symbol: string;
  dataType: string;
}

export default function LiveDataStream() {
  const { subscribe, isConnected } = useWebSocket();
  const { data: subscriptionsData } = useSubscriptions();
  
  // 状态管理
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [filter, setFilter] = useState<FilterOptions>({
    exchange: 'all',
    symbol: 'all',
    dataType: 'all'
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const [maxMessages, _setMaxMessages] = useState(100);
  const [messageCount, setMessageCount] = useState(0);
  const [startTime, setStartTime] = useState(new Date());
  const [useMockData, setUseMockData] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const mockGeneratorRef = useRef<MockDataGenerator | null>(null);

  // 获取可用的过滤选项
  const filterOptions = useMemo(() => {
    const exchanges = new Set<string>();
    const symbols = new Set<string>();
    const dataTypes = new Set<string>();
    
    subscriptionsData?.subscriptions?.forEach(sub => {
      exchanges.add(sub.exchange);
      symbols.add(sub.symbol);
      sub.dataTypes?.forEach(type => dataTypes.add(type));
    });
    
    return {
      exchanges: Array.from(exchanges),
      symbols: Array.from(symbols),
      dataTypes: Array.from(dataTypes)
    };
  }, [subscriptionsData]);

  // 过滤消息
  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      if (filter.exchange !== 'all' && msg.exchange !== filter.exchange) return false;
      if (filter.symbol !== 'all' && msg.symbol !== filter.symbol) return false;
      if (filter.dataType !== 'all' && msg.type !== filter.dataType) return false;
      return true;
    });
  }, [messages, filter]);

  // 统计信息
  const stats = useMemo(() => {
    const now = new Date();
    const duration = (now.getTime() - startTime.getTime()) / 1000;
    const messagesPerSecond = duration > 0 ? (messageCount / duration).toFixed(1) : '0.0';
    
    const typeCount = messages.reduce((acc, msg) => {
      acc[msg.type] = (acc[msg.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: messageCount,
      messagesPerSecond,
      duration: duration.toFixed(0),
      typeCount,
      filtered: filteredMessages.length
    };
  }, [messages, messageCount, startTime, filteredMessages.length]);

  // WebSocket消息处理
  useEffect(() => {
    if (!isStreaming) return;

    if (useMockData) {
      // 使用模拟数据
      if (!mockGeneratorRef.current) {
        mockGeneratorRef.current = new MockDataGenerator();
      }
      
      mockGeneratorRef.current.startGeneration((message) => {
        const streamMessage: StreamMessage = {
          id: `${message.timestamp}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: message.timestamp,
          exchange: message.exchange || 'mock',
          symbol: message.symbol || 'unknown',
          type: message.type as StreamMessage['type'],
          data: message.data,
          size: JSON.stringify(message.data).length
        };
        
        setMessages(prev => {
          const newMessages = [streamMessage, ...prev].slice(0, maxMessages);
          return newMessages;
        });
        
        setMessageCount(prev => prev + 1);
      }, 500); // 每500ms生成一条数据
      
      return () => {
        mockGeneratorRef.current?.stopGeneration();
      };
    } else {
      // 使用真实WebSocket数据
      if (!isConnected) return;

      const unsubscribe = subscribe((message) => {
        // 处理嵌套的消息格式：{type: 'trade', payload: {actual_data}}
        const actualMessage = message.payload || message;
        
        if (actualMessage.type === 'market_data' || 
            ['trade', 'ticker', 'kline', 'depth'].includes(actualMessage.type)) {
          
          // 验证必要字段
          if (!actualMessage.timestamp) {
            console.warn('Message missing timestamp:', actualMessage);
            return;
          }
          
          const streamMessage: StreamMessage = {
            id: `${actualMessage.timestamp}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: actualMessage.timestamp,
            exchange: actualMessage.exchange || 'unknown',
            symbol: actualMessage.symbol || 'unknown',
            type: actualMessage.type as StreamMessage['type'],
            data: {
              // 将后端顶层字段映射到data对象中，同时保留原始data
              ...(actualMessage.data || {}),
              // 添加顶层字段到data对象
              price: actualMessage.price,
              volume: actualMessage.volume, 
              side: actualMessage.side,
              change24h: actualMessage.change24h,
              // 保持兼容性，也添加常见的别名
              lastPrice: actualMessage.price,
              quantity: actualMessage.volume
            },
            size: JSON.stringify(actualMessage).length
          };
          
          setMessages(prev => {
            const newMessages = [streamMessage, ...prev].slice(0, maxMessages);
            return newMessages;
          });
          
          setMessageCount(prev => prev + 1);
        }
      });

      return unsubscribe;
    }
  }, [subscribe, isConnected, isStreaming, maxMessages, useMockData]);

  // 自动滚动
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredMessages, autoScroll]);

  // 控制函数
  const handleToggleStreaming = () => {
    setIsStreaming(!isStreaming);
  };

  const handleClearMessages = () => {
    setMessages([]);
    setMessageCount(0);
    setStartTime(new Date());
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify(filteredMessages, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `market_data_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 格式化数据显示
  const formatMessageData = (msg: StreamMessage) => {
    const { data, type } = msg;
    
    if (!data || typeof data !== 'object') {
      return 'N/A';
    }
    
    try {
      switch (type) {
        case 'trade':
          const tradePrice = data.price || data.p || 'N/A';
          const tradeVolume = data.volume || data.quantity || data.q || 'N/A';
          const tradeSide = data.side || (data.m ? 'sell' : 'buy') || 'N/A';
          return `价格: ${tradePrice}, 数量: ${tradeVolume}, 方向: ${tradeSide}`;
          
        case 'ticker':
          const tickerPrice = data.price || data.lastPrice || data.c || 'N/A';
          const change24h = data.change24h || data.P || data.priceChange24h || 'N/A';
          const high24h = data.high24h || data.h || 'N/A';
          const low24h = data.low24h || data.l || 'N/A';
          return `价格: ${tickerPrice}, 24h变化: ${change24h}%, 最高: ${high24h}, 最低: ${low24h}`;
          
        case 'kline':
          return `开: ${data.open || data.o || 'N/A'}, 高: ${data.high || data.h || 'N/A'}, 低: ${data.low || data.l || 'N/A'}, 收: ${data.close || data.c || 'N/A'}`;
          
        case 'depth':
          return `买盘: ${data.bids?.length || 0}, 卖盘: ${data.asks?.length || 0}`;
          
        default:
          // 对于未知类型，显示所有可用的重要字段
          const fields = [];
          if (data.price) fields.push(`价格: ${data.price}`);
          if (data.volume) fields.push(`数量: ${data.volume}`);
          if (data.side) fields.push(`方向: ${data.side}`);
          if (data.change24h) fields.push(`24h变化: ${data.change24h}%`);
          
          if (fields.length > 0) {
            return fields.join(', ');
          }
          
          // 如果没有找到标准字段，显示原始数据
          const dataStr = JSON.stringify(data);
          return dataStr.length > 100 ? dataStr.substring(0, 100) + '...' : dataStr;
      }
    } catch (error) {
      console.warn('Error formatting message data:', error, { msg, data });
      return 'Error formatting data';
    }
  };

  const getMessageTypeColor = (type: string) => {
    const colors = {
      trade: 'primary',
      ticker: 'success', 
      kline: 'warning',
      depth: 'info'
    } as const;
    return colors[type as keyof typeof colors] || 'default';
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        实时数据流监控
      </Typography>

      {/* 连接状态警告 */}
      {!isConnected && !useMockData && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          WebSocket未连接，无法接收实时数据。您可以开启"模拟数据"模式进行测试。
        </Alert>
      )}
      
      {useMockData && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <DebugIcon fontSize="small" />
            <span>正在使用模拟数据模式，显示的是随机生成的测试数据</span>
          </Box>
        </Alert>
      )}

      {/* 控制面板 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" flexWrap="wrap" gap={2} alignItems="center" sx={{ mb: 2 }}>
            {/* 流控制 */}
            <Button
              variant={isStreaming ? "contained" : "outlined"}
              startIcon={isStreaming ? <PauseIcon /> : <PlayIcon />}
              onClick={handleToggleStreaming}
              color={isStreaming ? "secondary" : "primary"}
            >
              {isStreaming ? '暂停' : '开始'}
            </Button>

            <Button
              variant="outlined"
              startIcon={<ClearIcon />}
              onClick={handleClearMessages}
            >
              清空
            </Button>

            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportData}
              disabled={filteredMessages.length === 0}
            >
              导出数据
            </Button>

            <FormControlLabel
              control={
                <Switch
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />
              }
              label="自动滚动"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={useMockData}
                  onChange={(e) => setUseMockData(e.target.checked)}
                  icon={<DebugIcon />}
                />
              }
              label="模拟数据"
            />
          </Box>

          {/* 过滤器 */}
          <Box display="flex" flexWrap="wrap" gap={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>交易所</InputLabel>
              <Select
                value={filter.exchange}
                label="交易所"
                onChange={(e) => setFilter(prev => ({ ...prev, exchange: e.target.value }))}
              >
                <MenuItem value="all">全部</MenuItem>
                {filterOptions.exchanges.map(exchange => (
                  <MenuItem key={exchange} value={exchange}>{exchange}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>交易对</InputLabel>
              <Select
                value={filter.symbol}
                label="交易对"
                onChange={(e) => setFilter(prev => ({ ...prev, symbol: e.target.value }))}
              >
                <MenuItem value="all">全部</MenuItem>
                {filterOptions.symbols.map(symbol => (
                  <MenuItem key={symbol} value={symbol}>{symbol}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>数据类型</InputLabel>
              <Select
                value={filter.dataType}
                label="数据类型"
                onChange={(e) => setFilter(prev => ({ ...prev, dataType: e.target.value }))}
              >
                <MenuItem value="all">全部</MenuItem>
                {filterOptions.dataTypes.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      {/* 统计面板 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" flexWrap="wrap" gap={3} alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <SpeedIcon color="primary" />
              <Typography variant="body2">
                <strong>{stats.messagesPerSecond}</strong> 消息/秒
              </Typography>
            </Box>
            
            <Typography variant="body2">
              总计: <strong>{formatNumber(stats.total)}</strong> 条消息
            </Typography>
            
            <Typography variant="body2">
              显示: <strong>{formatNumber(stats.filtered)}</strong> 条
            </Typography>
            
            <Typography variant="body2">
              运行时间: <strong>{stats.duration}</strong> 秒
            </Typography>

            {/* 消息类型统计 */}
            <Box display="flex" gap={1} flexWrap="wrap">
              {Object.entries(stats.typeCount).map(([type, count]) => (
                <Chip
                  key={type}
                  label={`${type}: ${count}`}
                  color={getMessageTypeColor(type)}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* 数据流表格 */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer 
            component={Paper} 
            ref={tableContainerRef}
            sx={{ maxHeight: 400, overflow: 'auto' }}
          >
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>时间</TableCell>
                  <TableCell>交易所</TableCell>
                  <TableCell>交易对</TableCell>
                  <TableCell>类型</TableCell>
                  <TableCell>数据</TableCell>
                  <TableCell align="right">大小</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredMessages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary">
                        {isStreaming ? '等待数据流...' : '数据流已暂停'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMessages.map((msg) => (
                    <TableRow key={msg.id} hover>
                      <TableCell>
                        <Typography variant="caption" component="div">
                          {formatDateTime(new Date(msg.timestamp))}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={msg.exchange} size="small" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {msg.symbol}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={msg.type} 
                          color={getMessageTypeColor(msg.type)}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip title={JSON.stringify(msg.data, null, 2)}>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                            {formatMessageData(msg)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption" color="text.secondary">
                          {msg.size ? `${msg.size}B` : '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <div ref={messagesEndRef} />
        </CardContent>
      </Card>
    </Box>
  );
}