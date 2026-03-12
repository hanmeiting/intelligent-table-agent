import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TableModule } from '../table/table.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [DatabaseModule, TableModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
