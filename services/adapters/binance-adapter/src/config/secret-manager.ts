/**
 * Google Secret Manager 集成
 * 
 * 提供安全的 API 凭据管理功能，支持：
 * - 从 Secret Manager 加载凭据
 * - 凭据缓存和刷新
 * - 本地开发环境支持
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { BinanceCredentials, ConfigurationError } from './index';

/**
 * Secret Manager 客户端实例（单例）
 */
let secretManagerClient: SecretManagerServiceClient | null = null;

/**
 * 凭据缓存
 */
interface CachedCredentials {
  credentials: BinanceCredentials;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

const credentialsCache = new Map<string, CachedCredentials>();

/**
 * 获取 Secret Manager 客户端
 */
function getSecretManagerClient(): SecretManagerServiceClient {
  if (!secretManagerClient) {
    secretManagerClient = new SecretManagerServiceClient();
  }
  return secretManagerClient;
}

/**
 * 从 Secret Manager 加载 secret
 */
async function getSecret(projectId: string, secretName: string, version = 'latest'): Promise<string> {
  try {
    const client = getSecretManagerClient();
    const name = `projects/${projectId}/secrets/${secretName}/versions/${version}`;
    
    const [response] = await client.accessSecretVersion({ name });
    
    if (!response.payload?.data) {
      throw new Error('Secret payload is empty');
    }
    
    return response.payload.data.toString();
  } catch (error) {
    throw new ConfigurationError(
      `Failed to load secret from Secret Manager: ${secretName}`,
      error as Error,
      { projectId, secretName, version }
    );
  }
}

/**
 * 从缓存获取凭据
 */
function getCachedCredentials(cacheKey: string): BinanceCredentials | null {
  const cached = credentialsCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  
  const now = Date.now();
  if (now - cached.timestamp > cached.ttl) {
    // 缓存过期
    credentialsCache.delete(cacheKey);
    return null;
  }
  
  return cached.credentials;
}

/**
 * 缓存凭据
 */
function setCachedCredentials(cacheKey: string, credentials: BinanceCredentials, ttl = 3600000): void {
  credentialsCache.set(cacheKey, {
    credentials,
    timestamp: Date.now(),
    ttl
  });
}

/**
 * 从 Secret Manager 加载 Binance 凭据
 */
export async function loadCredentialsFromSecretManager(
  projectId: string,
  secretName: string,
  useCache = true,
  cacheTtl = 3600000 // 1 hour
): Promise<BinanceCredentials> {
  const cacheKey = `${projectId}:${secretName}`;
  
  // 尝试从缓存获取
  if (useCache) {
    const cached = getCachedCredentials(cacheKey);
    if (cached) {
      return cached;
    }
  }
  
  try {
    // 从 Secret Manager 加载
    const secretValue = await getSecret(projectId, secretName);
    
    // 解析 JSON 格式的凭据
    let parsedCredentials: any;
    try {
      parsedCredentials = JSON.parse(secretValue);
    } catch (error) {
      throw new ConfigurationError(
        `Secret value is not valid JSON: ${secretName}`,
        error as Error,
        { projectId, secretName }
      );
    }
    
    // 验证凭据格式
    const credentials: BinanceCredentials = {
      apiKey: parsedCredentials.apiKey,
      apiSecret: parsedCredentials.apiSecret,
      useSecretManager: true,
      secretName
    };
    
    if (!credentials.apiKey || !credentials.apiSecret) {
      throw new ConfigurationError(
        `Secret must contain both apiKey and apiSecret: ${secretName}`,
        undefined,
        { projectId, secretName, hasApiKey: !!credentials.apiKey, hasApiSecret: !!credentials.apiSecret }
      );
    }
    
    // 缓存凭据
    if (useCache) {
      setCachedCredentials(cacheKey, credentials, cacheTtl);
    }
    
    return credentials;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    
    throw new ConfigurationError(
      `Failed to load credentials from Secret Manager: ${secretName}`,
      error as Error,
      { projectId, secretName }
    );
  }
}

/**
 * 检查 Secret Manager 是否可用
 */
export async function checkSecretManagerAvailable(projectId: string): Promise<boolean> {
  try {
    const client = getSecretManagerClient();
    const parent = `projects/${projectId}`;
    
    // 尝试列出 secrets（只获取第1个）
    await client.listSecrets({
      parent,
      pageSize: 1
    });
    
    return true;
  } catch (error) {
    console.warn('Secret Manager not available:', error);
    return false;
  }
}

/**
 * 创建或更新 secret
 */
export async function createOrUpdateSecret(
  projectId: string,
  secretName: string,
  credentials: { apiKey: string; apiSecret: string }
): Promise<void> {
  try {
    const client = getSecretManagerClient();
    const parent = `projects/${projectId}`;
    const secretId = secretName;
    
    // 检查 secret 是否存在
    let secretExists = false;
    try {
      await client.getSecret({ name: `${parent}/secrets/${secretId}` });
      secretExists = true;
    } catch (error) {
      // Secret 不存在，需要创建
    }
    
    // 创建 secret（如果不存在）
    if (!secretExists) {
      await client.createSecret({
        parent,
        secretId,
        secret: {
          replication: {
            automatic: {}
          }
        }
      });
    }
    
    // 添加 secret 版本
    const payload = JSON.stringify(credentials);
    await client.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: {
        data: Buffer.from(payload, 'utf8')
      }
    });
    
    // 清除缓存
    const cacheKey = `${projectId}:${secretName}`;
    credentialsCache.delete(cacheKey);
    
  } catch (error) {
    throw new ConfigurationError(
      `Failed to create/update secret: ${secretName}`,
      error as Error,
      { projectId, secretName }
    );
  }
}

/**
 * 删除 secret 
 */
export async function deleteSecret(projectId: string, secretName: string): Promise<void> {
  try {
    const client = getSecretManagerClient();
    const name = `projects/${projectId}/secrets/${secretName}`;
    
    await client.deleteSecret({ name });
    
    // 清除缓存
    const cacheKey = `${projectId}:${secretName}`;
    credentialsCache.delete(cacheKey);
    
  } catch (error) {
    throw new ConfigurationError(
      `Failed to delete secret: ${secretName}`,
      error as Error,
      { projectId, secretName }
    );
  }
}

/**
 * 获取所有 Binance 相关的 secrets
 */
export async function listBinanceSecrets(projectId: string): Promise<string[]> {
  try {
    const client = getSecretManagerClient();
    const parent = `projects/${projectId}`;
    
    const [secrets] = await client.listSecrets({
      parent,
      filter: 'name:binance'
    });
    
    return secrets.map(secret => {
      const name = secret.name || '';
      return name.split('/').pop() || '';
    }).filter(name => name.length > 0);
    
  } catch (error) {
    throw new ConfigurationError(
      'Failed to list Binance secrets',
      error as Error,
      { projectId }
    );
  }
}

/**
 * 清除凭据缓存
 */
export function clearCredentialsCache(secretName?: string): void {
  if (secretName) {
    // 清除特定 secret 的缓存
    for (const [key] of credentialsCache) {
      if (key.endsWith(`:${secretName}`)) {
        credentialsCache.delete(key);
      }
    }
  } else {
    // 清除所有缓存
    credentialsCache.clear();
  }
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): {
  total: number;
  active: number;
  expired: number;
} {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  
  for (const [, cached] of credentialsCache) {
    if (now - cached.timestamp > cached.ttl) {
      expired++;
    } else {
      active++;
    }
  }
  
  return {
    total: credentialsCache.size,
    active,
    expired
  };
}

/**
 * 清理过期缓存
 */
export function cleanupExpiredCache(): number {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, cached] of credentialsCache) {
    if (now - cached.timestamp > cached.ttl) {
      credentialsCache.delete(key);
      cleanedCount++;
    }
  }
  
  return cleanedCount;
}