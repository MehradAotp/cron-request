import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Visit, MehradVisit } from 'src/model';

@Injectable()
export class VisitsService {
  constructor(
    @InjectModel(Visit.name) private readonly visitModel: Model<Visit>,
    @InjectModel(MehradVisit.name)
    private readonly mehradVisitModel: Model<MehradVisit>,
  ) {}

  async findByVisitorId(visitorId: string) {
    return this.visitModel.find({ visitorId }).exec();
  }

  async save(visitorId: string, urls: string[], userId: string) {
    const existingVisit = await this.mehradVisitModel
      .findOne({ visitorId })
      .exec();

    if (existingVisit) {
      return this.mehradVisitModel.findOneAndUpdate(
        { visitorId },
        { url: urls, userId },
        { new: true },
      );
    }

    const visitDocument = {
      visitorId,
      url: urls,
      userId,
    };

    return this.mehradVisitModel.create(visitDocument);
  }
}
