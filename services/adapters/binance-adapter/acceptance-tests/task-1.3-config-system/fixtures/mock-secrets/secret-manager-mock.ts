/**
 * Mock Secret Manager 实现
 * 用于测试 Secret Manager 集成功能
 */

export interface MockSecret {
  name: string;
  value: string;
  versions: { [version: string]: string };
}

/**
 * Mock Secret Manager 数据存储
 */
class MockSecretStorage {
  private secrets = new Map<string, MockSecret>();
  private projectId = 'test-project';

  constructor() {
    // 预设一些测试数据
    this.addSecret('binance-test-credentials', {
      apiKey: 'test-api-key-12345678901234567890',
      apiSecret: 'test-api-secret-12345678901234567890abcdef'
    });

    this.addSecret('binance-prod-credentials', {
      apiKey: 'prod-api-key-abcdefghijklmnopqrstuvwxyz',
      apiSecret: 'prod-api-secret-zyxwvutsrqponmlkjihgfedcba123456'
    });

    this.addSecret('invalid-json-secret', 'not-valid-json-content');
    
    this.addSecret('incomplete-credentials', {
      apiKey: 'only-api-key-present'
      // 缺少 apiSecret
    });
  }

  addSecret(name: string, value: any): void {
    const secretValue = typeof value === 'string' ? value : JSON.stringify(value);
    this.secrets.set(name, {
      name,
      value: secretValue,
      versions: {
        'latest': secretValue,
        '1': secretValue
      }
    });
  }

  getSecret(name: string, version = 'latest'): MockSecret | null {
    const secret = this.secrets.get(name);
    if (!secret) return null;

    if (version in secret.versions) {
      return {
        ...secret,
        value: secret.versions[version]
      };
    }
    return null;
  }

  listSecrets(filter?: string): MockSecret[] {
    const secretList = Array.from(this.secrets.values());
    if (!filter) return secretList;

    // 简单的过滤逻辑
    if (filter.startsWith('name:')) {
      const nameFilter = filter.substring(5);
      return secretList.filter(secret => secret.name.includes(nameFilter));
    }
    
    return secretList;
  }

  deleteSecret(name: string): boolean {
    return this.secrets.delete(name);
  }

  clear(): void {
    this.secrets.clear();
  }

  getProjectId(): string {
    return this.projectId;
  }

  setProjectId(projectId: string): void {
    this.projectId = projectId;
  }
}

// 全局 mock 实例
export const mockSecretStorage = new MockSecretStorage();

/**
 * Mock SecretManagerServiceClient
 */
export class MockSecretManagerServiceClient {
  async accessSecretVersion(request: { name: string }): Promise<[{ payload?: { data?: Buffer } }]> {
    // 解析 secret 名称: projects/{projectId}/secrets/{secretId}/versions/{version}
    const nameParts = request.name.split('/');
    if (nameParts.length < 6) {
      throw new Error('Invalid secret name format');
    }

    const projectId = nameParts[1];
    const secretName = nameParts[3];
    const version = nameParts[5];

    // 模拟项目 ID 检查
    if (projectId !== mockSecretStorage.getProjectId()) {
      const error = new Error('Project not found or access denied') as any;
      error.code = 404;
      throw error;
    }

    const secret = mockSecretStorage.getSecret(secretName, version);
    if (!secret) {
      const error = new Error('Secret not found') as any;
      error.code = 404;
      throw error;
    }

    return [{
      payload: {
        data: Buffer.from(secret.value, 'utf8')
      }
    }];
  }

  async listSecrets(request: { parent: string; filter?: string; pageSize?: number }): Promise<[any[]]> {
    // 解析父路径: projects/{projectId}
    const parentParts = request.parent.split('/');
    if (parentParts.length < 2) {
      throw new Error('Invalid parent format');
    }

    const projectId = parentParts[1];
    if (projectId !== mockSecretStorage.getProjectId()) {
      const error = new Error('Project not found or access denied') as any;
      error.code = 404;
      throw error;
    }

    const secrets = mockSecretStorage.listSecrets(request.filter);
    const pageSize = request.pageSize || secrets.length;
    
    const result = secrets.slice(0, pageSize).map(secret => ({
      name: `projects/${projectId}/secrets/${secret.name}`
    }));

    return [result];
  }

  async getSecret(request: { name: string }): Promise<any> {
    // 解析 secret 名称: projects/{projectId}/secrets/{secretId}
    const nameParts = request.name.split('/');
    if (nameParts.length < 4) {
      throw new Error('Invalid secret name format');
    }

    const projectId = nameParts[1];
    const secretName = nameParts[3];

    if (projectId !== mockSecretStorage.getProjectId()) {
      const error = new Error('Project not found or access denied') as any;
      error.code = 404;
      throw error;
    }

    const secret = mockSecretStorage.getSecret(secretName);
    if (!secret) {
      const error = new Error('Secret not found') as any;
      error.code = 404;
      throw error;
    }

    return secret;
  }

  async createSecret(request: any): Promise<any> {
    const parentParts = request.parent.split('/');
    const projectId = parentParts[1];
    
    if (projectId !== mockSecretStorage.getProjectId()) {
      const error = new Error('Project not found or access denied') as any;
      error.code = 404;
      throw error;
    }

    // 检查 secret 是否已存在
    if (mockSecretStorage.getSecret(request.secretId)) {
      const error = new Error('Secret already exists') as any;
      error.code = 409;
      throw error;
    }

    mockSecretStorage.addSecret(request.secretId, '');
    return { name: `projects/${projectId}/secrets/${request.secretId}` };
  }

  async addSecretVersion(request: { parent: string; payload: { data: Buffer } }): Promise<any> {
    const parentParts = request.parent.split('/');
    const secretName = parentParts[3];
    
    const value = request.payload.data.toString('utf8');
    mockSecretStorage.addSecret(secretName, value);
    
    return { name: `${request.parent}/versions/1` };
  }

  async deleteSecret(request: { name: string }): Promise<void> {
    const nameParts = request.name.split('/');
    const secretName = nameParts[3];
    
    if (!mockSecretStorage.deleteSecret(secretName)) {
      const error = new Error('Secret not found') as any;
      error.code = 404;
      throw error;
    }
  }
}

/**
 * Mock 错误场景的工具函数
 */
export const MockScenarios = {
  /**
   * 模拟网络错误
   */
  networkError(): Error {
    const error = new Error('Network error') as any;
    error.code = 'ENOTFOUND';
    return error;
  },

  /**
   * 模拟权限错误
   */
  permissionError(): Error {
    const error = new Error('Permission denied') as any;
    error.code = 403;
    return error;
  },

  /**
   * 模拟服务不可用
   */
  serviceUnavailable(): Error {
    const error = new Error('Service unavailable') as any;
    error.code = 503;
    return error;
  },

  /**
   * 重置 mock 数据
   */
  reset(): void {
    mockSecretStorage.clear();
    // 重新添加默认测试数据
    mockSecretStorage.addSecret('binance-test-credentials', {
      apiKey: 'test-api-key-12345678901234567890',
      apiSecret: 'test-api-secret-12345678901234567890abcdef'
    });
  }
};