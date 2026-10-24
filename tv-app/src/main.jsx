import React from 'react';
import { createRoot } from 'react-dom/client';
import { init } from '@noriginmedia/norigin-spatial-navigation';
import App from './App.jsx';
import './styles.css';

init({ debug: false, visualDebug: false });

createRoot(document.getElementById('root')).render(<App />);
