import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TableConfigStoreProvider } from './state/TableConfigStore';

const root = createRoot(document.getElementById('root')!);
root.render(<TableConfigStoreProvider><App /></TableConfigStoreProvider>);
