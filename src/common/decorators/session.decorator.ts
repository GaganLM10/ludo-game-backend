import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetSession = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const session = request.session;

    return data ? session?.[data] : session;
  },
);

export const GetPlayerId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.session?.playerId;
  },
);

export const GetRoomCode = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.session?.roomCode;
  },
);
