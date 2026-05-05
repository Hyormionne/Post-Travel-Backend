import { RealtimeService } from './realtime.service';
import type { Server } from 'socket.io';

describe('RealtimeService', () => {
  let service: RealtimeService;
  let mockEmit: jest.Mock;
  let mockTo: jest.Mock;

  beforeEach(() => {
    service = new RealtimeService();
    mockEmit = jest.fn();
    mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
    service.setServer({ to: mockTo } as unknown as Server);
  });

  it('emitToRoom calls server.to with correct Socket.IO room key', () => {
    service.emitToRoom('room-1', 'photo:uploaded', { count: 2 });
    expect(mockTo).toHaveBeenCalledWith('travel_room:room-1');
  });

  it('emitToRoom emits the event with the given data', () => {
    service.emitToRoom('room-1', 'photo:uploaded', { count: 2 });
    expect(mockEmit).toHaveBeenCalledWith('photo:uploaded', { count: 2 });
  });

  it('emitToRoom is a no-op when server has not been set', () => {
    const fresh = new RealtimeService();
    expect(() => fresh.emitToRoom('room-1', 'test', {})).not.toThrow();
  });
});
