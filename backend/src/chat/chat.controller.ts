import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { DatabaseService } from '../database/database.service';
// import { controls } from '../data/control-type.js'
@Controller('api/chat')
export class ChatController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Post('stream')
  async streamChat(@Body() body: any, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const messages = body.messages || [];
    const userMessage = messages[messages.length - 1]?.content || '生成一条数据';
    const modelId = body.modelId;

    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL;
    const modelName = process.env.MODEL_NAME;

    let fields = [];
    if (modelId) {
      try {
        const tableName = modelId.replace(/`/g, '``');
        const columns = await this.databaseService.query(`SHOW FULL COLUMNS FROM \`${tableName}\``);
        // Exclude auto-increment ID field if desired, or keep it.
        // Usually, we don't want AI to generate the auto-increment ID.
        const excludedFields = ['id', 'create_time', 'create_by', 'create_dep_id', 'update_time', 'update_by', 'tenant_id', 'ent_id', 'pk_id'];
        const filteredColumns = columns.filter((col: any) => col.Extra !== 'auto_increment' && !excludedFields.includes(col.Field));
        
        fields = filteredColumns.map((col: any) => ({
          prop: col.Field,
          label: col.Comment || col.Field,
          type: col.Type
        }));
      } catch(e) {
        console.warn(`Failed to fetch table structure for ${modelId}`, e.message);
      }
    }

    const fieldStr = fields.map((f: any) => `${f.prop} (${f.label}, ${f.type})`).join(', ');
    const controls = {
        "rx-input": '单行文本',
        "rx-radio": '单选框',
        "rx-textarea": '单行文本',
        "rx-checkbox-list": '复选框',
        "rx-form-select": '下拉框',
        "rx-date": '日期',
        "rx-time": '时间',
        "rx-number": '数字',
        "rx-switch": '开关'
    }
    try {
      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        configuration: baseUrl ? { baseURL: baseUrl } : undefined,
        modelName: modelName,
        streaming: true,
      });

      const prompt = PromptTemplate.fromTemplate(
        "你是一个专业的数据生成Agent。请根据用户的描述，生成一个严格的JSON格式数据。\n" +
        "【重要约束】\n" +
        "1. 必须直接输出JSON对象，不能包含任何多余的解释文本。\n" +
        "2. 绝对不能使用Markdown语法（绝对不要有 ```json 等代码块标记），输出的首字符必须是 '{{'。\n" +
        "3. 强制包含以下字段：{fieldStr}。\n\n" +
        "4. 字段 control 的值 **必须** 严格从 {controls} 中选择。\n\n" +
        "用户描述：{userInput}\n" +
        "结果："
      );

      const chain = prompt.pipe(model).pipe(new StringOutputParser());

      const stream = await chain.stream({
        fieldStr: fieldStr || "任意字段",
        controls: JSON.stringify(controls),
        userInput: userMessage,
      });
      console.log(`LLM 请求成功，开始推流。`)
      for await (const chunk of stream) {
        // SSE要求每一行都必须以"data: "开头。
        // 如果 chunk 中包含换行符，会导致后续行丢失前缀，从而破坏前端 JSON 解析。
        // 所以在这里我们将多行切分，或者直接移除换行符。
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line !== undefined && line !== null) {
            // 将单字符或多字符分行推送，消除回车换行问题
            res.write(`data: ${line}\n`);
          }
        }
        res.write('\n');
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (e) {
      console.warn('LLM 请求失败，采用降级模拟数据。错误信息：', e.message);
      // 如果没有配置环境变量或者请求失败，则降级为模拟流输出，保证页面体验
      const fallbackData = { name: `智能生成人员`, age: 25, job: `全栈开发 (${userMessage.substring(0,2)})` };
      const jsonString = JSON.stringify(fallbackData);

      let i = 0;
      const interval = setInterval(() => {
        if (i < jsonString.length) {
          res.write(`data: ${jsonString[i]}\n\n`);
          i++;
        } else {
          clearInterval(interval);
          res.write(`data: [DONE]\n\n`);
          res.end();
        }
      }, 50);
    }
  }
}