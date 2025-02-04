import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Visit } from 'src/model';
import axios from 'axios';
import * as qs from 'qs';
import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service';
import * as amqp from 'amqplib';

@Injectable()
export class TasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasksService.name);
  private lastData: { id: string }[] = [];
  private lastFetchTime: Date | null = null;

  constructor(
    private readonly rabbitMQService: RabbitmqService,
    @InjectModel(Visit.name) private readonly visitModel: Model<Visit>,
  ) {}

  async onModuleInit() {
    await this.rabbitMQService.connect();
    const channel = this.rabbitMQService.getChannel();
    if (channel) {
      await channel.assertExchange('n8n_exchange', 'direct', {
        durable: true,
      });

      await channel.assertQueue('n8n_queue', {
        durable: true,
      });

      await channel.bindQueue('n8n_queue', 'n8n_exchange', '');

      await this.handleCron();
    }
  }

  async onModuleDestroy() {
    await this.rabbitMQService.cleanup();
  }

  @Cron('0 */2 * * * *', {
    name: 'matomo-fetch',
  })
  async handleCron() {
    this.logger.log('Executing cron job...');

    try {
      const currentTime = new Date();
      const data = await this.fetchMatomoData(currentTime);
      await this.processVisitData(data);
      await this.handleNewData(data, currentTime);
    } catch (error) {
      this.logger.error(`Error in cron job: ${error.message}`);
    }
  }

  private async fetchMatomoData(currentTime: Date) {
    const data = {
      module: 'API',
      method: 'Live.getLastVisitsDetails',
      idSite: process.env.MATOMO_SITE_ID,
      period: 'day',
      date: this.getDateParam(currentTime),
      format: 'json',
      filter_limit: process.env.MATOMO_FILTER_LIMIT,
      token_auth: process.env.MATOMO_TOKEN_AUTH,
    };

    const response = await axios.post(
      process.env.MATOMO_URL,
      qs.stringify(data),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000,
      },
    );

    return response.data;
  }

  private getDateParam(currentTime: Date): string {
    if (!this.lastFetchTime) return 'today';

    const minutesDiff = Math.ceil(
      (currentTime.getTime() - this.lastFetchTime.getTime()) / 60000,
    );
    return `last${minutesDiff}`;
  }

  private async processVisitData(data: any[]) {
    for (const item of data) {
      try {
        await this.saveVisit(item);
      } catch (error) {
        this.logger.error(`Error saving visit data: ${error.message}`);
      }
    }
  }

  private async saveVisit(item: any) {
    const visitData = {
      visitorId: item.visitorId,
      userId: item.userId,
      actionDetails: item.actionDetails,
      visitInfo: {
        ...item,
        actionDetails: undefined,
      },
    };

    await this.visitModel.create(visitData);
    this.logger.debug(`Saved raw data for visitorId: ${item.visitorId}`);
  }

  private async handleNewData(newData: any[], currentTime: Date) {
    const addedData = this.getNewItems(newData);

    if (addedData.length > 0) {
      this.logger.log(
        `Found ${addedData.length} new items! Sending to RabbitMQ...`,
      );
      await this.sendToRabbitMQ(addedData);
      this.lastData = [...this.lastData, ...addedData];
    }

    this.lastFetchTime = currentTime;
  }

  private getNewItems(newData: any[]): any[] {
    if (this.lastData.length === 0) return newData;

    return newData.filter(
      (item) => !this.lastData.some((old) => old.id === item.id),
    );
  }

  private async sendToRabbitMQ(data: any[]) {
    try {
      const channel = this.rabbitMQService.getChannel();
      if (!channel) {
        throw new Error('RabbitMQ channel not available');
      }

      const urlRegex = /^https:\/\/www\.karnaval\.ir\/domestic-flights/;
      let sentMessageCount = 0;
      let totalVisits = 0;

      for (const item of data) {
        const messageData = this.prepareMessageData(item, urlRegex);
        if (messageData) {
          await this.publishMessage(channel, messageData);
          sentMessageCount++;
        }
        totalVisits++;
      }

      this.logger.log(
        `Total visits: ${totalVisits}, Filtered and sent: ${sentMessageCount} messages to RabbitMQ`,
      );
    } catch (error) {
      this.logger.error(`RabbitMQ Error: ${error.message}`);
    }
  }

  private prepareMessageData(item: any, urlRegex: RegExp) {
    if (!item.actionDetails?.length) return null;

    const validActions = item.actionDetails.filter(
      (action) =>
        action.url &&
        typeof action.url === 'string' &&
        urlRegex.test(action.url),
    );

    if (validActions.length === 0) return null;

    return {
      actionDetails: validActions,
      visitorId: item.visitorId,
      userId: item.userId,
    };
  }

  private async publishMessage(channel: amqp.Channel, messageData: any) {
    const message = JSON.stringify(messageData);
    await channel.publish(
      process.env.RABBITMQ_EXCHANGE,
      '',
      Buffer.from(message),
      { persistent: true },
    );
    this.logger.debug(
      `Published message with ${messageData.actionDetails.length} valid domestic flights URLs`,
    );
  }
}
