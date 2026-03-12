import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';

// We fetch model fields dynamically based on modelId
// In a real app this would be a database call
const fetchModelFields = async (modelId: string) => {
  const res = await fetch(`http://localhost:3000/api/models/${modelId}`);
  const data = await res.json();
  return data.fields || [];
};

@Controller('api/chat')
export class ChatController {
  @Post('stream')
  async streamChat(@Body() body: any, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const messages = body.messages || [];
    const userMessage = messages[messages.length - 1]?.content || '生成一条数据';
    const modelId = body.modelId;

    const apiKey = process.env.OPENAI_API_KEY || 'sk-placeholder';
    const baseUrl = process.env.OPENAI_BASE_URL; // e.g. https://api.openai.com/v1
    const modelName = process.env.MODEL_NAME || 'gpt-3.5-turbo';

    let fields = [];
    if (modelId) {
      try {
        fields = await fetchModelFields(modelId);
      } catch(e) {}
    }

    const fieldStr = fields.map((f: any) => `${f.prop} (${f.label}, ${f.type})`).join(', ');

    try {
      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        configuration: baseUrl ? { baseURL: baseUrl } : undefined,
        modelName: modelName,
        streaming: true,
      });

      const prompt = PromptTemplate.fromTemplate(
        "你是一个专业的数据生成Agent。请根据用户的描述，生成一个严格的JSON格式数据，不要使用Markdown代码块（如```json），只输出原始的JSON字符串。\n" +
        "强制包含以下字段：{fieldStr}。\n\n" +
        "用户描述：{userInput}\n" +
        "结果："
      );

      const chain = prompt.pipe(model).pipe(new StringOutputParser());

      const stream = await chain.stream({
        fieldStr: fieldStr || "任意字段",
        userInput: userMessage,
      });

      for await (const chunk of stream) {
        // 直接将 AI 生成的字符推流到前端
        res.write(`data: ${chunk}\n\n`);
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