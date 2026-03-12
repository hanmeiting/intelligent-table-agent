import { Controller, Get, Post, Body, Param, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { DatabaseService } from '../database/database.service';

@Controller('api/models')
export class ModelsController {
  private readonly logger = new Logger(ModelsController.name);

  constructor(private readonly databaseService: DatabaseService) {}
  
  @Get()
  async getAllModels() {
    try {
      const sql = 'SELECT * FROM `system_models` ORDER BY created_at DESC';
      const rows = await this.databaseService.query(sql);
      
      // 解析 JSON 字段
      return rows.map((row: any) => ({
        id: String(row.id),
        name: row.name,
        tableName: row.tableName,
        description: row.description,
        fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : (row.fields || [])
      }));
    } catch (e) {
      // 如果表不存在，返回空数组
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return [];
      }
      this.logger.error('Failed to get models from db', e);
      return [];
    }
  }

  @Get(':id')
  async getModelById(@Param('id') id: string) {
    try {
      const sql = 'SELECT * FROM `system_models` WHERE tableName = ?';
      const rows = await this.databaseService.query(sql, [id]);
      
      if (rows && rows.length > 0) {
        const row = rows[0];
        return {
          id: String(row.id),
          name: row.name,
          tableName: row.tableName,
          description: row.description,
          fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : (row.fields || [])
        };
      }
      return {};
    } catch (e) {
      this.logger.error(`Failed to get model by id ${id}`, e);
      return {};
    }
  }

  @Post()
  createModel(@Body() modelData: any) {
    // 保留给侧边栏AI生成模型快速保存的兼容接口
    // 后续建议前端侧边栏建表也走到 /api/table/create 走统一建表流程
    return { ...modelData, id: String(Date.now()) };
  }

  @Post('generate')
  async generateModelStream(@Body() body: any, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const description = body.description || '创建一个表';
    const apiKey = process.env.OPENAI_API_KEY || 'sk-placeholder';
    const baseUrl = process.env.OPENAI_BASE_URL;
    const modelName = process.env.MODEL_NAME || 'gpt-3.5-turbo';

    try {
      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        configuration: baseUrl ? { baseURL: baseUrl } : undefined,
        modelName: modelName,
        streaming: true,
      });

      const prompt = PromptTemplate.fromTemplate(
        "你是一个专业的数据库架构师。请根据用户的描述，设计一个表结构模型，并严格返回JSON格式数据，不要使用Markdown代码块（如```json）。\n" +
        "返回的JSON必须包含以下结构：\n" +
        "{{\n" +
        "  \"name\": \"中文表名（如：订单表）\",\n" +
        "  \"tableName\": \"英文表名（如：orders）\",\n" +
        "  \"description\": \"表的作用描述\",\n" +
        "  \"fields\": [\n" +
        "    {{ \"prop\": \"英文小写字段名\", \"label\": \"中文列名\", \"type\": \"字段类型(string/number/date等)\" }}\n" +
        "  ]\n" +
        "}}\n\n" +
        "用户描述：{userInput}\n" +
        "结果："
      );

      const chain = prompt.pipe(model).pipe(new StringOutputParser());
      const stream = await chain.stream({ userInput: description });

      for await (const chunk of stream) {
        res.write(`data: ${chunk}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (e) {
      console.warn('Model Gen Failed:', e.message);
      res.write(`data: {"error": "Failed"}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
}
