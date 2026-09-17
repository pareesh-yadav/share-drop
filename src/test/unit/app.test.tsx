import { describe, it } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import App from '../../App';
import RoomPage from '../../pages/RoomPage';
import JoinPage from '../../pages/JoinPage';
import SettingsPage from '../../pages/SettingsPage';
import HistoryPage from '../../pages/HistoryPage';
import HelpPage from '../../pages/HelpPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockCtx: any = {
  createRoom: async () => '123',
  joinRoom: async () => true,
  leaveRoom: () => {},
  sendFiles: async () => {},
  acceptTransfer: () => {},
  rejectTransfer: () => {},
  cancelTransfer: () => {},
  connectToPeer: async () => {},
  isLocalMode: false,
};

describe('Route render tests', () => {
  it('renders App without crashing', () => {
    render(<App />);
  });

  it('renders RoomPage', () => {
    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <Routes>
          <Route path="/room/:roomId" element={<RoomPage ctx={mockCtx} />} />
        </Routes>
      </MemoryRouter>
    );
  });

  it('renders JoinPage', () => {
    render(
      <MemoryRouter initialEntries={['/join/token123']}>
        <Routes>
          <Route path="/join/:token" element={<JoinPage ctx={mockCtx} />} />
        </Routes>
      </MemoryRouter>
    );
  });

  it('renders SettingsPage', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );
  });

  it('renders HistoryPage', () => {
    render(
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </MemoryRouter>
    );
  });

  it('renders HelpPage', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <Routes>
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </MemoryRouter>
    );
  });
});
