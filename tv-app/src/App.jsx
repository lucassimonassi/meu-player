import React, { useCallback, useEffect, useState } from 'react';
import { FocusContext, useFocusable, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { getDeviceUid } from './device.js';
import { registerDevice } from './api.js';
import Home from './Home.jsx';
import Player from './Player.jsx';
import Focusable from './Focusable.jsx';

export default function App() {
  const { ref, focusKey } = useFocusable({ focusKey: 'root' });
  const [state, setState] = useState('loading'); // loading | inactive | error | ready
  const [device, setDevice] = useState(null);
  const [err, setErr] = useState('');
  const [plIndex, setPlIndex] = useState(0);
  const [playing, setPlaying] = useState(null);

  const check = useCallback(async () => {
    setState('loading');
    try {
      const d = await registerDevice(getDeviceUid());
      setDevice(d);
      setState(d.active && d.playlists.length ? 'ready' : 'inactive');
    } catch (e) {
      setErr(e.message || 'Sem conexao');
      setState('error');
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (state === 'inactive' || state === 'error') setTimeout(() => setFocus('retry'), 50);
  }, [state]);

  const closePlayer = useCallback(() => setPlaying(null), []);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="app">
        {state === 'loading' && <div className="center">Carregando...</div>}

        {state === 'error' && (
          <div className="center">
            <h1>Sem conexao</h1>
            <p>{err}</p>
            <Focusable focusKey="retry" className="btn" onPress={check}>
              Tentar novamente
            </Focusable>
          </div>
        )}

        {state === 'inactive' && device && (
          <div className="center">
            <h1>{device.active ? 'Nenhuma lista cadastrada' : 'Dispositivo nao ativado'}</h1>
            <p>Informe este MAC ao seu fornecedor para ativar:</p>
            <div className="mac">{device.mac}</div>
            <Focusable focusKey="retry" className="btn" onPress={check}>
              Atualizar
            </Focusable>
          </div>
        )}

        {state === 'ready' && !playing && (
          <Home
            key={plIndex}
            playlist={device.playlists[plIndex]}
            hasMultiple={device.playlists.length > 1}
            onChangePlaylist={() => setPlIndex((i) => (i + 1) % device.playlists.length)}
            onPlay={setPlaying}
          />
        )}

        {playing && <Player url={playing.url} title={playing.title} onClose={closePlayer} />}
      </div>
    </FocusContext.Provider>
  );
}
