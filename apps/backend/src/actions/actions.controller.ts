import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiaryContextGuard } from '../guards/apiary-context.guard';
import { ApiaryPermissionGuard } from '../guards/apiary-permission.guard';
import { AllowAllApiaries } from '../guards/allow-all-apiaries.decorator';
import { ActionsService } from './actions.service';
import {
  ActionFilter,
  ActionResponse,
  CreateStandaloneAction,
  UpdateAction,
  actionFilterSchema,
  createStandaloneActionSchema,
  updateActionSchema,
} from 'shared-schemas';
import { ZodValidation } from '../common';

import {
  RequestWithApiary,
  RequestWithApiaryScope,
} from '../interface/request-with.apiary';

@Controller('actions')
@UseGuards(JwtAuthGuard, ApiaryContextGuard, ApiaryPermissionGuard)
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Get()
  @AllowAllApiaries()
  @ZodValidation(actionFilterSchema)
  findAll(
    @Query() query: ActionFilter,
    @Req() req: RequestWithApiaryScope,
  ): Promise<ActionResponse[]> {
    return this.actionsService.findAll({
      ...query,
      apiaryId: req.apiaryId,
      userId: req.user.id,
      allApiaries: req.allApiaries,
    });
  }

  @Post()
  @ZodValidation(createStandaloneActionSchema)
  create(
    @Body() createActionDto: CreateStandaloneAction,
    @Req() req: RequestWithApiary,
  ): Promise<ActionResponse> {
    return this.actionsService.createStandaloneAction(
      createActionDto,
      req.apiaryId,
      req.user.id,
    );
  }

  @Put(':id')
  @ZodValidation(updateActionSchema)
  update(
    @Param('id') id: string,
    @Body() updateActionDto: UpdateAction,
    @Req() req: RequestWithApiary,
  ): Promise<ActionResponse> {
    return this.actionsService.updateAction(
      id,
      updateActionDto,
      req.apiaryId,
      req.user.id,
    );
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Req() req: RequestWithApiary,
  ): Promise<{ message: string }> {
    await this.actionsService.deleteAction(id, req.apiaryId, req.user.id);
    return { message: 'Action deleted successfully' };
  }
}
