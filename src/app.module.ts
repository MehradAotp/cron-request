import { Module } from '@nestjs/common';
import { TasksService } from './tasks/tasks.service';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ConsumerService } from './consumer/consumer.service';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Visit, VisitSchema, MehradVisit, MehradVisitSchema } from './model';
import { VisitsController } from './visits/visits.controller';
import { VisitsService } from './visits/visits.service';
import { VisitsModule } from './visits/visits.module';

(global as any).crypto = crypto;

@Module({
  imports: [
    VisitsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGO_URL') ||
          `mongodb://${configService.get('MONGODB_HOST')}:${configService.get('MONGODB_PORT')}`,
        user: configService.get<string>('MONGODB_USER'),
        pass: configService.get<string>('MONGODB_PASSWORD'),
        dbName: configService.get<string>('MONGODB_DATABASE'),
        authSource: configService.get<string>('MONGODB_AUTHSOURCE') || 'admin',
        directConnection: true,
      }),
    }),
    MongooseModule.forFeature([
      { name: Visit.name, schema: VisitSchema },
      { name: MehradVisit.name, schema: MehradVisitSchema },
    ]),
  ],
  controllers: [VisitsController],
  providers: [TasksService, ConsumerService, RabbitmqService, VisitsService],
})
export class AppModule {}
