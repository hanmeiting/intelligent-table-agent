import { Controller, Post, Body, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { TableGeneratorService } from './services/table-generator.service';
import { TableExecutorService } from './services/table-executor.service';
import { DataInserterService } from './services/data-inserter.service';
import { DatabaseService } from '../database/database.service';

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

  @Get('preview/:tableName')
  async previewTableData(@Param('tableName') tableName: string) {
    try {
      const sql = `SELECT * FROM \`${tableName}\` LIMIT 10`;
      const data = await this.databaseService.query(sql);
      return { success: true, data };
    } catch (error) {
      throw new HttpException({ success: false, message: error.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
