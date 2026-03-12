import { Module } from '@nestjs/common';
import { TableController } from './table.controller';
import { TableGeneratorService } from './services/table-generator.service';
import { TableExecutorService } from './services/table-executor.service';
import { DataInserterService } from './services/data-inserter.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TableController],
  providers: [
    TableGeneratorService,
    TableExecutorService,
    DataInserterService,
  ],
})
export class TableModule {}
