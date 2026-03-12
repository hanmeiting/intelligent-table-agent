import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: mysql.Pool;
  private readonly logger = new Logger(DatabaseService.name);

  async onModuleInit() {
    this.logger.log('Initializing database connection pool...');
    
    // 解析 databaseConfig.js
    const configPath = path.join(process.cwd(), 'databaseConfig.js');
    let dbConfig = {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'intelligent_form_modal',
      charset: 'utf8mb4'
    };

    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        
        // 使用正则提取配置
        const getVal = (key: string) => {
          const match = content.match(new RegExp(`${key}\\s*=\\s*['"](.*?)['"]|${key}\\s*=\\s*(\\d+)`));
          if (match) {
            return match[1] || match[2];
          }
          return null;
        };

        const host = getVal('DB_HOST');
        const port = getVal('DB_PORT');
        const user = getVal('DB_USER');
        const password = getVal('DB_PASSWORD');
        const database = getVal('DB_NAME');
        const charset = getVal('DB_CHARSET');

        if (host) dbConfig.host = host;
        if (port) dbConfig.port = parseInt(port, 10);
        if (user) dbConfig.user = user;
        if (password !== null) dbConfig.password = password; // allow empty password
        if (database) dbConfig.database = database;
        if (charset) dbConfig.charset = charset;
      }
    } catch (e) {
      this.logger.error('Failed to read databaseConfig.js', e);
    }

    try {
      this.pool = mysql.createPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        charset: dbConfig.charset,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      // 测试连接并尝试创建数据库（如果不存在）
      const connection = await this.pool.getConnection();
      this.logger.log(`Successfully connected to MySQL database: ${dbConfig.database}`);
      connection.release();
    } catch (error) {
      this.logger.error('Failed to connect to MySQL database', error);
      // 注意：如果数据库不存在，我们可能需要先连接到默认库来创建它
      if (error.code === 'ER_BAD_DB_ERROR') {
        await this.createDatabaseIfNotExists(dbConfig);
      }
    }
  }

  private async createDatabaseIfNotExists(config: any) {
    this.logger.log(`Database ${config.database} does not exist, attempting to create...`);
    try {
      const tempPool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
      });
      
      await tempPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` DEFAULT CHARACTER SET ${config.charset}`);
      await tempPool.end();
      this.logger.log(`Successfully created database: ${config.database}`);
      
      // 重新创建使用指定库的连接池
      this.pool = mysql.createPool({
        ...config,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
    } catch (e) {
      this.logger.error(`Failed to create database: ${config.database}`, e);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('Database connection pool closed.');
    }
  }

  // 执行 SQL 查询
  async query<T = any>(sql: string, params?: any[]): Promise<T> {
    const [rows] = await this.pool.query(sql, params);
    return rows as T;
  }

  // 执行 SQL 操作 (Insert/Update/Delete)
  async execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
    const [result] = await this.pool.execute(sql, params);
    return result as mysql.ResultSetHeader;
  }
}
