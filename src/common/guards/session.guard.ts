import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const session = request.session;

    if (!session || !session.playerId) {
      throw new UnauthorizedException('No active session found');
    }

    return true;
  }
}

@Injectable()
export class RoomSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const session = request.session;

    if (!session || !session.playerId || !session.roomCode) {
      throw new UnauthorizedException(
        'You must be in a room to perform this action',
      );
    }

    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const session = request.session;

    if (!session || !session.playerId || !session.isAdmin) {
      throw new UnauthorizedException('Only room admin can perform this action');
    }

    return true;
  }
}
