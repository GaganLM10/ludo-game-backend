import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500, { message: 'Message cannot exceed 500 characters' })
  message: string;
}

export class ChatMessageResponse {
  id: string;
  playerId: string;
  playerName: string;
  playerColor: string;
  message: string;
  timestamp: Date;
  type: 'player' | 'system';
}
