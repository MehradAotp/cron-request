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
      const data = {
        module: 'API',
        method: 'Live.getLastVisitsDetails',
        idSite: process.env.MATOMO_SITE_ID,
        period: 'day',
        date: this.lastFetchTime
          ? `last${Math.ceil(
              (currentTime.getTime() - this.lastFetchTime.getTime()) / 60000,
            )}`
          : 'today',
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

      const newData = response.data;

      for (const item of newData) {
        try {
          await this.visitModel.create({
            visitorId: item.visitorId,
            userId: item.userId,
            actionDetails: item.actionDetails,
            visitInfo: {
              ...item,
              actionDetails: undefined,
            },
          });
          this.logger.debug(`Saved raw data for visitorId: ${item.visitorId}`);
        } catch (error) {
          this.logger.error(`Error saving raw data: ${error.message}`);
        }
      }

      const addedData =
        this.lastData.length === 0
          ? newData
          : newData.filter(
              (item) => !this.lastData.some((old) => old.id === item.id),
            );

      if (addedData.length > 0) {
        this.logger.log(
          `Found ${addedData.length} new items! Sending to RabbitMQ...`,
        );
        await this.sendToRabbitMQ(addedData);
        this.lastData = [...this.lastData, ...addedData];
      }

      this.lastFetchTime = currentTime;
    } catch (error) {
      this.logger.error(`Error fetching data: ${error.message}`);
    }
  }

  private async sendToRabbitMQ(data: any[]) {
    try {
      const channel = this.rabbitMQService.getChannel();
      if (!channel) {
        this.logger.error('RabbitMQ channel not available');
        return;
      }

      const urlRegex = /^https:\/\/www\.karnaval\.ir\/domestic-flights/;

      let sentMessageCount = 0;
      let totalVisits = 0;

      for (const item of data) {
        if (item.actionDetails && Array.isArray(item.actionDetails)) {
          totalVisits++;

          const validActions = item.actionDetails.filter(
            (action) =>
              action.url &&
              typeof action.url === 'string' &&
              urlRegex.test(action.url),
          );

          if (validActions.length > 0) {
            const messageData = {
              actionDetails: validActions,
              visitorId: item.visitorId,
              userId: item.userId,
            };

            const message = JSON.stringify(messageData);

            await channel.publish('n8n_exchange', '', Buffer.from(message), {
              persistent: true,
            });

            sentMessageCount++;
            this.logger.debug(
              `Published message with ${validActions.length} valid domestic flights URLs`,
            );
          }
        }
      }

      this.logger.log(
        `Total visits: ${totalVisits}, Filtered and sent: ${sentMessageCount} messages to RabbitMQ`,
      );
    } catch (error) {
      this.logger.error(`RabbitMQ Error: ${error.message}`);
    }
  }
}
