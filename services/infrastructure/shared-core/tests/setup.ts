/**
 * Shared Core测试设置 - 使用@pixiu/test-utils统一配置
 */

import { setupTests, SETUP_CONFIGS } from '@pixiu/test-utils';

// 使用统一测试设置，包含PubSub Mock、控制台过滤和环境变量配置
setupTests(SETUP_CONFIGS.BASIC);