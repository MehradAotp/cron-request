import { Injectable, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitmqService {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;

  private readonly exchange = process.env.RABBITMQ_EXCHANGE;
  private readonly queue = process.env.RABBITMQ_QUEUE;
  private readonly connectionUrl = process.env.RABBITMQ_URL;
  private readonly reconnectTimeout = 5000;

  async connect() {
    try {
      await this.createConnection();
      await this.setupChannel();
    } catch (error) {
      this.logger.error('Failed to initialize RabbitMQ:', error);
      this.scheduleReconnect();
    }
  }

  private async createConnection() {
    this.connection = await amqp.connect(
      this.connectionUrl || 'amqp://user:secret@localhost',
    );
    this.logger.log('Connected to RabbitMQ');

    this.setupConnectionListeners();
  }

  private setupConnectionListeners() {
    if (!this.connection) return;

    this.connection.on('error', (error) => {
      this.logger.error('RabbitMQ Connection Error:', error);
      this.reconnect();
    });

    this.connection.on('close', () => {
      this.logger.error('RabbitMQ Connection Closed');
      this.reconnect();
    });
  }

  private async setupChannel() {
    if (!this.connection) {
      throw new Error('No RabbitMQ connection available');
    }

    this.channel = await this.connection.createChannel();
    this.logger.log('Created RabbitMQ channel');

    await this.assertExchangeAndQueue();
  }

  private async assertExchangeAndQueue() {
    if (!this.channel) return;

    await this.channel.assertExchange(this.exchange, 'direct', {
      durable: true,
    });

    await this.channel.assertQueue(this.queue, { durable: true });
    await this.channel.bindQueue(this.queue, this.exchange, '');
  }

  private scheduleReconnect() {
    setTimeout(() => this.connect(), this.reconnectTimeout);
  }

  async reconnect() {
    await this.cleanup();
    await this.connect();
  }

  async cleanup() {
    try {
      await this.closeChannel();
      await this.closeConnection();
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }

  private async closeChannel() {
    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }
  }

  private async closeConnection() {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  getChannel(): amqp.Channel | null {
    return this.channel;
  }
}
