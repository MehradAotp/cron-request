import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service';

@Injectable()
export class ConsumerService implements OnModuleInit {
  private readonly logger = new Logger(ConsumerService.name);

  constructor(private readonly rabbitMQService: RabbitmqService) {}

  async onModuleInit() {
    await this.rabbitMQService.connect();
    const channel = this.rabbitMQService.getChannel();
    if (channel) {
      await channel.assertQueue('n8n_queue', {
        durable: true,
      });

      channel.consume('n8n_queue', async (msg) => {
        if (msg) {
          try {
            const visitData = JSON.parse(msg.content.toString());
            const visitorId = visitData.visitorId;

            this.logger.debug(`Processing visitorId: ${visitorId}`);

            const urlRegex = /^https:\/\/www\.karnaval\.ir\/domestic-flights/;

            const validActions =
              visitData.actionDetails?.filter(
                (action) =>
                  action.url &&
                  typeof action.url === 'string' &&
                  urlRegex.test(action.url),
              ) || [];

            if (validActions.length === 0) {
              this.logger.debug(
                `Skipping message - No valid domestic flights URL found for visitorId: ${visitorId}`,
              );
              channel.reject(msg, false);
              return;
            }

            this.logger.log(
              `Processed message for visitorId: ${visitorId} with ${validActions.length} valid domestic flights URLs`,
            );
            channel.ack(msg);
          } catch (error) {
            this.logger.error('Error processing message:', error);
            channel.reject(msg, false);
          }
        }
      });
    }
  }
}
