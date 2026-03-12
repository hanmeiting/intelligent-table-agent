import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AiService } from './ai.service';

/**
 * 统一 AI 对话接口（Tool 驱动）
 * 前端只调此接口，传 messages + 可选 modelId；后端通过 bindTools 由模型选择工具并执行
 */
@Controller('api/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('stream')
  async stream(@Body() body: { messages: Array<{ role: string; content: string }>; modelId?: string }, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    await this.aiService.stream(body, res);
  }
}
