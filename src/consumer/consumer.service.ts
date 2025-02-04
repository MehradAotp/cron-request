import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service';
import { Channel, ConsumeMessage } from 'amqplib';

interface VisitData {
  visitorId: string;
  userId: string;
  actionDetails: Array<{
    url: string;
    [key: string]: any;
  }>;
}

@Injectable()
export class ConsumerService implements OnModuleInit {
  private readonly logger = new Logger(ConsumerService.name);
  private readonly urlRegex = /^https:\/\/www\.karnaval\.ir\/domestic-flights/;
  private readonly queueName = process.env.RABBITMQ_QUEUE || 'n8n_queue';

  constructor(private readonly rabbitMQService: RabbitmqService) {}

  async onModuleInit() {
    await this.initializeConsumer();
  }

  private async initializeConsumer() {
    await this.rabbitMQService.connect();
    const channel = this.rabbitMQService.getChannel();

    if (channel) {
      await this.setupQueue(channel);
      await this.startConsuming(channel);
    }
  }

  private async setupQueue(channel: Channel) {
    await channel.assertQueue(this.queueName, {
      durable: true,
    });
  }

  private async startConsuming(channel: Channel) {
    channel.consume(this.queueName, async (msg) => {
      if (msg) {
        await this.processMessage(channel, msg);
      }
    });
  }

  private async processMessage(channel: Channel, msg: ConsumeMessage) {
    try {
      const visitData = this.parseMessage(msg);

      if (this.isValidVisitData(visitData)) {
        await this.handleValidMessage(channel, msg, visitData);
      } else {
        this.handleInvalidMessage(channel, msg, visitData.visitorId);
      }
    } catch (error) {
      this.logger.error('Error processing message:', error);
      channel.reject(msg, false);
    }
  }

  private parseMessage(msg: ConsumeMessage): VisitData {
    return JSON.parse(msg.content.toString());
  }

  private isValidVisitData(visitData: VisitData): boolean {
    const validActions = this.getValidActions(visitData);
    return validActions.length > 0;
  }

  private getValidActions(visitData: VisitData) {
    return (
      visitData.actionDetails?.filter(
        (action) =>
          action.url &&
          typeof action.url === 'string' &&
          this.urlRegex.test(action.url),
      ) || []
    );
  }

  private async handleValidMessage(
    channel: Channel,
    msg: ConsumeMessage,
    visitData: VisitData,
  ) {
    const validActions = this.getValidActions(visitData);
    this.logger.log(
      `Processed message for visitorId: ${visitData.visitorId} with ${validActions.length} valid domestic flights URLs`,
    );
    channel.ack(msg);
  }

  private handleInvalidMessage(
    channel: Channel,
    msg: ConsumeMessage,
    visitorId: string,
  ) {
    this.logger.debug(
      `Skipping message - No valid domestic flights URL found for visitorId: ${visitorId}`,
    );
    channel.reject(msg, false);
  }
}
