import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'MehradAotp_Gallery',
  strict: false,
})
export class Visit extends Document {
  @Prop({ required: true })
  visitorId: string;

  @Prop()
  userId: string;

  @Prop({ type: Object })
  actionDetails: any[];

  @Prop({ type: Object })
  visitInfo: any;
}

export const VisitSchema = SchemaFactory.createForClass(Visit);

@Schema({ collection: 'mehrad-urls' })
export class MehradVisit extends Document {
  @Prop({ required: true })
  visitorId: string;

  @Prop()
  userId: string;

  @Prop({ required: true })
  url: string[];

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const MehradVisitSchema = SchemaFactory.createForClass(MehradVisit);
