import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  Min,
  Max,
  Length,
  Matches,
} from 'class-validator';
import { PlayerColor } from '../entities/player.entity';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 20, { message: 'Player name must be between 1 and 20 characters' })
  playerName: string;

  @IsEnum(PlayerColor, { message: 'Invalid player color' })
  playerColor: PlayerColor;

  @IsNumber()
  @Min(2, { message: 'Minimum 2 players required' })
  @Max(4, { message: 'Maximum 4 players allowed' })
  maxPlayers: number;
}

export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{4}-[0-9]{4}$/, {
    message: 'Invalid room code format (should be XXXX-XXXX)',
  })
  roomCode: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 20, { message: 'Player name must be between 1 and 20 characters' })
  playerName: string;
}

export class UpdatePlayerColorDto {
  @IsEnum(PlayerColor, { message: 'Invalid player color' })
  newColor: PlayerColor;
}

export class UpdatePlayerReadyDto {
  // No body needed - we toggle based on current state
}

export class StartGameDto {
  // No body needed - admin can start when all ready
}

export class LeaveRoomDto {
  // No body needed - player leaves their current room
}
