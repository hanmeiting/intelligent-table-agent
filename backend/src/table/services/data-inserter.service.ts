import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class DataInserterService {
  private readonly logger = new Logger(DataInserterService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async insertSampleData(tableName: string, schema: any): Promise<any> {
    try {
      const businessFields = schema.businessFields || schema.fields || [];
      if (businessFields.length === 0) {
        return { success: true, message: '没有业务字段，跳过插入示例数据' };
      }

      for (const field of businessFields) {
        // 生成一个简单的唯一ID
        const id = Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        
        const sql = `INSERT INTO \`${tableName}\` (
    \`id\`, 
    \`create_time\`, 
    \`create_by\`, 
    \`create_dep_id\`, 
    \`tenant_id\`, 
    \`ent_id\`, 
    \`name\`, 
    \`field_name\`, 
    \`comment\`, 
    \`data_type\`, 
    \`length\`, 
    \`decimal_length\`, 
    \`control\`, 
    \`ext_json\`, 
    \`is_single\`, 
    \`app_code\`, 
    \`publish_status\`, 
    \`index_status\`, 
    \`type\`, 
    \`pk_id\`, 
    \`rel_field\`
) VALUES (
    ?, 
    NOW(), 
    '1435462951082610689', 
    '268467679', 
    '1', 
    '2015631607183122434', 
    ?, 
    ?, 
    ?, 
    ?, 
    ?, 
    ?, 
    ?, 
    ?, 
    ?, 
    'app_htcsyy20241202093052', 
    ?, 
    0, 
    ?, 
    ?, 
    ''
)`;

        const values = [
          id,
          field.name || '',
          field.fieldName || '',
          field.comment || '',
          field.dataType || 'varchar',
          field.length || null,
          field.decimalLength || null,
          field.control || 'rx-input',
          field.extJson || '',
          field.isSingle !== undefined ? field.isSingle : 1,
          field.publishStatus || 'DEPLOYED',
          field.type || 'VARCHAR',
          id
        ];

        this.logger.log(`Inserting field data into table ${tableName}: ${field.name}`);
        await this.databaseService.execute(sql, values);
      }
      
      return {
        success: true,
        message: `成功插入 ${businessFields.length} 条字段定义数据`
      };
    } catch (error) {
      this.logger.error(`Failed to insert sample data into ${tableName}`, error);
      throw new Error(`插入示例数据失败: ${error.message}`);
    }
  }
}
