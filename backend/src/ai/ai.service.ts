import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { DatabaseService } from '../database/database.service';
import { TableGeneratorService } from '../table/services/table-generator.service';
import { getAllToolDefinitions, TOOL_NAMES } from '../tools/tools.registry';
import {
  ROW_DATA_PROMPT_TEMPLATE,
  ROW_DATA_CONTROLS,
  ROW_DATA_EXCLUDED_FIELDS,
} from '../tools/generate-row-data.tool';

/** 前端收到的 SSE 事件类型 */
export const SSE_TYPE = {
  TOOL_CALL: 'tool_call',
  TOOL_STREAM: 'tool_stream',
  TOOL_RESULT: 'tool_result',
  DONE: 'done',
  ERROR: 'error',
} as const;

function writeSSE(res: Response, payload: object) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tableGeneratorService: TableGeneratorService,
  ) {}

  /**
   * 统一 AI 流式接口：bindTools 让模型选择工具，执行后通过 SSE 返回（带 toolName 告知前端）
   */
  async stream(body: { messages: Array<{ role: string; content: string }>; modelId?: string }, res: Response): Promise<void> {
    const messages = body.messages || [];
    const modelId = body.modelId;
    const lastContent = (messages[messages.length - 1] as { content?: string })?.content ?? '';

    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL;
    const modelName = process.env.MODEL_NAME || 'gpt-3.5-turbo';

    try {
      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        configuration: baseUrl ? { baseURL: baseUrl } : undefined,
        modelName,
      });

      const tools = getAllToolDefinitions();
      const modelWithTools = model.bindTools(tools);

      const systemParts = [
        '你是一个智能助手，根据用户意图必须选择并调用下面其中一个工具，不要只回复文字。',
        '当用户想「创建表、设计表结构、生成某某表/某某单」时，调用 generate_table_schema，参数传用户的原始描述。',
        '当用户想「生成一条数据、添加一条记录、帮我生成一条某某」且当前有模型上下文(modelId)时，调用 generate_row_data，参数传用户描述。若无 modelId 则用 generate_table_schema 或说明需要先选择模型。',
      ];
      if (modelId) {
        systemParts.push(`当前上下文：用户正在模型详情页，modelId 为 ${modelId}。若用户要生成数据，请调用 generate_row_data。`);
      }

      const langchainMessages = [
        new SystemMessage(systemParts.join('\n')),
        ...messages.map((m) =>
          m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
        ),
      ];
      if (messages.length === 0) {
        langchainMessages.push(new HumanMessage(lastContent || '你好'));
      }

      const response = await modelWithTools.invoke(langchainMessages);
      const toolCalls = (response as any).tool_calls;

      if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
        const tc = toolCalls[0];
        const toolName = typeof tc.name === 'string' ? tc.name : (tc as any).name;
        let args: Record<string, unknown> = {};
        try {
          args = typeof tc.args === 'string' ? JSON.parse(tc.args) : { ...(tc.args || {}) };
        } catch {
          args = { description: lastContent };
        }

        writeSSE(res, { type: SSE_TYPE.TOOL_CALL, toolName });

        if (toolName === TOOL_NAMES.GENERATE_TABLE_SCHEMA) {
          await this.runGenerateTableSchema(args, res);
        } else if (toolName === TOOL_NAMES.GENERATE_ROW_DATA) {
          await this.runGenerateRowData({ ...args, modelId }, res);
        } else {
          writeSSE(res, { type: SSE_TYPE.TOOL_RESULT, toolName, payload: { message: '未知工具' } });
        }
      } else {
        const content = typeof (response as any).content === 'string' ? (response as any).content : '';
        writeSSE(res, { type: SSE_TYPE.TOOL_STREAM, toolName: 'assistant', chunk: content });
      }

      writeSSE(res, { type: SSE_TYPE.DONE });
    } catch (e) {
      this.logger.warn('AI stream error', e);
      writeSSE(res, { type: SSE_TYPE.ERROR, message: (e as Error).message });
    } finally {
      res.end();
    }
  }

  private async runGenerateTableSchema(args: Record<string, unknown>, res: Response): Promise<void> {
    const description = (args.description as string) || '';
    try {
      const schema = await this.tableGeneratorService.generateTableSchema(description);
      const jsonStr = JSON.stringify(schema);
      for (const ch of jsonStr) {
        writeSSE(res, { type: SSE_TYPE.TOOL_STREAM, toolName: TOOL_NAMES.GENERATE_TABLE_SCHEMA, chunk: ch });
      }
      writeSSE(res, { type: SSE_TYPE.TOOL_RESULT, toolName: TOOL_NAMES.GENERATE_TABLE_SCHEMA, payload: schema });
    } catch (e) {
      writeSSE(res, { type: SSE_TYPE.ERROR, message: (e as Error).message });
    }
  }

  private async runGenerateRowData(
    args: Record<string, unknown> & { modelId?: string },
    res: Response,
  ): Promise<void> {
    const description = (args.description as string) || '';
    const modelId = args.modelId;

    if (!modelId) {
      writeSSE(res, { type: SSE_TYPE.TOOL_RESULT, toolName: TOOL_NAMES.GENERATE_ROW_DATA, payload: { error: '缺少 modelId' } });
      return;
    }

    let fields: Array<{ prop: string; label: string; type: string }> = [];
    try {
      const tableName = String(modelId).replace(/`/g, '``');
      const columns = await this.databaseService.query(`SHOW FULL COLUMNS FROM \`${tableName}\``);
      const filtered = (columns as any[]).filter(
        (col) => col.Extra !== 'auto_increment' && !ROW_DATA_EXCLUDED_FIELDS.includes(col.Field),
      );
      fields = filtered.map((col) => ({
        prop: col.Field,
        label: col.Comment || col.Field,
        type: col.Type,
      }));
    } catch (e) {
      this.logger.warn(`Failed to get columns for ${modelId}`, e);
      writeSSE(res, { type: SSE_TYPE.TOOL_RESULT, toolName: TOOL_NAMES.GENERATE_ROW_DATA, payload: { error: '无法获取表结构' } });
      return;
    }

    const fieldStr = fields.map((f) => `${f.prop} (${f.label}, ${f.type})`).join(', ');
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL;
    const modelName = process.env.MODEL_NAME || 'gpt-3.5-turbo';

    try {
      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        configuration: baseUrl ? { baseURL: baseUrl } : undefined,
        modelName,
        streaming: true,
      });
      const prompt = PromptTemplate.fromTemplate(ROW_DATA_PROMPT_TEMPLATE);
      const chain = prompt.pipe(model).pipe(new StringOutputParser());
      const stream = await chain.stream({
        fieldStr: fieldStr || '任意字段',
        controls: JSON.stringify(ROW_DATA_CONTROLS),
        userInput: description,
      });

      for await (const chunk of stream) {
        const lines = String(chunk).split('\n');
        for (const line of lines) {
          if (line != null && line !== '') {
            writeSSE(res, { type: SSE_TYPE.TOOL_STREAM, toolName: TOOL_NAMES.GENERATE_ROW_DATA, chunk: line });
          }
        }
      }
    } catch (e) {
      this.logger.warn('generate_row_data stream error', e);
      writeSSE(res, { type: SSE_TYPE.ERROR, message: (e as Error).message });
    }
  }
}
