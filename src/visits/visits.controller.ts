import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Body,
  Post,
} from '@nestjs/common';
import { VisitsService } from './visits.service';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get(':visitorId')
  async getVisitsByVisitorId(@Param('visitorId') visitorId: string) {
    const visits = await this.visitsService.findByVisitorId(visitorId);
    if (!visits || visits.length === 0) {
      throw new NotFoundException(
        `No visits found for visitorId: ${visitorId}`,
      );
    }
    return visits;
  }

  @Post('save-visits')
  async saveVisits(
    @Body() body: { visitorId: string; url: string[]; userId: string },
  ) {
    const savedVisits = await this.visitsService.save(
      body.visitorId,
      body.url,
      body.userId,
    );
    return savedVisits;
  }
}
