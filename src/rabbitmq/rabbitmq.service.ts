import { Injectable, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitmqService {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;

  private readonly exchange = process.env.RABBITMQ_EXCHANGE;
  private readonly queue = process.env.RABBITMQ_QUEUE;

  constructor() {}

  async connect() {
    try {
      this.connection = await amqp.connect(
        process.env.RABBITMQ_URL || 'amqp://user:secret@localhost',
      );
      this.logger.log('Connected to RabbitMQ');

      this.connection.on('error', (error) => {
        this.logger.error('RabbitMQ Connection Error:', error);
        this.reconnect();
      });

      this.connection.on('close', () => {
        this.logger.error('RabbitMQ Connection Closed');
        this.reconnect();
      });

      this.channel = await this.connection.createChannel();
      this.logger.log('Created RabbitMQ channel');

      await this.channel.assertExchange(this.exchange, 'direct', {
        durable: true,
      });
      await this.channel.assertQueue(this.queue, { durable: true });
      await this.channel.bindQueue(this.queue, this.exchange, '');
    } catch (error) {
      this.logger.error('Failed to initialize RabbitMQ:', error);
      setTimeout(() => this.connect(), 5000);
    }
  }

  async reconnect() {
    await this.cleanup();
    await this.connect();
  }

  async cleanup() {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }

  getChannel(): amqp.Channel | null {
    return this.channel;
  }
}
