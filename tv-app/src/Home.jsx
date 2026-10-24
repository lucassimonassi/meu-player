import React, { useEffect, useMemo, useState } from 'react';
import { FocusContext, useFocusable, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import Focusable from './Focusable.jsx';
import { xtreamClient, loadM3U } from './api.js';
import { isBackKey } from './config.js';

const TABS = [
  { id: 'live', label: 'TV ao vivo' },
  { id: 'vod', label: 'Filmes' },
  { id: 'series', label: 'Series' },
];

function Column({ focusKey, className, children }) {
  const { ref, focusKey: fk } = useFocusable({ focusKey, saveLastFocusedChild: true });
  return (
    <FocusContext.Provider value={fk}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </FocusContext.Provider>
  );
}

export default function Home({ playlist, onPlay, onChangePlaylist, hasMultiple }) {
  const isXtream = playlist.type === 'xtream';
  const client = useMemo(() => (isXtream ? xtreamClient(playlist) : null), [playlist, isXtream]);

  const [tab, setTab] = useState('live');
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState(null);
  const [items, setItems] = useState([]);
  const [m3u, setM3u] = useState(null);
  const [episodes, setEpisodes] = useState(null); // {title, list}
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Carrega categorias ao trocar de aba / lista
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError('');
    setItems([]);
    setEpisodes(null);
    (async () => {
      try {
        if (isXtream) {
          const fn = { live: client.liveCategories, vod: client.vodCategories, series: client.seriesCategories }[tab];
          const list = (await fn()) || [];
          if (dead) return;
          setCats(list.map((c) => ({ id: c.category_id, name: c.category_name })));
          setCat(list.length ? list[0].category_id : null);
        } else {
          const data = m3u || (await loadM3U(playlist.server_url));
          if (dead) return;
          setM3u(data);
          setCats(data.groups.map((g) => ({ id: g, name: g })));
          setCat(data.groups.length ? data.groups[0] : null);
        }
      } catch (e) {
        if (!dead) setError(e.message || 'Erro ao carregar');
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, playlist]);

  // Carrega itens ao trocar de categoria
  useEffect(() => {
    if (cat === null) return;
    let dead = false;
    setEpisodes(null);
    (async () => {
      try {
        if (isXtream) {
          const fn = { live: client.liveStreams, vod: client.vodStreams, series: client.series }[tab];
          const list = (await fn(cat)) || [];
          if (!dead) setItems(list);
        } else if (m3u) {
          if (!dead) setItems(m3u.items.filter((i) => i.group === cat));
        }
      } catch (e) {
        if (!dead) setError(e.message || 'Erro ao carregar');
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, m3u]);

  // Voltar: sai da lista de episodios
  useEffect(() => {
    const onKey = (e) => {
      if (episodes && isBackKey(e.keyCode)) {
        e.preventDefault();
        setEpisodes(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [episodes]);

  // Foca a primeira categoria quando a lista chega
  useEffect(() => {
    if (!loading && cats.length) setTimeout(() => setFocus('cats'), 50);
  }, [loading, cats.length, tab]);

  const openItem = async (it) => {
    if (!isXtream) return onPlay({ url: it.url, title: it.name });
    if (tab === 'live') return onPlay({ url: client.liveUrl(it.stream_id), title: it.name });
    if (tab === 'vod')
      return onPlay({ url: client.movieUrl(it.stream_id, it.container_extension), title: it.name });
    try {
      const info = await client.seriesInfo(it.series_id);
      const list = [];
      Object.keys(info.episodes || {}).forEach((season) =>
        info.episodes[season].forEach((ep) =>
          list.push({
            title: `T${season} E${ep.episode_num} - ${ep.title || ''}`,
            url: client.episodeUrl(ep.id, ep.container_extension),
          })
        )
      );
      setEpisodes({ title: it.name, list });
      setTimeout(() => setFocus('episodes'), 50);
    } catch (e) {
      setError(e.message);
    }
  };

  const nameOf = (it) => it.name || it.title || '';
  const shown = items.filter((i) => nameOf(i).toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="home">
      <Column focusKey="tabs" className="tabs">
        {isXtream &&
          TABS.map((t) => (
            <Focusable key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onPress={() => setTab(t.id)}>
              {t.label}
            </Focusable>
          ))}
        {!isXtream && <div className="tab active">Lista M3U</div>}
        {hasMultiple && (
          <Focusable className="tab" onPress={onChangePlaylist}>
            Trocar lista
          </Focusable>
        )}
      </Column>

      {loading && <div className="msg">Carregando...</div>}
      {error && <div className="msg err">{error}</div>}

      {!loading && !episodes && (
        <div className="body">
          <Column focusKey="cats" className="cats">
            {cats.map((c) => (
              <Focusable
                key={c.id}
                className={`cat ${cat === c.id ? 'active' : ''}`}
                onFocus={() => setCat(c.id)}
                onPress={() => setFocus('items')}
              >
                {c.name}
              </Focusable>
            ))}
          </Column>
          <div className="items-wrap">
            <input
              className="search"
              placeholder="Filtrar nesta categoria..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <Column focusKey="items" className="items">
              {shown.slice(0, 300).map((it, idx) => (
                <Focusable key={(it.stream_id || it.series_id || it.url) + '-' + idx} className="item" onPress={() => openItem(it)}>
                  {(it.stream_icon || it.cover || it.logo) && (
                    <img src={it.stream_icon || it.cover || it.logo} alt="" loading="lazy" onError={(e) => (e.target.style.display = 'none')} />
                  )}
                  <span>{nameOf(it)}</span>
                </Focusable>
              ))}
            </Column>
          </div>
        </div>
      )}

      {episodes && (
        <div className="body">
          <Column focusKey="episodes" className="items single">
            <h2>{episodes.title}</h2>
            {episodes.list.map((ep, i) => (
              <Focusable key={i} className="item" onPress={() => onPlay({ url: ep.url, title: `${episodes.title} - ${ep.title}` })}>
                <span>{ep.title}</span>
              </Focusable>
            ))}
          </Column>
        </div>
      )}
    </div>
  );
}
