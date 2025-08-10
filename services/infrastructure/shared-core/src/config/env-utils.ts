/**
 * 环境变量处理工具
 * 统一的环境变量解析和验证逻辑
 */

import { ENV_MAPPINGS, CONFIG_PATHS, type EnvMapping } from './config-constants';

/**
 * 环境变量值类型
 */
export type EnvValueType = 'string' | 'number' | 'boolean' | 'json';

/**
 * 解析后的环境变量
 */
export interface ParsedEnvVar {
  key: string;
  value: any;
  type: EnvValueType;
  raw: string;
}

/**
 * 环境变量处理器
 */
export class EnvironmentProcessor {
  /**
   * 解析环境变量值
   */
  static parseValue(value: string, type: EnvValueType): any {
    try {
      switch (type) {
        case 'number':
          const num = Number(value);
          if (isNaN(num)) {
            throw new Error(`Invalid number: ${value}`);
          }
          return num;
          
        case 'boolean':
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1' || lower === 'yes') return true;
          if (lower === 'false' || lower === '0' || lower === 'no') return false;
          throw new Error(`Invalid boolean: ${value}`);
          
        case 'json':
          return JSON.parse(value);
          
        case 'string':
        default:
          return value;
      }
    } catch (error) {
      throw new Error(`Failed to parse environment variable value "${value}" as ${type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从环境变量构建配置对象
   */
  static buildConfigFromEnv(): any {
    const config: any = {};
    
    ENV_MAPPINGS.forEach(mapping => {
      const value = process.env[mapping.env];
      if (value !== undefined) {
        try {
          const parsedValue = this.parseValue(value, mapping.type);
          CONFIG_PATHS.setValue(config, mapping.path, parsedValue);
        } catch (error) {
          console.warn(`Failed to process environment variable ${mapping.env}:`, error);
        }
      }
    });
    
    return config;
  }

  /**
   * 获取解析后的环境变量列表
   */
  static getParsedEnvVars(): ParsedEnvVar[] {
    const parsed: ParsedEnvVar[] = [];
    
    ENV_MAPPINGS.forEach(mapping => {
      const raw = process.env[mapping.env];
      if (raw !== undefined) {
        try {
          const value = this.parseValue(raw, mapping.type);
          parsed.push({
            key: mapping.env,
            value,
            type: mapping.type,
            raw,
          });
        } catch (error) {
          console.warn(`Failed to parse environment variable ${mapping.env}:`, error);
        }
      }
    });
    
    return parsed;
  }

  /**
   * 验证必需的环境变量
   */
  static validateRequiredEnvVars(required: string[]): string[] {
    const missing: string[] = [];
    
    required.forEach(envVar => {
      if (process.env[envVar] === undefined) {
        missing.push(envVar);
      }
    });
    
    return missing;
  }

  /**
   * 检查环境变量冲突（如端口冲突）
   */
  static checkEnvConflicts(): string[] {
    const conflicts: string[] = [];
    const ports: Map<number, string[]> = new Map();
    
    // 收集所有端口配置
    const portMappings = ENV_MAPPINGS.filter(m => 
      m.path.includes('port') && m.type === 'number'
    );
    
    portMappings.forEach(mapping => {
      const value = process.env[mapping.env];
      if (value !== undefined) {
        try {
          const port = this.parseValue(value, mapping.type);
          if (!ports.has(port)) {
            ports.set(port, []);
          }
          ports.get(port)!.push(mapping.env);
        } catch (error) {
          // 忽略解析错误，由其他验证处理
        }
      }
    });
    
    // 检查端口冲突
    ports.forEach((envVars, port) => {
      if (envVars.length > 1) {
        conflicts.push(`Port ${port} is used by multiple services: ${envVars.join(', ')}`);
      }
    });
    
    return conflicts;
  }

  /**
   * 生成环境变量示例配置
   */
  static generateEnvExample(): string {
    const lines: string[] = [
      '# Pixiu Trading System Environment Configuration',
      '# Copy this file to .env and customize the values',
      '',
    ];
    
    // 按类别分组环境变量
    const categories: Record<string, EnvMapping[]> = {
      'Service Configuration': [],
      'Database Configuration': [],
      'Logging Configuration': [],
      'Monitoring Configuration': [],
      'Pub/Sub Configuration': [],
      'WebSocket Configuration': [],
    };
    
    ENV_MAPPINGS.forEach(mapping => {
      if (mapping.path.startsWith('service.')) {
        categories['Service Configuration'].push(mapping);
      } else if (mapping.path.startsWith('logging.')) {
        categories['Logging Configuration'].push(mapping);
      } else if (mapping.path.startsWith('monitoring.')) {
        categories['Monitoring Configuration'].push(mapping);
      } else if (mapping.path.startsWith('pubsub.')) {
        categories['Pub/Sub Configuration'].push(mapping);
      } else if (mapping.path.startsWith('websocket.')) {
        categories['WebSocket Configuration'].push(mapping);
      } else {
        categories['Service Configuration'].push(mapping);
      }
    });
    
    Object.entries(categories).forEach(([category, mappings]) => {
      if (mappings.length > 0) {
        lines.push(`# ${category}`);
        mappings.forEach(mapping => {
          const example = this.getExampleValue(mapping);
          lines.push(`${mapping.env}=${example}`);
        });
        lines.push('');
      }
    });
    
    return lines.join('\n');
  }

  /**
   * 获取环境变量的示例值
   */
  private static getExampleValue(mapping: EnvMapping): string {
    switch (mapping.type) {
      case 'number':
        if (mapping.path.includes('port')) {
          return mapping.path.includes('metrics') ? '9090' : '8080';
        }
        return '1000';
        
      case 'boolean':
        return 'true';
        
      case 'string':
        if (mapping.env === 'LOG_LEVEL') return 'info';
        if (mapping.env === 'LOG_FORMAT') return 'json';
        if (mapping.env === 'NODE_ENV') return 'development';
        if (mapping.env === 'HOST') return '0.0.0.0';
        if (mapping.env === 'PUBSUB_PROJECT_ID') return 'your-project-id';
        if (mapping.env === 'PUBSUB_EMULATOR_HOST') return 'localhost:8085';
        return 'example-value';
        
      default:
        return 'null';
    }
  }
}

/**
 * 环境变量中间件工厂
 */
export function createEnvMiddleware() {
  return {
    /**
     * 加载并验证环境变量
     */
    loadAndValidate(required: string[] = []): any {
      // 检查必需的环境变量
      const missing = EnvironmentProcessor.validateRequiredEnvVars(required);
      if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
      }
      
      // 检查冲突
      const conflicts = EnvironmentProcessor.checkEnvConflicts();
      if (conflicts.length > 0) {
        throw new Error(`Environment variable conflicts detected:\n${conflicts.join('\n')}`);
      }
      
      // 构建配置
      return EnvironmentProcessor.buildConfigFromEnv();
    },
    
    /**
     * 获取诊断信息
     */
    getDiagnostics() {
      const parsed = EnvironmentProcessor.getParsedEnvVars();
      const conflicts = EnvironmentProcessor.checkEnvConflicts();
      
      return {
        parsedVariables: parsed,
        conflicts,
        totalVariables: parsed.length,
        hasConflicts: conflicts.length > 0,
      };
    },
    
    /**
     * 生成环境变量文档
     */
    generateDocumentation() {
      return EnvironmentProcessor.generateEnvExample();
    },
  };
}