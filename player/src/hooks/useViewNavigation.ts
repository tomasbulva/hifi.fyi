/**
 * Router compatibility shim.
 * 
 * Components that used to call setView('player') from MusicContext
 * can import these helpers instead. They wrap react-router's navigate.
 */

import { useNavigate } from 'react-router-dom';

export function useViewNavigation() {
  const navigate = useNavigate();
  
  return {
    goToPlayer: () => navigate('/player'),
    goToLibrary: () => navigate('/library'),
    goToSettings: () => navigate('/settings'),
    goToVisualization: () => navigate('/visualization'),
    goBack: () => window.history.back(),
  };
}
