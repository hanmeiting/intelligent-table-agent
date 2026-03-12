import { Controller, Post, Body, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { TableGeneratorService } from './services/table-generator.service';
import { TableExecutorService } from './services/table-executor.service';
import { DataInserterService } from './services/data-inserter.service';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
@Controller('api/table')
export class TableController {
  constructor(
    private readonly tableGeneratorService: TableGeneratorService,
    private readonly tableExecutorService: TableExecutorService,
    private readonly dataInserterService: DataInserterService,
    private readonly databaseService: DatabaseService
  ) {}

  @Post('generate')
  async generateTableSchema(@Body() body: { description: string }) {
    if (!body.description) {
      throw new HttpException('Description is required', HttpStatus.BAD_REQUEST);
    }
    
    try {
      const schema = await this.tableGeneratorService.generateTableSchema(body.description);
      return { success: true, data: schema };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('create')
  async createTable(@Body() schema: any) {
    if (!schema || !schema.tableName || !schema.fields) {
      throw new HttpException('Invalid schema provided', HttpStatus.BAD_REQUEST);
    }

    try {
      // 1. 创建表
      const createResult = await this.tableExecutorService.createTable(schema);
      
      // 2. 插入示例数据
      let insertResult: any = null;
      if (schema.insertSampleData !== false) {
        insertResult = await this.dataInserterService.insertSampleData(schema.tableName, schema);
      }

      return {
        success: true,
        data: {
          tableName: schema.tableName,
          created: true,
          createMessage: createResult.message,
          sampleDataInserted: !!insertResult,
          insertMessage: insertResult?.message
        }
      };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('detail/:tableName')
  async getTableDetails(@Param('tableName') tableName: string) {
    try {
       const infoSql = 'SELECT * FROM `system_models` WHERE tableName = ? ';
      const tableInfo = await this.databaseService.query(infoSql, [tableName]);
      const tableDetailSql = `SELECT * FROM \`${tableName}\` ORDER BY create_time DESC `;
      const fields = await this.databaseService.query(tableDetailSql);
      fields.forEach((field) => {
        field.saved = true
      });
      tableInfo[0].fields = fields;
      return { success: true, data: tableInfo[0] };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  @Get('preview/:tableName')
  async previewTableData(@Param('tableName') tableName: string) {
    try {
      const sql = `SELECT * FROM \`${tableName}\``;
      const data = await this.databaseService.query(sql);
      return { success: true, data };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('save/:tableName')
  async saveTableData(@Param('tableName') tableName: string, @Body() body: { data: any[] }) {
    console.log('Received save request for table:', tableName);
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    if (!body.data || !Array.isArray(body.data) || body.data.length === 0) {
      throw new HttpException('No data provided for saving', HttpStatus.BAD_REQUEST);
    }

    try {
      // 获取表结构，确定哪些字段需要插入
      const columns = await this.databaseService.query(`SHOW FULL COLUMNS FROM \`${tableName}\``);
      
      // 过滤掉自增ID字段
      const insertableColumns = columns
        .filter((col: any) => col.Extra !== 'auto_increment')
        .map((col: any) => col.Field);


      const savedIds: number[] = [];
      const errors: string[] = [];

      for (const row of body.data) {
       try {
         // 跳过已保存的数据（有 saved 标记的数据）
         if (row.saved) {
           continue;
         }


         // 过滤掉 key 为 "undefined" 或其他无效的字段
         const cleanRow = Object.keys(row).reduce((acc, key) => {
           if (key !== 'undefined' && key !== 'null' && key.trim() !== '') {
             acc[key] = row[key];
           }
           return acc;
         }, {} as Record<string, any>);


         // 系统字段列表
         const systemFields = [
           'create_time',
           'update_time',
           'create_by',
           'update_by',
           'tenant_id',
           'ent_id',
           'id'
         ];

         // 为系统字段生成默认值
         const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
         const userId = 'USR_789012'; // 这应该从认证上下文获取，目前使用默认值
         const tenantId = 'TEN_001'; // 这应该从认证上下文获取，目前使用默认值
         const entId = 'ENT_112233'; // 这应该从认证上下文获取，目前使用默认值

         // 为系统字段设置默认值（如果前端未提供）
         systemFields.forEach(field => {
           if (field === 'create_time') {
             if (cleanRow[field] === undefined) {
               cleanRow[field] = now;
             }
           } else if (field === 'update_time') {
             // update_time 总是设置为当前时间
             cleanRow[field] = now;
           } else if (field === 'create_by') {
             if (cleanRow[field] === undefined) {
               cleanRow[field] = userId;
             }
           } else if (field === 'update_by') {
             // update_by 与 create_by 保持一致，除非前端明确提供
             if (cleanRow[field] === undefined) {
               cleanRow[field] = userId;
             }
           } else if (field === 'tenant_id') {
             if (cleanRow[field] === undefined) {
               cleanRow[field] = tenantId;
             }
           } else if (field === 'ent_id') {
             if (cleanRow[field] === undefined) {
               cleanRow[field] = entId;
             }
           } else if (field === 'id') {
             if (cleanRow[field] === undefined) {
               cleanRow[field] = uuidv4().replace(/-/g, ''); 
             }
           }
         });

         // 构建插入SQL
         const fields: string[] = [];
         const values: any[] = [];
         const placeholders: string[] = [];

         for (const col of insertableColumns) {
           if (cleanRow[col] !== undefined) {
             fields.push(`\`${col}\``);
             // 处理对象类型的值，将其序列化为 JSON 字符串
             let value = cleanRow[col];
             if (typeof value === 'object' && value !== null) {
               value = JSON.stringify(value);
             }
             values.push(value);
             placeholders.push('?');
             console.log(`Field: ${col}, Value:`, value);
           }
         }

          if (fields.length === 0) {
            errors.push(`Row has no valid data to insert`);
            console.error('No valid fields found for insertion');
            continue;
          }

          const sql = `INSERT INTO \`${tableName}\` (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
          console.log('Generated SQL:', sql);
          console.log('Values to insert:', values);
          
          const result = await this.databaseService.execute(sql, values);
          
          savedIds.push(result.insertId);
          console.log('Insert successful, insertId:', result.insertId);
        } catch (e) {
          console.error('Failed to save row:', e);
          errors.push(`Failed to save row: ${e.message}`);
        }
      }

      return {
        success: true,
        data: {
          savedCount: savedIds.length,
          savedIds,
          errors: errors.length > 0 ? errors : undefined
        }
      };
    } catch (error) {
      console.error('Save operation failed:', error);
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
