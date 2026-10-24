import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { isBackKey } from './config.js';

// Reproduz uma URL. HLS (.m3u8) usa hls.js (ou nativo se o navegador suportar); o resto vai direto na tag <video>.
export default function Player({ url, title, onClose }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('Carregando...');
  const [showBar, setShowBar] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    let hls;
    setStatus('Carregando...');

    const isHls = /\.m3u8(\?|$)/i.test(url);
    if (isHls && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30, enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setStatus('Nao foi possivel reproduzir este conteudo.');
      });
    } else {
      video.src = url;
      video.play().catch(() => {});
    }

    const onPlaying = () => setStatus('');
    const onWaiting = () => setStatus('Carregando...');
    const onError = () => setStatus('Nao foi possivel reproduzir este conteudo.');
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [url]);

  // Controles: voltar fecha; OK pausa; setas esq/dir pulam 10s (nao vale para ao vivo).
  useEffect(() => {
    let hideTimer;
    const flash = () => {
      setShowBar(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setShowBar(false), 3500);
    };
    flash();
    const onKey = (e) => {
      const v = videoRef.current;
      if (isBackKey(e.keyCode)) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      flash();
      if (e.keyCode === 13 || e.keyCode === 415 || e.keyCode === 19) v.paused ? v.play() : v.pause();
      else if (e.keyCode === 37 && isFinite(v.duration)) v.currentTime = Math.max(0, v.currentTime - 10);
      else if (e.keyCode === 39 && isFinite(v.duration)) v.currentTime = Math.min(v.duration, v.currentTime + 10);
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(hideTimer);
    };
  }, [onClose]);

  return (
    <div className="player">
      <video ref={videoRef} autoPlay playsInline />
      {status && <div className="player-status">{status}</div>}
      {showBar && <div className="player-bar">{title}</div>}
    </div>
  );
}
