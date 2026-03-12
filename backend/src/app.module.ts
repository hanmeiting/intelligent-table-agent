import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatController } from './chat/chat.controller';
import { ModelsController } from './models/models.controller';
import { DatabaseModule } from './database/database.module';
import { TableModule } from './table/table.module';

@Module({
  imports: [ConfigModule.forRoot(), DatabaseModule, TableModule],
  controllers: [AppController, ChatController, ModelsController],
  providers: [AppService],
})
export class AppModule {}
