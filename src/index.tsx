// index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import FlipCard from './components/FlipCard'; // Your component file

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(<FlipCard />);