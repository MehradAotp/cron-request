import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { Visit, VisitSchema, MehradVisit, MehradVisitSchema } from 'src/model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Visit.name, schema: VisitSchema },
      { name: MehradVisit.name, schema: MehradVisitSchema },
    ]),
  ],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
