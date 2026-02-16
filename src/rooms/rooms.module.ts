import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { LudoGameService } from './ludo-game.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomsGateway, LudoGameService],
  exports: [RoomsService, RoomsGateway],
})
export class RoomsModule {}
