import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class TableExecutorService {
  private readonly logger = new Logger(TableExecutorService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async createTable(schema: any): Promise<any> {
    try {
      const { tableName, description } = schema;
      
      const sql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (
  \`id\` VARCHAR(64) NOT NULL COMMENT '主键ID',
  \`create_time\` DATETIME DEFAULT NULL COMMENT '创建时间',
  \`create_by\` VARCHAR(64) DEFAULT NULL COMMENT '创建人ID',
  \`create_dep_id\` VARCHAR(64) DEFAULT NULL COMMENT '创建部门ID',
  \`update_time\` DATETIME DEFAULT NULL COMMENT '更新时间',
  \`update_by\` VARCHAR(64) DEFAULT NULL COMMENT '更新人ID',
  \`tenant_id\` VARCHAR(32) DEFAULT '1' COMMENT '租户ID',
  \`ent_id\` VARCHAR(64) DEFAULT NULL COMMENT '企业/实体ID',
  \`name\` VARCHAR(64) NOT NULL COMMENT '字段编码 (如: name, LongText_...)',
  \`field_name\` VARCHAR(128) NOT NULL COMMENT '字段名称 (如: F_LONGTEXT_...)',
  \`comment\` VARCHAR(255) DEFAULT NULL COMMENT '字段中文名称/备注',
  \`data_type\` VARCHAR(32) DEFAULT NULL COMMENT '数据类型 (clob, varchar, number, date)',
  \`length\` INT DEFAULT NULL COMMENT '字段长度',
  \`decimal_length\` INT DEFAULT NULL COMMENT '小数位数',
  \`control\` VARCHAR(64) DEFAULT NULL COMMENT '控件类型 (如: rx-textarea)',
  \`ext_json\` TEXT DEFAULT NULL COMMENT '扩展配置JSON',
  \`is_single\` TINYINT DEFAULT 1 COMMENT '是否单值 (1:是, 0:否)',
  \`sn\` INT DEFAULT NULL COMMENT '排序号',
  \`app_code\` VARCHAR(64) DEFAULT NULL COMMENT '应用编码',
  \`comment_i18n\` TEXT DEFAULT NULL COMMENT '国际化备注JSON',
  \`publish_status\` VARCHAR(32) DEFAULT 'DRAFT' COMMENT '发布状态 (DEPLOYED, DRAFT)',
  \`index_status\` TINYINT DEFAULT 0 COMMENT '索引状态 (0:无, 1:有)',
  \`index_name\` VARCHAR(64) DEFAULT NULL COMMENT '索引名称',
  \`form_json\` TEXT DEFAULT NULL COMMENT '表单配置JSON',
  \`data_json\` TEXT DEFAULT NULL COMMENT '数据配置JSON',
  \`format\` VARCHAR(64) DEFAULT NULL COMMENT '格式化规则',
  \`orign_attr\` VARCHAR(64) DEFAULT NULL COMMENT '原始属性',
  \`type\` VARCHAR(32) DEFAULT NULL COMMENT '类型标识 (如: upd)',
  \`ext_json_obj\` TEXT DEFAULT NULL COMMENT '扩展JSON对象(冗余或备用)',
  \`bo_def_id\` VARCHAR(64) DEFAULT NULL COMMENT '业务对象定义ID',
  \`childrens\` TEXT DEFAULT NULL COMMENT '子字段JSON (若存在层级)',
  \`pk_id\` VARCHAR(64) DEFAULT NULL COMMENT '同ID',
  \`rel_field\` VARCHAR(255) DEFAULT NULL COMMENT '关联字段',
  
  PRIMARY KEY (\`id\`),
  KEY \`idx_app_code\` (\`app_code\`),
  KEY \`idx_ent_id\` (\`ent_id\`),
  KEY \`idx_publish_status\` (\`publish_status\`),
  KEY \`idx_name\` (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='${description || ''}';`;

      this.logger.log(`Executing SQL to create table: \n${sql}`);
      await this.databaseService.execute(sql);
      
      // 保存模型元数据到 system_models 表
      await this.saveModelMetadata(schema);
      
      return {
        success: true,
        tableName,
        message: `表 ${tableName} 创建成功`
      };
    } catch (error) {
      this.logger.error('Failed to create table', error);
      throw new Error(`创建表失败: ${error.message}`);
    }
  }

  private async saveModelMetadata(schema: any) {
    try {
      // 确保 system_models 表存在
      const initSystemModelsSql = `
        CREATE TABLE IF NOT EXISTS \`system_models\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`name\` VARCHAR(255) NOT NULL COMMENT '中文名',
          \`tableName\` VARCHAR(255) NOT NULL UNIQUE COMMENT '数据库物理表名',
          \`description\` VARCHAR(1024) COMMENT '描述',
          \`fields\` JSON COMMENT '业务字段结构配置',
          \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `;
      await this.databaseService.execute(initSystemModelsSql);

      // 插入或更新模型记录
      const insertSql = `
        INSERT INTO \`system_models\` (\`name\`, \`tableName\`, \`description\`, \`fields\`)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          \`name\` = VALUES(\`name\`),
          \`description\` = VALUES(\`description\`),
          \`fields\` = VALUES(\`fields\`)
      `;
      
      const values = [
        schema.displayName,
        schema.tableName,
        schema.description,
        JSON.stringify(schema.fields || [])
      ];

      await this.databaseService.execute(insertSql, values);
      this.logger.log(`Model metadata for ${schema.tableName} saved successfully.`);
    } catch (error) {
      this.logger.error('Failed to save model metadata', error);
      // 即使元数据保存失败，不阻塞建表主流程（视业务容忍度而定）
    }
  }
}
