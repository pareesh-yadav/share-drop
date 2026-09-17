import { describe, it, expect } from 'vitest';
import { LocalSignalingTransport, findRoomMatch } from '../../services/signaling/LocalSignalingTransport';

describe('LocalSignalingTransport', () => {
  it('creates and joins rooms across separate transport instances', async () => {
    const tab1 = new LocalSignalingTransport();
    const tab2 = new LocalSignalingTransport();

    await tab1.connect();
    await tab2.connect();

    // Tab 1 creates a room
    const { room: createdRoom, myPeerId: peer1Id } = await tab1.createRoom('Tab 1 Host', 'desktop');
    expect(createdRoom.id).toBeTruthy();
    expect(peer1Id).toBeTruthy();

    // Tab 2 joins using the same room code
    const { room: joinedRoom, myPeerId: peer2Id } = await tab2.joinRoom(createdRoom.id, 'Tab 2 Client', 'mobile');
    expect(joinedRoom.id).toBe(createdRoom.id);
    expect(peer2Id).not.toBe(peer1Id);

    // Tab 2 can also match with fuzzy 0/O substitution
    const fuzzyCode = createdRoom.id.includes('0')
      ? createdRoom.id.replace(/0/g, 'O')
      : createdRoom.id.replace(/O/g, '0');

    const matched = findRoomMatch(fuzzyCode);
    expect(matched?.id).toBe(createdRoom.id);

    tab1.disconnect();
    tab2.disconnect();
  });
});
